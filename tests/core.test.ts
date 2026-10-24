// Run with: npm test   (Node's built-in runner; no extra packages needed)
import { test } from "node:test";
import assert from "node:assert/strict";

import { toMinor, fromMinor, applyBps } from "../app/lib/core/money.ts";
import { toGid, legacyId } from "../app/lib/core/gid.ts";
import { parseOrderWebhook, splitByBrand, pairCreatedLines } from "../app/lib/core/split.ts";
import { planFulfillment } from "../app/lib/core/fulfillment-plan.ts";
import { reconcile, refundValue } from "../app/lib/core/reconciliation.ts";
import { retryDelayMs, MAX_DELAY_MS } from "../app/lib/core/backoff.ts";
import { toCsv } from "../app/lib/core/csv.ts";
import { matchVariants, skuSearchQuery } from "../app/lib/core/sku-match.ts";

test("money conversions are exact", () => {
  assert.equal(toMinor("199.99"), 19999);
  assert.equal(toMinor(0.1 + 0.2), 30);
  assert.equal(fromMinor(19999), "199.99");
  assert.equal(fromMinor(-5), "-0.05");
  assert.equal(applyBps(12345, 1000), 1235); // 10% of 123.45, rounded
  assert.equal(applyBps(-12345, 1000), -1235);
});

test("gid helpers round-trip", () => {
  assert.equal(toGid("Order", 123), "gid://shopify/Order/123");
  assert.equal(toGid("Order", "gid://shopify/Order/9"), "gid://shopify/Order/9");
  assert.equal(legacyId("gid://shopify/LineItem/55"), "55");
});

const webhook = {
  id: 5001,
  name: "#1042",
  currency: "INR",
  email: "buyer@example.com",
  taxes_included: true,
  shipping_address: { first_name: "Asha", last_name: "R", address1: "1 MG Rd", city: "Bengaluru", province_code: "KA", country_code: "IN", zip: "560001", phone: "+91 9000000000" },
  line_items: [
    { id: 1, variant_id: 11, sku: "BR-A-01", name: "Lipstick", quantity: 2, price: "500.00", discount_allocations: [{ amount: "100.00" }] },
    { id: 2, variant_id: 22, sku: "BR-B-01", name: "Serum", quantity: 1, price: "999.00", discount_allocations: [] },
    { id: 3, variant_id: 33, sku: "PORTAL-1", name: "Portal item", quantity: 1, price: "250.00" },
    { id: 4, variant_id: 11, sku: "BR-A-01", name: "Removed", quantity: 1, current_quantity: 0, price: "500.00" },
  ],
};

test("multi-brand order splits by brand, keeps portal lines unrouted", () => {
  const order = parseOrderWebhook(webhook);
  assert.equal(order.lines.length, 4);
  const mappings = new Map([
    ["11", { brandId: "A", brandVariantId: "gid://shopify/ProductVariant/911" }],
    ["22", { brandId: "B", brandVariantId: "gid://shopify/ProductVariant/922" }],
  ]);
  const { byBrand, unrouted } = splitByBrand(order.lines, mappings);
  assert.deepEqual([...byBrand.keys()].sort(), ["A", "B"]);
  const a = byBrand.get("A")!;
  assert.equal(a.length, 1, "removed (qty 0) line is skipped");
  assert.equal(a[0].lineTotalMinor, 90000); // 2 × 500 − 100
  assert.equal(a[0].unitPriceMinor, 45000);
  assert.equal(byBrand.get("B")![0].lineTotalMinor, 99900);
  assert.equal(unrouted.length, 1);
  assert.equal(unrouted[0].sku, "PORTAL-1");
});

test("created brand line items pair back to our lines, including repeats", () => {
  const ours = [
    { brandVariantId: "v1", n: 1 },
    { brandVariantId: "v2", n: 2 },
    { brandVariantId: "v1", n: 3 },
  ];
  const paired = pairCreatedLines(ours, [
    { id: "L1", variantId: "v1" },
    { id: "L2", variantId: "v2" },
    { id: "L3", variantId: "v1" },
  ]);
  assert.deepEqual(ours.map((o) => paired.get(o)), ["L1", "L2", "L3"]);
});

