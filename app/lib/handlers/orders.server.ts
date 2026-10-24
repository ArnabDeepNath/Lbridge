// Routing paid L-Beauty orders and transferring each brand's part to the
// brand's Shopify store.

import { Prisma } from "@prisma/client";
import db from "../../db.server";
import { alert, logEvent } from "../alerts.server";
import { config } from "../config.server";
import { enqueue, PermanentError } from "../jobs.server";
import { adminFor, assertNoUserErrors, gql } from "../shopify-api.server";
import { fromMinor } from "../core/money.ts";
import {
  pairCreatedLines,
  splitByBrand,
  type LbOrderInput,
  type MappingRef,
} from "../core/split.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TransferInput {
  email: string | null;
  phone: string | null;
  taxesIncluded: boolean;
  shippingAddress: LbOrderInput["shippingAddress"];
}

/** Mapped + ACTIVE brand lookup for a set of L-Beauty variant ids. */
export async function activeMappings(variantIds: string[]): Promise<Map<string, MappingRef>> {
  if (!variantIds.length) return new Map();
  const rows = await db.variantMapping.findMany({
    where: { lbVariantId: { in: variantIds }, brand: { status: "ACTIVE" } },
    select: { lbVariantId: true, brandId: true, brandVariantId: true },
  });
  return new Map(rows.map((r) => [r.lbVariantId, r]));
}

/** Job: split a stored L-Beauty order into brand orders and queue transfers. */
export async function routeLbOrder({ lbOrderId }: { lbOrderId: string }): Promise<void> {
  const lb = await db.lbOrder.findUnique({ where: { lbOrderId } });
  if (!lb || lb.routedAt || !lb.payload) return;
  const order = lb.payload as unknown as LbOrderInput;

  const mappings = await activeMappings(
    order.lines.map((l) => l.lbVariantId).filter((v): v is string => !!v),
  );
  const { byBrand, unrouted } = splitByBrand(order.lines, mappings);

  const transferInput: TransferInput = {
    email: config.shareCustomerEmail ? order.email : null,
    phone: order.phone,
    taxesIncluded: order.taxesIncluded,
    shippingAddress: order.shippingAddress,
  };

  for (const [brandId, lines] of byBrand) {
    const subtotalMinor = lines.reduce((s, l) => s + l.lineTotalMinor, 0);
    const existing = await db.brandOrder.findUnique({
      where: { lbOrderId_brandId: { lbOrderId, brandId } },
    });
    if (existing) continue; // idempotent re-run
    const bo = await db.brandOrder.create({
      data: {
        lbOrderId,
        lbOrderName: order.name,
        brandId,
        currency: order.currency,
        subtotalMinor,
        transferInput: transferInput as unknown as Prisma.InputJsonValue,
        lines: { create: lines },
      },
    });
    await logEvent(bo.id, "CREATED", `Split from ${order.name}: ${lines.length} line(s), ${order.currency} ${fromMinor(subtotalMinor)}`);
    await enqueue("transfer_brand_order", { brandOrderId: bo.id }, { dedupeKey: `transfer:${bo.id}` });
  }

  // Customer details are no longer needed on the L-Beauty order record.
  await db.lbOrder.update({
    where: { lbOrderId },
    data: { routedAt: new Date(), unroutedLineCount: unrouted.length, payload: Prisma.DbNull },
  });
}

const ORDER_CREATE = `#graphql
  mutation LbBridgeOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
        name
        lineItems(first: 250) { nodes { id variant { id } } }
      }
      userErrors { field message }
    }
  }`;

const FIND_EXISTING = `#graphql
  query LbBridgeFindOrder($q: String!) {
    orders(first: 1, query: $q) {
      nodes { id name lineItems(first: 250) { nodes { id variant { id } } } }
    }
  }`;

const refTag = (brandOrderId: string) => `LBREF-${brandOrderId}`;

