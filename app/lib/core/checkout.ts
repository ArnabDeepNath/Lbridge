// Shopify-hosted checkout helpers. No payment details or offsite orders are created.

export function normalizeShopDomain(value: string): string {
  const shop = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error("A valid myshopify.com shop domain is required.");
  }
  return shop;
}

export function normalizeVariantId(value: string): { gid: string; numericId: string } {
  const match = value.trim().match(/^(?:gid:\/\/shopify\/ProductVariant\/)?(\d+)$/);
  if (!match) throw new Error("A valid Shopify product variant ID is required.");
  return { gid: `gid://shopify/ProductVariant/${match[1]}`, numericId: match[1] };
}

export function normalizeQuantity(value: unknown): number {
  const quantity = Number(value ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 250) {
    throw new Error("Quantity must be a whole number between 1 and 250.");
  }
  return quantity;
}

export function buildAttributedCartPermalink(input: {
  shop: string;
  variantId: string;
  quantity: number;
  storefrontAccessToken: string;
  channelHandle: string;
}): string {
  const shop = normalizeShopDomain(input.shop);
  const variant = normalizeVariantId(input.variantId);
  const quantity = normalizeQuantity(input.quantity);
  const url = new URL(`https://${shop}/cart/${variant.numericId}:${quantity}`);
  url.searchParams.set("access_token", input.storefrontAccessToken);
  url.searchParams.set("source_name", `channel:${input.channelHandle}`);
  return url.toString();
}
