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
    data: done ? { status: "FULFILLED", fulfilledAt: new Date() } : { status: "PARTIALLY_FULFILLED" },
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
    include: { brand: true },
  });
  if (!bo || bo.brand.shopDomain !== shop || bo.status === "CANCELLED") return;
  await db.brandOrder.update({
    where: { id: bo.id },
    data: { status: "BRAND_CANCELLED", cancelledAt: new Date() },
  });
  await logEvent(bo.id, "BRAND_CANCELLED", `Brand cancelled ${bo.brandOrderName}${payload.cancel_reason ? ` (${payload.cancel_reason})` : ""}`, "error");
  if (!bo.isTest) {
    await alert("error", `${bo.brand.name} cancelled ${bo.lbOrderName}. Refund or reassign the customer's items in L-Beauty.`);
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
    });
    const perOrder = new Map<string, { amount: number; qty: number }>();
    for (const r of refundLines) {
      const line = lines.find((l) => l.lbLineItemId === String(r.line_item_id));
      if (!line) continue;
      const qty = Number(r.quantity);
      const acc = perOrder.get(line.brandOrderId) ?? { amount: 0, qty: 0 };
      acc.amount += refundValue(line.lineTotalMinor, line.quantity, qty);
      acc.qty += qty;
      perOrder.set(line.brandOrderId, acc);
      await db.brandOrderLine.update({
        where: { id: line.id },
        data: { refundedQty: Math.min(line.quantity, line.refundedQty + qty) },
      });
    }
    for (const [brandOrderId, v] of perOrder) {
      await db.refundRecord.upsert({
        where: { source_externalRefundId_brandOrderId: { source: "LBEAUTY", externalRefundId: refundId, brandOrderId } },
        create: { brandOrderId, source: "LBEAUTY", externalRefundId: refundId, amountMinor: v.amount, quantity: v.qty },
        update: {},
      });
      await logEvent(brandOrderId, "REFUND_LBEAUTY", `Customer refunded ${v.qty} unit(s) on L-Beauty (${fromMinor(v.amount)}) — deducted from brand payout`, "warning");
    }
    return;
  }

  const bo = await db.brandOrder.findUnique({
    where: { brandOrderId: toGid("Order", payload.order_id) },
    include: { lines: true, brand: true },
  });
  if (!bo || bo.brand.shopDomain !== shop) return;
  let amount = 0;
  let qty = 0;
  for (const r of refundLines) {
    const line = bo.lines.find((l) => l.brandLineItemId === toGid("LineItem", r.line_item_id));
    if (!line) continue;
    amount += refundValue(line.lineTotalMinor, line.quantity, Number(r.quantity));
    qty += Number(r.quantity);
  }
  await db.refundRecord.upsert({
    where: { source_externalRefundId_brandOrderId: { source: "BRAND", externalRefundId: refundId, brandOrderId: bo.id } },
    create: { brandOrderId: bo.id, source: "BRAND", externalRefundId: refundId, amountMinor: amount, quantity: qty },
    update: {},
  });
  await logEvent(bo.id, "REFUND_BRAND", `Brand recorded a refund/return of ${qty} unit(s) in their store`, "warning");
  if (!bo.isTest) {
    await alert("warning", `${bo.brand.name} recorded a refund on ${bo.lbOrderName} — check whether the customer needs refunding on L-Beauty.`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
