// Brand store events -> L-Beauty: fulfillment + tracking, cancellations, refunds.

import db from "../../db.server";
import { alert, logEvent } from "../alerts.server";
import { config, isMarketplace } from "../config.server";
import { enqueue, PermanentError } from "../jobs.server";
import { adminFor, assertNoUserErrors, gql } from "../shopify-api.server";
import { legacyId, toGid } from "../core/gid.ts";
import { planFulfillment, type LbFulfillmentOrder } from "../core/fulfillment-plan.ts";
import { refundValue } from "../core/reconciliation.ts";
import { fromMinor } from "../core/money.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LB_FULFILLMENT_ORDERS = `#graphql
  query LbBridgeFulfillmentOrders($id: ID!) {
    order(id: $id) {
      id
      fulfillmentOrders(first: 50) {
        nodes {
          id
          status
          lineItems(first: 250) { nodes { id remainingQuantity lineItem { id } } }
        }
      }
    }
  }`;

const FULFILLMENT_CREATE = `#graphql
  mutation LbBridgeFulfillmentCreate($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment { id status }
      userErrors { field message }
    }
  }`;

const TRACKING_UPDATE = `#graphql
  mutation LbBridgeTrackingUpdate($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!) {
    fulfillmentTrackingInfoUpdate(fulfillmentId: $fulfillmentId, trackingInfoInput: $trackingInfoInput, notifyCustomer: true) {
      fulfillment { id }
      userErrors { field message }
    }
  }`;

const ORDER_REFUNDABLE_LINES = `#graphql
  query LbBridgeOrderRefundableLines($id: ID!) {
    order(id: $id) {
      id
      lineItems(first: 250) {
        nodes { id refundableQuantity }
      }
    }
  }`;

const SUGGESTED_REFUND = `#graphql
  query LbBridgeSuggestedRefund($id: ID!, $refundLineItems: [RefundLineItemInput!]!) {
    order(id: $id) {
      id
      suggestedRefund(refundLineItems: $refundLineItems) {
        amountSet {
          shopMoney { amount currencyCode }
          presentmentMoney { amount currencyCode }
        }
        suggestedTransactions {
          amountSet {
            shopMoney { amount currencyCode }
            presentmentMoney { amount currencyCode }
          }
          gateway
          kind
          parentTransaction { id }
        }
      }
    }
  }`;

const REFUND_CREATE = `#graphql
  mutation LbBridgeRefundCreate($input: RefundInput!, $idempotencyKey: String!) {
    refundCreate(input: $input) @idempotent(key: $idempotencyKey) {
      refund { id }
      userErrors { field message }
    }
  }`;

async function mirrorRefundToShop(
  admin: any,
  orderGid: string,
  wantedLines: { lineItemId: string; quantity: number }[],
  note: string,
  notify: boolean,
  idempotencyKey: string,
): Promise<string | null> {
  if (!wantedLines.length) return null;
  const orderData = await gql(admin, ORDER_REFUNDABLE_LINES, { id: orderGid });
  const refundableByLine = new Map<string, number>();
  for (const node of orderData?.order?.lineItems?.nodes ?? []) {
    refundableByLine.set(node.id, Number(node.refundableQuantity ?? 0));
  }

  const refundLineItems = wantedLines
    .map((w) => {
      const maxQty = refundableByLine.get(w.lineItemId) ?? 0;
      const quantity = Math.min(w.quantity, maxQty);
      return {
        lineItemId: w.lineItemId,
        quantity,
        restockType: "NO_RESTOCK",
      };
    })
    .filter((item) => item.quantity > 0);

  if (!refundLineItems.length) return null;

  const sugData = await gql(admin, SUGGESTED_REFUND, { id: orderGid, refundLineItems });
  const suggested = sugData?.order?.suggestedRefund;
  const currency =
    suggested?.amountSet?.presentmentMoney?.currencyCode ??
    suggested?.amountSet?.shopMoney?.currencyCode ??
    undefined;
  const transactions = (suggested?.suggestedTransactions ?? []).map((t: any) => ({
    orderId: orderGid,
    kind: "REFUND",
    gateway: t.gateway,
    amount:
      t.amountSet?.presentmentMoney?.amount ??
      t.amountSet?.shopMoney?.amount ??
      t.amount,
    ...(t.parentTransaction?.id ? { parentId: t.parentTransaction.id } : {}),
  }));

  const res = await gql(admin, REFUND_CREATE, {
    idempotencyKey,
    input: {
      orderId: orderGid,
      ...(currency ? { currency } : {}),
      note,
      notify,
      refundLineItems,
      transactions,
    },
  });
  assertNoUserErrors("Refund sync failed", res?.refundCreate?.userErrors);
  const createdId = res?.refundCreate?.refund?.id;
  return createdId ? legacyId(createdId) : null;
}

function tracking(p: any) {
  return {
    number: p.tracking_number ?? p.tracking_numbers?.[0] ?? null,
    company: p.tracking_company ?? null,
    url: p.tracking_url ?? p.tracking_urls?.[0] ?? null,
  };
}

/** Job: a brand created or updated a fulfillment on one of our orders. */
export async function brandFulfillment({ shop, payload }: { shop: string; payload: any }) {
  const bo = await db.brandOrder.findUnique({
    where: { brandOrderId: toGid("Order", payload.order_id) },
    include: { lines: true, fulfillments: true, brand: true },
  });
  if (!bo || bo.brand.shopDomain !== shop) return; // not an L-Beauty order
  if (bo.isTest) {
    await logEvent(bo.id, "TEST_FULFILLED", `Brand fulfilled test order (${payload.status})`);
    return;
  }

  const brandFulfillmentId = toGid("Fulfillment", payload.id);
  const t = tracking(payload);
  const existing = bo.fulfillments.find((f) => f.brandFulfillmentId === brandFulfillmentId);
  const lbAdmin = await adminFor(config.marketplaceShop);

  if (payload.status === "cancelled") {
    if (existing) {
      await db.fulfillmentLink.update({ where: { id: existing.id }, data: { status: "cancelled" } });
    }
    await logEvent(bo.id, "BRAND_FULFILLMENT_CANCELLED", `Brand cancelled fulfillment ${payload.name ?? payload.id}`, "warning");
    await alert("warning", `${bo.brand.name} cancelled a shipment on ${bo.lbOrderName} — check the L-Beauty fulfillment.`);
    return;
  }
  if (payload.status !== "success") return; // pending/open: wait for the update webhook

  // Tracking update on a fulfillment we already mirrored.
  if (existing?.lbFulfillmentId) {
    if (bo.status === "TRANSFERRED" && bo.lines.some((l) => l.fulfilledQty > 0)) {
      const done = bo.lines.every((l) => l.fulfilledQty >= l.quantity);
      await db.brandOrder.update({
        where: { id: bo.id },
        data: done
          ? { status: "FULFILLED", fulfilledAt: bo.fulfilledAt ?? new Date(), lastError: null }
          : { status: "PARTIALLY_FULFILLED", lastError: null },
      });
    }
    const changed =
      existing.trackingNumber !== t.number ||
      existing.trackingCompany !== t.company ||
      existing.trackingUrl !== t.url;
    if (!changed || !t.number) return;
    const data = await gql(lbAdmin, TRACKING_UPDATE, {
      fulfillmentId: existing.lbFulfillmentId,
      trackingInfoInput: { number: t.number, company: t.company, url: t.url },
    });
    assertNoUserErrors("Tracking update failed", data?.fulfillmentTrackingInfoUpdate?.userErrors);
    await db.fulfillmentLink.update({
      where: { id: existing.id },
      data: { trackingNumber: t.number, trackingCompany: t.company, trackingUrl: t.url },
    });
    await logEvent(bo.id, "TRACKING_UPDATED", `Tracking ${t.company ?? ""} ${t.number}`.trim());
    return;
  }

  // New fulfillment: map brand line items -> L-Beauty line items.
  const byBrandLine = new Map(bo.lines.filter((l) => l.brandLineItemId).map((l) => [l.brandLineItemId!, l]));
  const wanted = new Map<string, number>();
  for (const li of payload.line_items ?? []) {
    const line = byBrandLine.get(toGid("LineItem", li.id));
    if (line) wanted.set(line.lbLineItemId, (wanted.get(line.lbLineItemId) ?? 0) + Number(li.quantity));
  }
  if (!wanted.size) {
    throw new PermanentError(`Fulfillment ${payload.id} has no lines that match ${bo.lbOrderName}`);
  }

  const foData = await gql(lbAdmin, LB_FULFILLMENT_ORDERS, { id: toGid("Order", bo.lbOrderId) });
  const fos: LbFulfillmentOrder[] = (foData?.order?.fulfillmentOrders?.nodes ?? []).map((fo: any) => ({
    id: fo.id,
    status: fo.status,
    lineItems: (fo.lineItems?.nodes ?? []).map((n: any) => ({
      id: n.id,
      lineItemId: legacyId(n.lineItem.id),
      remainingQuantity: n.remainingQuantity,
    })),
  }));
  const plan = planFulfillment(wanted, fos);
  if (!plan.lineItemsByFulfillmentOrder.length) {
    throw new PermanentError(
      `No open fulfillment order on ${bo.lbOrderName} for the shipped items (on hold or already fulfilled?)`,
    );
  }

  const data = await gql(lbAdmin, FULFILLMENT_CREATE, {
    fulfillment: {
      lineItemsByFulfillmentOrder: plan.lineItemsByFulfillmentOrder,
      notifyCustomer: true,
      ...(t.number ? { trackingInfo: { number: t.number, company: t.company, url: t.url } } : {}),
    },
  });
  assertNoUserErrors("L-Beauty fulfillment failed", data?.fulfillmentCreate?.userErrors);
  const lbFulfillmentId: string = data.fulfillmentCreate.fulfillment.id;

  const lineUpdates = bo.lines
    .filter((l) => plan.planned.has(l.lbLineItemId))
    .map((l) =>
      db.brandOrderLine.update({
        where: { id: l.id },
        data: { fulfilledQty: Math.min(l.quantity, l.fulfilledQty + (plan.planned.get(l.lbLineItemId) ?? 0)) },
      }),
    );
  await db.$transaction([
    db.fulfillmentLink.upsert({
      where: { brandFulfillmentId },
      create: {
        brandOrderId: bo.id, brandFulfillmentId, lbFulfillmentId, status: "success",
        trackingNumber: t.number, trackingCompany: t.company, trackingUrl: t.url,
      },
      update: { lbFulfillmentId, status: "success", trackingNumber: t.number, trackingCompany: t.company, trackingUrl: t.url },
    }),
    ...lineUpdates,
  ]);

  const lines = await db.brandOrderLine.findMany({ where: { brandOrderId: bo.id } });
  const done = lines.every((l) => l.fulfilledQty >= l.quantity);
  await db.brandOrder.update({
    where: { id: bo.id },
    data: done
      ? { status: "FULFILLED", fulfilledAt: new Date(), lastError: null }
      : { status: "PARTIALLY_FULFILLED", lastError: null },
  });
  await logEvent(
    bo.id,
    "FULFILLED",
    `${done ? "Fully" : "Partly"} shipped by brand${t.number ? ` — ${t.company ?? ""} ${t.number}` : ""}; mirrored on L-Beauty`,
  );
  if (plan.shortfall.size) {
    await logEvent(bo.id, "FULFILLMENT_SHORTFALL", `Some shipped quantity could not be placed on L-Beauty: ${[...plan.shortfall].map(([k, v]) => `line ${k}×${v}`).join(", ")}`, "warning");
  }
}

export async function onSyncError(job: { payload: any; type: string }, err: unknown, dead: boolean) {
  if (!dead) return;
  const msg = err instanceof Error ? err.message : String(err);
  const orderId = job.payload?.payload?.order_id;
  const bo = orderId
    ? await db.brandOrder.findUnique({ where: { brandOrderId: toGid("Order", orderId) } })
    : null;
  if (bo) await logEvent(bo.id, "SYNC_FAILED", `${job.type}: ${msg}`, "error");
  await alert("error", `Sync to L-Beauty failed (${job.type}${bo ? `, ${bo.lbOrderName}` : ""}): ${msg}`);
}

/** Job: orders/cancelled from either side. */
export async function orderCancelled({ shop, payload }: { shop: string; payload: any }) {
  if (isMarketplace(shop)) {
    const lbOrderId = String(payload.id);
    await db.lbOrder.updateMany({ where: { lbOrderId }, data: { cancelledAt: new Date() } });
    const bos = await db.brandOrder.findMany({ where: { lbOrderId }, include: { brand: true } });
    for (const bo of bos) {
      if (["CANCELLED", "BRAND_CANCELLED", "LB_CANCELLED"].includes(bo.status)) continue;
      const shipped = bo.status === "FULFILLED" || bo.status === "PARTIALLY_FULFILLED";
      // Unsent orders simply stop; sent ones need the brand to stop too.
      await db.brandOrder.update({
        where: { id: bo.id },
        data: { status: "LB_CANCELLED", cancelledAt: new Date() },
      });
      await logEvent(bo.id, "LB_CANCELLED", `Cancelled on L-Beauty${shipped ? " after shipping — return needed" : ""}`, "warning");
      if (bo.brandOrderId && !shipped && config.autoCancelAtBrand) {
        await enqueue("cancel_at_brand", { brandOrderId: bo.id }, { dedupeKey: `cancel:${bo.id}` });
      } else if (bo.brandOrderId) {
        await alert("warning", `${bo.lbOrderName} was cancelled on L-Beauty — ${bo.brand.name} still has ${bo.brandOrderName}${shipped ? " (already shipped: arrange a return)" : ". Cancel it from the order page."}`);
      }
    }
    return;
  }
  const bo = await db.brandOrder.findUnique({
    where: { brandOrderId: toGid("Order", payload.id) },
    include: { lines: true, brand: true },
  });
  if (!bo || bo.brand.shopDomain !== shop || bo.status === "CANCELLED") return;
  await db.brandOrder.update({
    where: { id: bo.id },
    data: { status: "BRAND_CANCELLED", cancelledAt: new Date(), lastError: null },
  });
  await logEvent(bo.id, "BRAND_CANCELLED", `Brand cancelled ${bo.brandOrderName}${payload.cancel_reason ? ` (${payload.cancel_reason})` : ""}`, "error");
  if (!bo.isTest) {
    const lbWanted = bo.lines
      .map((l) => ({
        line: l,
        remQty: Math.max(0, l.quantity - l.refundedQty),
      }))
      .filter((x) => x.remQty > 0);
    if (lbWanted.length > 0) {
      const lbAdmin = await adminFor(config.marketplaceShop);
      const lbRefundId = await mirrorRefundToShop(
        lbAdmin,
        toGid("Order", bo.lbOrderId),
        lbWanted.map((x) => ({ lineItemId: toGid("LineItem", x.line.lbLineItemId), quantity: x.remQty })),
        `Brand ${bo.brand.name} cancelled ${bo.brandOrderName ?? bo.id}`,
        true,
        `brand-cancel-refund-${bo.id}`,
      );
      if (lbRefundId) {
        let totalAmount = 0;
        let totalQty = 0;
        for (const { line, remQty } of lbWanted) {
          totalAmount += refundValue(line.lineTotalMinor, line.quantity, remQty);
          totalQty += remQty;
          await db.brandOrderLine.update({
            where: { id: line.id },
            data: { refundedQty: line.quantity },
          });
        }
        await db.refundRecord.upsert({
          where: { source_externalRefundId_brandOrderId: { source: "LBEAUTY", externalRefundId: lbRefundId, brandOrderId: bo.id } },
          create: { brandOrderId: bo.id, source: "LBEAUTY", externalRefundId: lbRefundId, amountMinor: totalAmount, quantity: totalQty },
          update: { amountMinor: totalAmount, quantity: totalQty },
        });
        await logEvent(bo.id, "REFUND_LBEAUTY", `Mirrored refund of ${totalQty} unit(s) (${fromMinor(totalAmount)}) onto L-Beauty ${bo.lbOrderName} after brand cancellation`, "warning");
      }
    }
    await alert("error", `${bo.brand.name} cancelled ${bo.lbOrderName}. Customer items were refunded on L-Beauty.`);
  }
}

/** Job: refunds/create from either side. */
export async function refundCreated({ shop, payload }: { shop: string; payload: any }) {
  const refundId = String(payload.id);
  const refundLines: any[] = payload.refund_line_items ?? [];

  if (isMarketplace(shop)) {
    // Customer refund on L-Beauty: attribute to the brand lines it touches.
    const lbLineIds = refundLines.map((r) => String(r.line_item_id));
    if (!lbLineIds.length) return; // shipping-only / amount-only refund
    const lines = await db.brandOrderLine.findMany({
      where: { lbLineItemId: { in: lbLineIds }, brandOrder: { lbOrderId: String(payload.order_id) } },
      include: { brandOrder: { include: { brand: true } } },
    });
    const perOrder = new Map<
      string,
      {
        bo: (typeof lines)[number]["brandOrder"];
        amount: number;
        qty: number;
        lineUpdates: { lineId: string; newRefundedQty: number }[];
        brandWanted: { lineItemId: string; quantity: number }[];
      }
    >();
    for (const r of refundLines) {
      const line = lines.find((l) => l.lbLineItemId === String(r.line_item_id));
      if (!line) continue;
      const qty = Number(r.quantity);
      if (qty <= 0) continue;
      const acc = perOrder.get(line.brandOrderId) ?? {
        bo: line.brandOrder,
        amount: 0,
        qty: 0,
        lineUpdates: [],
        brandWanted: [],
      };
      acc.amount += refundValue(line.lineTotalMinor, line.quantity, qty);
      acc.qty += qty;
      acc.lineUpdates.push({
        lineId: line.id,
        newRefundedQty: Math.min(line.quantity, line.refundedQty + qty),
      });
      if (line.brandLineItemId) {
        acc.brandWanted.push({ lineItemId: line.brandLineItemId, quantity: qty });
      }
      perOrder.set(line.brandOrderId, acc);
    }
    for (const [brandOrderId, v] of perOrder) {
      const existingLbRefund = await db.refundRecord.findUnique({
        where: { source_externalRefundId_brandOrderId: { source: "LBEAUTY", externalRefundId: refundId, brandOrderId } },
      });
      // If we already recorded this L-Beauty refund (e.g., when mirroring a brand refund), skip to avoid double-counting.
      if (existingLbRefund) continue;

      for (const u of v.lineUpdates) {
        await db.brandOrderLine.update({
          where: { id: u.lineId },
          data: { refundedQty: u.newRefundedQty },
        });
      }
      await db.refundRecord.create({
        data: { brandOrderId, source: "LBEAUTY", externalRefundId: refundId, amountMinor: v.amount, quantity: v.qty },
      });
      await logEvent(brandOrderId, "REFUND_LBEAUTY", `Customer refunded ${v.qty} unit(s) on L-Beauty (${fromMinor(v.amount)}) — deducted from brand payout`, "warning");

      if (!v.bo.isTest && v.bo.brandOrderId && v.brandWanted.length > 0) {
        const brandAdmin = await adminFor(v.bo.brand.shopDomain);
        const brandRefundId = await mirrorRefundToShop(
          brandAdmin,
          v.bo.brandOrderId,
          v.brandWanted,
          `Refund synced from L-Beauty order ${v.bo.lbOrderName}`,
          false,
          `lb-refund-${v.bo.id}-${refundId}`,
        );
        if (brandRefundId) {
          await db.refundRecord.upsert({
            where: { source_externalRefundId_brandOrderId: { source: "BRAND", externalRefundId: brandRefundId, brandOrderId } },
            create: { brandOrderId, source: "BRAND", externalRefundId: brandRefundId, amountMinor: v.amount, quantity: v.qty },
            update: { amountMinor: v.amount, quantity: v.qty },
          });
        }
      }
    }
    return;
  }

  const bo = await db.brandOrder.findUnique({
    where: { brandOrderId: toGid("Order", payload.order_id) },
    include: { lines: true, brand: true, refunds: true },
  });
  if (!bo || bo.brand.shopDomain !== shop) return;

  const existingBrandRefund = bo.refunds.find((r) => r.source === "BRAND" && r.externalRefundId === refundId);
  let amount = 0;
  let qty = 0;
  const lbWanted: { lineItemId: string; quantity: number }[] = [];

  for (const r of refundLines) {
    const line = bo.lines.find((l) => l.brandLineItemId === toGid("LineItem", r.line_item_id));
    if (!line) continue;
    const rQty = Number(r.quantity);
    if (rQty <= 0) continue;
    amount += refundValue(line.lineTotalMinor, line.quantity, rQty);
    qty += rQty;
    lbWanted.push({ lineItemId: toGid("LineItem", line.lbLineItemId), quantity: rQty });
    if (!existingBrandRefund) {
      await db.brandOrderLine.update({
        where: { id: line.id },
        data: { refundedQty: Math.min(line.quantity, line.refundedQty + rQty) },
      });
    }
  }
  if (!qty) return;

  await db.refundRecord.upsert({
    where: { source_externalRefundId_brandOrderId: { source: "BRAND", externalRefundId: refundId, brandOrderId: bo.id } },
    create: { brandOrderId: bo.id, source: "BRAND", externalRefundId: refundId, amountMinor: amount, quantity: qty },
    update: { amountMinor: amount, quantity: qty },
  });

  if (!bo.isTest && lbWanted.length > 0) {
    const lbAdmin = await adminFor(config.marketplaceShop);
    const lbRefundId = await mirrorRefundToShop(
      lbAdmin,
      toGid("Order", bo.lbOrderId),
      lbWanted,
      `Refund/return synced from ${bo.brand.name} (${bo.brandOrderName ?? bo.id})`,
      true,
      `brand-refund-${bo.id}-${refundId}`,
    );
    if (lbRefundId) {
      await db.refundRecord.upsert({
        where: { source_externalRefundId_brandOrderId: { source: "LBEAUTY", externalRefundId: lbRefundId, brandOrderId: bo.id } },
        create: { brandOrderId: bo.id, source: "LBEAUTY", externalRefundId: lbRefundId, amountMinor: amount, quantity: qty },
        update: { amountMinor: amount, quantity: qty },
      });
      await logEvent(
        bo.id,
        "REFUND_BRAND",
        `Brand refunded/returned ${qty} unit(s) (${fromMinor(amount)}); mirrored refund onto L-Beauty order ${bo.lbOrderName}`,
        "warning",
      );
      return;
    }
  }

  if (!existingBrandRefund) {
    await logEvent(bo.id, "REFUND_BRAND", `Brand recorded a refund/return of ${qty} unit(s) in their store`, "warning");
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
