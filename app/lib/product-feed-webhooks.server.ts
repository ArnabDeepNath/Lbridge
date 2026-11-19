// Shared authenticated entry point for all contextual product-feed webhooks.

import { Prisma } from "@prisma/client";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { enqueue } from "./jobs.server";
import type { ProductFeedPayload } from "./core/product-feed.ts";

const ok = () => new Response(null, { status: 200 });
const normalizeTopic = (topic: unknown) => String(topic).toUpperCase().replace(/\//g, "_");

export async function productFeedWebhookAction(
  request: Request,
  expectedTopic: "PRODUCT_FEEDS_FULL_SYNC" | "PRODUCT_FEEDS_FULL_SYNC_FINISH" | "PRODUCT_FEEDS_INCREMENTAL_SYNC" | "PRODUCT_FEEDS_UPDATE",
) {
  const { shop, topic, payload, webhookId } = await authenticate.webhook(request);
  if (normalizeTopic(topic) !== expectedTopic) return new Response("Unexpected webhook topic", { status: 400 });

  if (webhookId) {
    try {
      await db.webhookEvent.create({ data: { id: webhookId, topic: expectedTopic, shop } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return ok();
      throw error;
    }
  }

  const isProduct = expectedTopic === "PRODUCT_FEEDS_FULL_SYNC" || expectedTopic === "PRODUCT_FEEDS_INCREMENTAL_SYNC";
  await enqueue(isProduct ? "product_feed_sync" : "product_feed_status", {
    shop,
    payload: payload as ProductFeedPayload,
  });
  return ok();
}
