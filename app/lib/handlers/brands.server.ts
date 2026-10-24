// Brand onboarding: install, SKU matching, test orders, uninstall.

import { Prisma } from "@prisma/client";
import db from "../../db.server";
import { alert, logEvent } from "../alerts.server";
import { config, isMarketplace } from "../config.server";
import { enqueue, PermanentError } from "../jobs.server";
import { adminFor, gql } from "../shopify-api.server";
import { matchVariants, skuSearchQuery, normSku, type BrandVariant, type LbVariant } from "../core/sku-match.ts";
import { toMinor } from "../core/money.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Called right after any store installs (or re-installs) the app. */
export async function onInstall(shop: string, admin: { graphql: (q: string) => Promise<Response> }) {
  if (isMarketplace(shop)) return;
  let info: any = {};
  try {
    const res = await admin.graphql(`#graphql
      query LbBridgeShopInfo { shop { name contactEmail currencyCode } }`);
    info = (await res.json())?.data?.shop ?? {};
  } catch (e) {
    console.error("[install] shop info failed", e);
  }
  const existing = await db.brand.findUnique({ where: { shopDomain: shop } });
  if (existing && existing.status !== "UNINSTALLED") return;
  await db.brand.upsert({
    where: { shopDomain: shop },
    create: {
      shopDomain: shop,
      name: info.name ?? shop,
      contactEmail: info.contactEmail ?? null,
      currency: info.currencyCode ?? null,
      vendorName: info.name ?? null,
    },
    update: {
      status: "PENDING_APPROVAL",
      uninstalledAt: null,
      installedAt: new Date(),
      contactEmail: info.contactEmail ?? existing?.contactEmail,
      currency: info.currencyCode ?? existing?.currency,
    },
  });
  await alert("warning", `New brand connected: ${info.name ?? shop} (${shop}) — waiting for approval in the L-Beauty admin.`);
}

export async function onUninstall(shop: string) {
  const brand = await db.brand.findUnique({ where: { shopDomain: shop } });
  if (!brand) return;
  await db.brand.update({
    where: { id: brand.id },
    data: { status: "UNINSTALLED", uninstalledAt: new Date() },
  });
  if (brand.status === "ACTIVE") {
    await alert("error", `${brand.name} uninstalled the app — new orders for this brand will stay in the L-Beauty portal.`);
  }
}

const BRAND_VARIANTS = `#graphql
  query LbBridgeBrandVariants($after: String) {
    productVariants(first: 250, after: $after) {
      nodes { id sku }
      pageInfo { hasNextPage endCursor }
    }
  }`;