test("fulfillment plan uses only open fulfillment orders and reports shortfall", () => {
  const plan = planFulfillment(new Map([["1", 2], ["2", 1]]), [
    { id: "FO-closed", status: "CLOSED", lineItems: [{ id: "x", lineItemId: "1", remainingQuantity: 2 }] },
    { id: "FO-1", status: "OPEN", lineItems: [{ id: "FOL-1", lineItemId: "1", remainingQuantity: 1 }] },
    { id: "FO-2", status: "IN_PROGRESS", lineItems: [{ id: "FOL-2", lineItemId: "1", remainingQuantity: 5 }] },
  ]);
  assert.deepEqual(plan.lineItemsByFulfillmentOrder, [
    { fulfillmentOrderId: "FO-1", fulfillmentOrderLineItems: [{ id: "FOL-1", quantity: 1 }] },
    { fulfillmentOrderId: "FO-2", fulfillmentOrderLineItems: [{ id: "FOL-2", quantity: 1 }] },
  ]);
  assert.equal(plan.planned.get("1"), 2);
  assert.equal(plan.shortfall.get("2"), 1);
});

test("reconciliation: refunds, cancellations, tests and commission", () => {
  const rows = reconcile([
    { brandId: "A", brandName: "Aroma", commissionBps: 1000, status: "FULFILLED", isTest: false, subtotalMinor: 100000, refunds: [{ source: "LBEAUTY", amountMinor: 20000 }, { source: "BRAND", amountMinor: 5000 }] },
    { brandId: "A", brandName: "Aroma", commissionBps: 1000, status: "TRANSFERRED", isTest: false, subtotalMinor: 50000, refunds: [] },
    { brandId: "A", brandName: "Aroma", commissionBps: 1000, status: "LB_CANCELLED", isTest: false, subtotalMinor: 70000, refunds: [{ source: "LBEAUTY", amountMinor: 70000 }] },
    { brandId: "A", brandName: "Aroma", commissionBps: 1000, status: "FULFILLED", isTest: true, subtotalMinor: 99999, refunds: [] },
    { brandId: "B", brandName: "Bloom", commissionBps: 1500, status: "FULFILLED", isTest: false, subtotalMinor: 10000, refunds: [{ source: "LBEAUTY", amountMinor: 99999 }] },
  ]);
  const [a, b] = rows;
  assert.equal(a.orders, 2);
  assert.equal(a.cancelledOrders, 1);
  assert.equal(a.grossMinor, 150000);
  assert.equal(a.refundsMinor, 20000); // brand-side refund ignored
  assert.equal(a.netMinor, 130000);
  assert.equal(a.commissionMinor, 13000);
  assert.equal(a.dueMinor, 117000);
  assert.equal(b.refundsMinor, 10000, "refund capped at order value");
  assert.equal(b.dueMinor, 0);
  assert.equal(refundValue(90000, 2, 1), 45000);
});

test("retry delay grows and is capped", () => {
  const fixed = () => 0.5; // no jitter
  assert.equal(retryDelayMs(1, fixed), 30_000);
  assert.equal(retryDelayMs(3, fixed), 120_000);
  assert.equal(retryDelayMs(30, fixed), MAX_DELAY_MS);
});

test("csv escapes quotes and blocks formula injection", () => {
  assert.equal(toCsv([["a,b", 'say "hi"', "=SUM(A1)", 5]]), '"a,b","say ""hi""",\'=SUM(A1),5\r\n');
});

test("SKU matching is scoped by vendor and skips ambiguous SKUs", () => {
  const res = matchVariants(
    [
      { id: "gid://shopify/ProductVariant/1", sku: " sku-1 " },
      { id: "gid://shopify/ProductVariant/2", sku: "DUP" },
      { id: "gid://shopify/ProductVariant/3", sku: "dup" },
      { id: "gid://shopify/ProductVariant/4", sku: "" },
    ],
    [
      { id: "gid://shopify/ProductVariant/100", sku: "SKU-1", productId: "gid://shopify/Product/9", vendor: "Aroma" },
      { id: "gid://shopify/ProductVariant/101", sku: "SKU-1", productId: "gid://shopify/Product/8", vendor: "Other Brand" },
      { id: "gid://shopify/ProductVariant/102", sku: "DUP", productId: "gid://shopify/Product/9", vendor: "aroma" },
      { id: "gid://shopify/ProductVariant/103", sku: "NOPE", productId: "gid://shopify/Product/9", vendor: "Aroma" },
    ],
    "Aroma",
  );
  assert.deepEqual(res.matches, [
    { lbVariantId: "100", lbProductId: "9", brandVariantId: "gid://shopify/ProductVariant/1", sku: "SKU-1" },
  ]);
  assert.deepEqual(res.duplicateBrandSkus, ["DUP"]);
  assert.equal(res.brandSkusMissing, 1);
  assert.deepEqual(res.unmatchedLbSkus.sort(), ["DUP", "NOPE"]);
  assert.equal(skuSearchQuery(['A"1', "B"]), 'sku:"A\\"1" OR sku:"B"');
});
