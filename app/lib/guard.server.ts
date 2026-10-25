import { authenticate } from "../shopify.server";
import { config, isMarketplace } from "./config.server";
import { adminFor } from "./shopify-api.server";

export function isShopifyEmbeddedRequest(request: Request) {
  const url = new URL(request.url);
  return Boolean(
    url.searchParams.get("shop") ||
      url.searchParams.get("host") ||
      url.searchParams.get("id_token") ||
      url.searchParams.get("embedded") ||
      request.headers.get("authorization"),
  );
}

/**
 * Authenticates via Shopify Admin when loaded inside Shopify (with shop/host/id_token),
 * or falls back to the configured L-Beauty marketplace store when opened directly in a browser.
 */
export async function authenticateAdminOrLocal(request: Request) {
  if (isShopifyEmbeddedRequest(request)) {
    const ctx = await authenticate.admin(request);
    return { ...ctx, embedded: true as const };
  }

  const shop = config.marketplaceShop || "l-beauty.myshopify.com";
  return {
    session: { shop },
    embedded: false as const,
    admin: {
      graphql: async (query: string, options?: { variables?: Record<string, unknown> }) => {
        const client = await adminFor(shop);
        return client.graphql(query, options);
      },
    },
  };
}

/** Admin pages that only L-Beauty's own store may open. */
export async function requireMarketplace(request: Request) {
  const ctx = await authenticateAdminOrLocal(request);
  if (!isMarketplace(ctx.session.shop)) {
    throw new Response("This page is only available to the L-Beauty marketplace store.", { status: 403 });
  }
  return ctx;
}