import { authenticate } from "../shopify.server";
import { isMarketplace } from "./config.server";

/** Admin pages that only L-Beauty's own store may open. */
export async function requireMarketplace(request: Request) {
  const ctx = await authenticate.admin(request);
  if (!isMarketplace(ctx.session.shop)) {
    throw new Response("This page is only available to the L-Beauty marketplace store.", { status: 403 });
  }
  return ctx;
}
