// Contextual product-feed payload normalization and LBridge listing validation.

export interface FeedImage {
  url?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface FeedVariant {
  id: string;
  title?: string | null;
  sku?: string | null;
  price?: { amount?: string | number | null; currencyCode?: string | null } | null;
  compareAtPrice?: { amount?: string | number | null } | null;
  quantityAvailable?: number | null;
  availableForSale?: boolean | null;
  [key: string]: unknown;
}

export interface FeedProduct {
  id: string;
  title?: string | null;
  handle?: string | null;
  description?: string | null;
  onlineStoreUrl?: string | null;
  updatedAt?: string | null;
  isPublished?: boolean | null;
  images?: { edges?: Array<{ node?: FeedImage | null }> } | null;
  variants?: { edges?: Array<{ node?: FeedVariant | null }> } | null;
  [key: string]: unknown;
}

export interface ProductFeedPayload {
  metadata?: { action?: string | null; [key: string]: unknown };
  productFeed?: { id?: string | null; country?: string | null; language?: string | null } | null;
  product?: FeedProduct | null;
  fullSync?: { status?: string | null; errorCode?: string | null; count?: number | null } | null;
  id?: string;
  country?: string;
  language?: string;
  status?: string;
  [key: string]: unknown;
}

export function feedVariants(product: FeedProduct): FeedVariant[] {
  return (product.variants?.edges ?? [])
    .map((edge) => edge.node)
    .filter((variant): variant is FeedVariant => Boolean(variant?.id));
}

export function primaryFeedImage(product: FeedProduct): FeedImage | null {
  return product.images?.edges?.find((edge) => edge.node?.url)?.node ?? null;
}

/** Rules mirrored in Shopify Admin through product resource feedback. */
export function validateDirectoryProduct(product: FeedProduct): string[] {
  const messages: string[] = [];
  const image = primaryFeedImage(product);
  if (!image?.url) {
    messages.push("Product requires at least one high-resolution image to list on LBridge Directory.");
  } else if ((image.width ?? 0) < 800 || (image.height ?? 0) < 800) {
    messages.push("The primary product image must be at least 800 × 800 pixels for LBridge Directory.");
  }

  const variants = feedVariants(product);
  if (variants.length === 0) {
    messages.push("Product requires at least one variant to list on LBridge Directory.");
  } else if (variants.some((variant) => !variant.sku?.trim())) {
    messages.push("Every product variant requires a SKU to list on LBridge Directory.");
  }
  return messages;
}

export function shouldRemoveDirectoryProduct(payload: ProductFeedPayload): boolean {
  return payload.metadata?.action?.toUpperCase() === "DELETE" || payload.product?.isPublished === false;
}

export function normalizeProductUpdatedAt(product: FeedProduct, receivedAt = new Date()): Date {
  const parsed = product.updatedAt ? new Date(product.updatedAt) : receivedAt;
  return Number.isNaN(parsed.getTime()) ? receivedAt : parsed;
}
