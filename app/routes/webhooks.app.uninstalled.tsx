import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { onUninstall } from "../lib/handlers/brands.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session } = await authenticate.webhook(request);

  // Webhooks can repeat and arrive after the session is gone.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }
  await onUninstall(shop);
  await db.directoryProduct.deleteMany({ where: { shopDomain: shop } });
  await db.productFeed.deleteMany({ where: { shopDomain: shop } });
  await db.channelConnection.updateMany({
    where: { shopDomain: shop },
    data: {
      status: "DISCONNECTED",
      channelId: null,
      channelHandle: null,
      storefrontAccessToken: null,
      storefrontTokenId: null,
      disconnectedAt: new Date(),
    },
  });
  return new Response();
};