const LB_VARIANTS_BY_SKU = `#graphql
  query LbBridgeLbVariants($q: String!, $after: String) {
    productVariants(first: 250, query: $q, after: $after) {
      nodes { id sku product { id vendor } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

/** Job: match a brand's catalogue to L-Beauty variants by SKU (scoped by vendor). */
export async function matchBrandVariants({ brandId }: { brandId: string }) {
  const brand = await db.brand.findUnique({ where: { id: brandId } });
  if (!brand) return;

  // 1. Every variant + SKU in the brand store.
  const brandAdmin = await adminFor(brand.shopDomain);
  const brandVariants: BrandVariant[] = [];
  let after: string | null = null;
  do {
    const data: any = await gql(brandAdmin, BRAND_VARIANTS, { after });
    for (const v of data.productVariants.nodes) brandVariants.push({ id: v.id, sku: v.sku ?? "" });
    after = data.productVariants.pageInfo.hasNextPage ? data.productVariants.pageInfo.endCursor : null;
  } while (after);

  // 2. The matching L-Beauty variants, looked up in SKU batches.
  const lbAdmin = await adminFor(config.marketplaceShop);
  const skus = [...new Set(brandVariants.map((v) => normSku(v.sku)).filter(Boolean))];
  const lbVariants: LbVariant[] = [];
  for (let i = 0; i < skus.length; i += 40) {
    const q = skuSearchQuery(skus.slice(i, i + 40));
    let cursor: string | null = null;
    do {
      const data: any = await gql(lbAdmin, LB_VARIANTS_BY_SKU, { q, after: cursor });
      for (const v of data.productVariants.nodes) {
        lbVariants.push({ id: v.id, sku: v.sku ?? "", productId: v.product.id, vendor: v.product.vendor ?? "" });
      }
      cursor = data.productVariants.pageInfo.hasNextPage ? data.productVariants.pageInfo.endCursor : null;
    } while (cursor);
  }

  const result = matchVariants(brandVariants, lbVariants, brand.vendorName);

  // 3. Save, without stealing variants already mapped to a different brand.
  const taken = await db.variantMapping.findMany({
    where: { lbVariantId: { in: result.matches.map((m) => m.lbVariantId) }, NOT: { brandId } },
    select: { lbVariantId: true },
  });
  const takenSet = new Set(taken.map((t) => t.lbVariantId));
  const toSave = result.matches.filter((m) => !takenSet.has(m.lbVariantId));

  await db.$transaction(async (tx) => {
    await tx.variantMapping.deleteMany({
      where: { brandId, lbVariantId: { notIn: toSave.map((m) => m.lbVariantId) } },
    });
    for (const m of toSave) {
      await tx.variantMapping.upsert({
        where: { lbVariantId: m.lbVariantId },
        create: { ...m, brandId },
        update: { brandVariantId: m.brandVariantId, sku: m.sku, lbProductId: m.lbProductId },
      });
    }
  }, { timeout: 60_000 });

  const report = {
    brandVariants: brandVariants.length,
    matched: toSave.length,
    conflicts: [...takenSet].slice(0, 200),
    duplicateBrandSkus: result.duplicateBrandSkus.slice(0, 200),
    brandSkusMissing: result.brandSkusMissing,
    unmatchedLbSkus: result.unmatchedLbSkus.slice(0, 200),
    unmatchedLbSkuCount: result.unmatchedLbSkus.length,
  };
  await db.brand.update({
    where: { id: brandId },
    data: {
      mappedVariantCount: toSave.length,
      lastMatchedAt: new Date(),
      matchReport: report as unknown as Prisma.InputJsonValue,
    },
  });
}

const LB_VARIANT = `#graphql
  query LbBridgeVariant($id: ID!) { productVariant(id: $id) { id price title product { title } } }`;

/** Creates a TEST order in the brand store using one mapped product. */
export async function sendTestOrder(brandId: string, address: Record<string, string | null>) {
  const brand = await db.brand.findUnique({ where: { id: brandId } });
  if (!brand) throw new PermanentError("Brand not found");
  const mapping = await db.variantMapping.findFirst({ where: { brandId }, orderBy: { updatedAt: "desc" } });
  if (!mapping) throw new PermanentError("Run product matching first — no matched products yet");

  const lbAdmin = await adminFor(config.marketplaceShop);
  const v: any = (await gql(lbAdmin, LB_VARIANT, { id: `gid://shopify/ProductVariant/${mapping.lbVariantId}` }))?.productVariant;
  const price = toMinor(v?.price ?? 0);
  const ref = `TEST-${Date.now()}`;

  await db.lbOrder.create({ data: { lbOrderId: ref, name: ref, currency: brand.currency ?? "INR", routedAt: new Date() } });
  const bo = await db.brandOrder.create({
    data: {
      lbOrderId: ref,
      lbOrderName: ref,
      brandId,
      isTest: true,
      currency: brand.currency ?? "INR",
      subtotalMinor: price,
      transferInput: { email: null, phone: address.phone ?? null, taxesIncluded: true, shippingAddress: address } as Prisma.InputJsonValue,
      lines: {
        create: [{
          lbLineItemId: ref, lbVariantId: mapping.lbVariantId, brandVariantId: mapping.brandVariantId,
          sku: mapping.sku, title: v ? `${v.product.title} — ${v.title}` : mapping.sku,
          quantity: 1, unitPriceMinor: price, lineTotalMinor: price,
        }],
      },
    },
  });
  await logEvent(bo.id, "TEST_CREATED", "Test order requested from the L-Beauty admin");
  await enqueue("transfer_brand_order", { brandOrderId: bo.id }, { dedupeKey: `transfer:${bo.id}` });
  return bo.id;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
