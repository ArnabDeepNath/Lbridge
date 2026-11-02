// Single entry point for all order-related webhooks (see shopify.app.toml).
// Verifies HMAC, de-duplicates, drops irrelevant events cheaply, and
// enqueues work. Never does Shopify API calls inline, so it always answers
// well within Shopify's 5-second limit, even with 200+ brand stores sending.

import type { ActionFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { isMarketplace } from "../lib/config.server";
import { enqueue } from "../lib/jobs.server";
import { activeMappings } from "../lib/handlers/orders.server";
import { parseOrderWebhook } from "../lib/core/split.ts";
import { toGid } from "../lib/core/gid.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ok = () => new Response(null, { status: 200 });

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, webhookId } = await authenticate.webhook(request);
  const t = String(topic).toUpperCase().replace(/\//g, "_");
  const p = payload as any;
  const marketplace = isMarketplace(shop);

  // Cheap filters first — most events from brand stores are not ours.
  if (t === "ORDERS_PAID" && !marketplace) return ok();
  if (t.startsWith("FULFILLMENTS_") && marketplace) return ok(); // our own mirrors
  if (!marketplace && ["FULFILLMENTS_CREATE", "FULFILLMENTS_UPDATE", "ORDERS_CANCELLED", "REFUNDS_CREATE"].includes(t)) {
    const orderId = t === "ORDERS_CANCELLED" ? p.id : p.order_id;
    if (!orderId) return ok();
    const known = await db.brandOrder.findUnique({
      where: { brandOrderId: toGid("Order", orderId) },
      select: { id: true },
    });
    if (!known) return ok();
  }

  // At-least-once delivery: ignore repeats.
  if (webhookId) {
    try {
      await db.webhookEvent.create({ data: { id: webhookId, topic: t, shop } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return ok();
      throw e;
    }
  }

  switch (t) {
    case "ORDERS_PAID": {
      const order = parseOrderWebhook(p);
      const variantIds = order.lines.map((l) => l.lbVariantId).filter((v): v is string => !!v);
      // Orders containing only portal brands are not stored at all.
      if ((await activeMappings(variantIds)).size === 0) return ok();
      await db.lbOrder.upsert({
        where: { lbOrderId: order.lbOrderId },
        create: {
          lbOrderId: order.lbOrderId,
          name: order.name,
          currency: order.currency,
          payload: order as unknown as Prisma.InputJsonValue,
        },
        update: {},
      });
      await enqueue("route_lb_order", { lbOrderId: order.lbOrderId }, { dedupeKey: `route:${order.lbOrderId}` });
      break;
    }
    case "FULFILLMENTS_CREATE":
    case "FULFILLMENTS_UPDATE":
      await enqueue("brand_fulfillment", { shop, payload: slimFulfillment(p) });
      break;
    case "ORDERS_CANCELLED":
      await enqueue("order_cancelled", { shop, payload: { id: p.id, cancel_reason: p.cancel_reason ?? null } });
      break;
    case "REFUNDS_CREATE":
      await enqueue("refund_created", {
        shop,
        payload: {
          id: p.id,
          order_id: p.order_id,
          note: p.note ?? null,
          refund_line_items: (p.refund_line_items ?? []).map((r: any) => ({
            line_item_id: r.line_item_id,
            quantity: r.quantity,
            restock_type: r.restock_type ?? null,
          })),
        },
      });
      break;
    default:
      break;
  }
  return ok();
};

// Keep only what the sync needs (no customer data in the queue).
function slimFulfillment(p: any) {
  return {
    id: p.id,
    order_id: p.order_id,
    name: p.name,
    status: p.status,
    tracking_company: p.tracking_company ?? null,
    tracking_number: p.tracking_number ?? null,
    tracking_numbers: p.tracking_numbers ?? [],
    tracking_url: p.tracking_url ?? null,
    tracking_urls: p.tracking_urls ?? [],
    line_items: (p.line_items ?? []).map((li: any) => ({ id: li.id, quantity: li.quantity })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
