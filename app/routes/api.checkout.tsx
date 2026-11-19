// Public directory checkout handoff. Buyers always finish in Shopify Checkout.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { createShopifyCheckout } from "../lib/checkout.server";

async function checkout(request: Request) {
  try {
    const url = new URL(request.url);
    const values = request.method === "POST" ? await request.formData() : url.searchParams;
    const value = (key: string) => String(values.get(key) ?? "");
    const checkoutUrl = await createShopifyCheckout({
      shop: value("shop"),
      variantId: value("variantId"),
      quantity: value("quantity") || 1,
      method: value("method") || "permalink",
    });

    if (request.headers.get("accept")?.includes("application/json")) {
      return Response.json(
        { checkoutUrl },
        { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } },
      );
    }
    return new Response(null, { status: 302, headers: { location: checkoutUrl, "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not start Shopify Checkout." },
      { status: 400, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } },
    );
  }
}

export const loader = ({ request }: LoaderFunctionArgs) => checkout(request);
export const action = ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, accept",
      },
    });
  }
  return checkout(request);
};
