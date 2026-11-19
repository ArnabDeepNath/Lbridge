import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRemoveDirectoryProduct, validateDirectoryProduct, type FeedProduct } from "../app/lib/core/product-feed.ts";
import { buildAttributedCartPermalink, normalizeVariantId } from "../app/lib/core/checkout.ts";

const validProduct: FeedProduct = {
  id: "gid://shopify/Product/12345",
  title: "Serum",
  isPublished: true,
  updatedAt: "2026-11-18T10:30:00Z",
  images: { edges: [{ node: { url: "https://cdn.example/serum.jpg", width: 1200, height: 1200 } }] },
  variants: { edges: [{ node: { id: "gid://shopify/ProductVariant/67890", sku: "SERUM-1", price: { amount: "19.99", currencyCode: "USD" }, quantityAvailable: 4, availableForSale: true } }] },
};

test("valid published feed products pass directory validation", () => {
  assert.deepEqual(validateDirectoryProduct(validProduct), []);
});

test("missing images and variant SKUs produce Admin feedback messages", () => {
  const invalid: FeedProduct = {
    ...validProduct,
    images: { edges: [] },
    variants: { edges: [{ node: { id: "gid://shopify/ProductVariant/67890", sku: "" } }] },
  };
  const messages = validateDirectoryProduct(invalid);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /high-resolution image/);
  assert.match(messages[1], /requires a SKU/);
});

test("DELETE and unpublished products are removed from the directory", () => {
  assert.equal(shouldRemoveDirectoryProduct({ metadata: { action: "DELETE" }, product: validProduct }), true);
  assert.equal(shouldRemoveDirectoryProduct({ metadata: { action: "UPDATE" }, product: { ...validProduct, isPublished: false } }), true);
  assert.equal(shouldRemoveDirectoryProduct({ metadata: { action: "UPDATE" }, product: validProduct }), false);
});

test("cart permalinks use numeric variant IDs and channel attribution", () => {
  const url = new URL(buildAttributedCartPermalink({
    shop: "merchant.myshopify.com",
    variantId: "gid://shopify/ProductVariant/67890",
    quantity: 2,
    storefrontAccessToken: "test-token",
    channelHandle: "lbridge-marketplace-abc",
  }));
  assert.equal(url.origin, "https://merchant.myshopify.com");
  assert.equal(url.pathname, "/cart/67890:2");
  assert.equal(url.searchParams.get("access_token"), "test-token");
  assert.equal(url.searchParams.get("source_name"), "channel:lbridge-marketplace-abc");
});

test("variant normalization rejects non-Shopify IDs", () => {
  assert.deepEqual(normalizeVariantId("123"), { gid: "gid://shopify/ProductVariant/123", numericId: "123" });
  assert.throws(() => normalizeVariantId("https://example.com/123"));
});
