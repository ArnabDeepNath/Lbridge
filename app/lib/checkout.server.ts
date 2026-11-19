// Server-side Storefront Cart API client for attributed Shopify Checkout handoff.

import db from "../db.server";
import { buildAttributedCartPermalink, normalizeQuantity, normalizeShopDomain, normalizeVariantId } from "./core/checkout.ts";

// Storefront operation: intentionally not tagged for the Admin GraphQL code generator.
const CART_CREATE = `
  mutation CreateLBridgeCart($input: CartInput!) {
    cartCreate(input: $input) {
      cart { id checkoutUrl }
      userErrors { field message }
    }
  }
`;

export async function createShopifyCheckout(input: {
  shop: string;
  variantId: string;
  quantity: unknown;
  method?: string;
}): Promise<string> {
  const shop = normalizeShopDomain(input.shop);
  const variant = normalizeVariantId(input.variantId);
  const quantity = normalizeQuantity(input.quantity);
  const connection = await db.channelConnection.findUnique({ where: { shopDomain: shop } });
  if (
    connection?.status !== "CONNECTED" ||
    !connection.storefrontAccessToken ||
    !connection.channelHandle
  ) {
    throw new Error("This store is not connected to LBridge Directory.");
  }

  if (input.method !== "cart") {
    return buildAttributedCartPermalink({
      shop,
      variantId: variant.gid,
      quantity,
      storefrontAccessToken: connection.storefrontAccessToken,
      channelHandle: connection.channelHandle,
    });
  }

  const response = await fetch(`https://${shop}/api/2026-10/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "X-Shopify-Storefront-Access-Token": connection.storefrontAccessToken,
    },
    body: JSON.stringify({
      query: CART_CREATE,
      variables: {
        input: {
          lines: [{ merchandiseId: variant.gid, quantity }],
          sourceName: `channel:${connection.channelHandle}`,
        },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Shopify Storefront API returned ${response.status}.`);
  const result = (await response.json()) as {
    data?: { cartCreate?: { cart?: { checkoutUrl?: string } | null; userErrors?: Array<{ message?: string }> } };
    errors?: Array<{ message?: string }>;
  };
  const errors = [
    ...(result.errors ?? []),
    ...(result.data?.cartCreate?.userErrors ?? []),
  ].map((error) => error.message).filter(Boolean);
  if (errors.length) throw new Error(`Shopify could not create the cart: ${errors.join("; ")}`);
  const checkoutUrl = result.data?.cartCreate?.cart?.checkoutUrl;
  if (!checkoutUrl || new URL(checkoutUrl).protocol !== "https:") {
    throw new Error("Shopify did not return a secure checkout URL.");
  }
  return checkoutUrl;
}