/** Job: create the brand order in the brand's Shopify store. */
export async function transferBrandOrder({ brandOrderId }: { brandOrderId: string }): Promise<void> {
  const bo = await db.brandOrder.findUnique({
    where: { id: brandOrderId },
    include: { lines: true, brand: true },
  });
  if (!bo) return;
  if (bo.brandOrderId || bo.status !== "PENDING") return; // already done / cancelled

  if (!bo.isTest && bo.brand.status !== "ACTIVE") {
    throw new PermanentError(`Brand ${bo.brand.name} is ${bo.brand.status}; order not sent`);
  }
  await db.brandOrder.update({ where: { id: bo.id }, data: { attempts: { increment: 1 } } });

  const admin = await adminFor(bo.brand.shopDomain);
  const input = (bo.transferInput ?? {}) as unknown as TransferInput;

  // Idempotency: if an earlier attempt created the order but crashed before
  // saving, find it by our reference tag instead of creating a duplicate.
  const found = await gql(admin, FIND_EXISTING, { q: `tag:"${refTag(bo.id)}"` });
  let created = found?.orders?.nodes?.[0] ?? null;

  if (!created) {
    const money = (minor: number) => ({
      shopMoney: { amount: fromMinor(minor), currencyCode: bo.currency },
    });
    const a = input.shippingAddress;
    const address = a
      ? {
          firstName: a.firstName,
          lastName: a.lastName,
          company: a.company,
          address1: a.address1,
          address2: a.address2,
          city: a.city,
          provinceCode: a.provinceCode,
          countryCode: a.countryCode,
          zip: a.zip,
          phone: a.phone,
        }
      : undefined;

    const order: Record<string, unknown> = {
      currency: bo.currency,
      lineItems: bo.lines.map((l) => ({
        variantId: l.brandVariantId,
        quantity: l.quantity,
        priceSet: money(l.unitPriceMinor),
      })),
      shippingAddress: address,
      billingAddress: address,
      phone: input.phone ?? undefined,
      email: input.email ?? undefined,
      financialStatus: "PAID",
      taxesIncluded: input.taxesIncluded,
      transactions: [
        {
          kind: "SALE",
          status: "SUCCESS",
          gateway: config.channelLabel,
          amountSet: money(bo.lines.reduce((s, l) => s + l.unitPriceMinor * l.quantity, 0)),
        },
      ],
      shippingLines: [{ title: config.channelLabel, priceSet: money(0) }],
      tags: [config.orderTag, refTag(bo.id), ...(bo.isTest ? ["TEST"] : [])],
      note: `${bo.isTest ? "TEST ORDER — please cancel after checking. " : ""}${config.channelLabel} order ${bo.lbOrderName}`,
      sourceIdentifier: bo.id,
      customAttributes: [
        { key: "L-Beauty order", value: bo.lbOrderName },
        { key: "L-Beauty reference", value: bo.id },
      ],
    };

    const data = await gql(admin, ORDER_CREATE, {
      order,
      options: {
        inventoryBehaviour: "DECREMENT_OBEYING_POLICY",
        sendReceipt: false,
        sendFulfillmentReceipt: false,
      },
    });
    assertNoUserErrors("Order could not be created in brand store", data?.orderCreate?.userErrors);
    created = data?.orderCreate?.order;
    if (!created) throw new Error("orderCreate returned no order");
  }

  const pairs = pairCreatedLines(
    bo.lines,
    (created.lineItems?.nodes ?? []).map((n: any) => ({ id: n.id, variantId: n.variant?.id ?? null })),
  );

  await db.$transaction([
    db.brandOrder.update({
      where: { id: bo.id },
      data: {
        status: "TRANSFERRED",
        brandOrderId: created.id,
        brandOrderName: created.name,
        transferredAt: new Date(),
        lastError: null,
        transferInput: Prisma.DbNull, // drop customer details once delivered
      },
    }),
    ...bo.lines.map((l) =>
      db.brandOrderLine.update({
        where: { id: l.id },
        data: { brandLineItemId: pairs.get(l) ?? null },
      }),
    ),
  ]);
  await logEvent(bo.id, "TRANSFER_OK", `Created ${created.name} in ${bo.brand.shopDomain}`);
}

/** Called when a transfer job fails (each attempt) and when it gives up. */
export async function onTransferError(
  { brandOrderId }: { brandOrderId: string },
  err: unknown,
  dead: boolean,
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  const bo = await db.brandOrder.findUnique({ where: { id: brandOrderId }, include: { brand: true } });
  if (!bo) return;
  await db.brandOrder.update({
    where: { id: bo.id },
    data: { lastError: msg, ...(dead ? { status: "FAILED" } : {}) },
  });
  await logEvent(bo.id, dead ? "TRANSFER_FAILED" : "TRANSFER_RETRY", msg, dead ? "error" : "warning");
  if (dead) {
    await alert(
      "error",
      `Order ${bo.lbOrderName} could not be sent to ${bo.brand.name}: ${msg}. Retry or fulfil via portal from the L-Beauty admin.`,
    );
  }
}

/** Manual recovery: put FAILED brand orders back in the queue. */
export async function retryBrandOrders(ids: string[]): Promise<number> {
  const rows = await db.brandOrder.findMany({
    where: { id: { in: ids }, status: "FAILED", brandOrderId: null },
    select: { id: true },
  });
  for (const r of rows) {
    await db.brandOrder.update({ where: { id: r.id }, data: { status: "PENDING", lastError: null } });
    await logEvent(r.id, "MANUAL_RETRY", "Retry requested by L-Beauty admin");
    await enqueue("transfer_brand_order", { brandOrderId: r.id }, { dedupeKey: `transfer:${r.id}` });
  }
  return rows.length;
}

const ORDER_CANCEL = `#graphql
  mutation LbBridgeOrderCancel($orderId: ID!) {
    orderCancel(orderId: $orderId, reason: CUSTOMER, restock: true, notifyCustomer: false,
                refundMethod: { originalPaymentMethodsRefund: false },
                staffNote: "Cancelled by L-Beauty marketplace") {
      job { id }
      orderCancelUserErrors { field message }
    }
  }`;

/** Job: cancel the order inside the brand store (manual action or auto). */
export async function cancelAtBrand({ brandOrderId }: { brandOrderId: string }): Promise<void> {
  const bo = await db.brandOrder.findUnique({ where: { id: brandOrderId }, include: { brand: true } });
  if (!bo || !bo.brandOrderId) return;
  if (bo.status === "CANCELLED" || bo.status === "BRAND_CANCELLED") return;
  if (bo.status === "FULFILLED" || bo.status === "PARTIALLY_FULFILLED") {
    throw new PermanentError("Already shipped by the brand — handle as a return instead");
  }
  const admin = await adminFor(bo.brand.shopDomain);
  const data = await gql(admin, ORDER_CANCEL, { orderId: bo.brandOrderId });
  assertNoUserErrors("Brand order could not be cancelled", data?.orderCancel?.orderCancelUserErrors);
  await db.brandOrder.update({
    where: { id: bo.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  await logEvent(bo.id, "CANCELLED_AT_BRAND", `Cancelled ${bo.brandOrderName} in ${bo.brand.shopDomain}`);
}

export async function onCancelError({ brandOrderId }: { brandOrderId: string }, err: unknown, dead: boolean) {
  if (!dead) return;
  const msg = err instanceof Error ? err.message : String(err);
  await logEvent(brandOrderId, "CANCEL_FAILED", msg, "error");
  await alert("error", `Could not cancel brand order ${brandOrderId}: ${msg}`);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
