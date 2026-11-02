import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { verifyWebhookOrReject } from "../lib/webhooks.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const unauthorized = await verifyWebhookOrReject(request);
  if (unauthorized) return unauthorized;
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const current = payload.current as string[];
  if (session) {
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: current.toString(),
      },
    });
  }
  return new Response();
};
