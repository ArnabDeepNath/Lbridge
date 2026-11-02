// Mandatory privacy webhooks for public apps.
// Customer details are only kept until an order is routed/transferred, then
// deleted, so customer requests mostly need no action beyond acknowledging.

import type { ActionFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const t = String(topic).toUpperCase().replace(/\//g, "_");
  const p = payload as any;

  if (t === "CUSTOMERS_REDACT") {
    const ids: string[] = (p.orders_to_redact ?? []).map(String);
    if (ids.length) {
      await db.lbOrder.updateMany({ where: { lbOrderId: { in: ids } }, data: { payload: Prisma.DbNull } });
      await db.brandOrder.updateMany({ where: { lbOrderId: { in: ids } }, data: { transferInput: Prisma.DbNull } });
    }
  } else if (t === "SHOP_REDACT") {
    await db.session.deleteMany({ where: { shop } });
    const brand = await db.brand.findUnique({ where: { shopDomain: shop } });
    if (brand) {
      await db.brandOrder.updateMany({ where: { brandId: brand.id }, data: { transferInput: Prisma.DbNull } });
      await db.variantMapping.deleteMany({ where: { brandId: brand.id } });
      await db.brand.update({ where: { id: brand.id }, data: { contactEmail: null, status: "UNINSTALLED" } });
    }
  }
  // CUSTOMERS_DATA_REQUEST: we hold no customer profile data to export.
  return new Response(null, { status: 200 });
};
/* eslint-enable @typescript-eslint/no-explicit-any */
