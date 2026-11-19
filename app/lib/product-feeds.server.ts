// Worker-side contextual product-feed processing and Shopify Admin feedback.

import { Prisma } from "@prisma/client";
import db from "../db.server";
import { adminFor, assertNoUserErrors, gql } from "./shopify-api.server";
import {
  feedVariants,
  normalizeProductUpdatedAt,
  primaryFeedImage,
  shouldRemoveDirectoryProduct,
  validateDirectoryProduct,
  type ProductFeedPayload,
} from "./core/product-feed.ts";

const PRODUCT_FEEDBACK = `#graphql
  mutation ReportLBridgeProductIssues($feedbackInput: [ProductResourceFeedbackInput!]!) {
    bulkProductResourceFeedbackCreate(feedbackInput: $feedbackInput) {
      feedback { productId state }
      userErrors { field message }
    }
  }
`;

async function reportProductFeedback(shop: string, productId: string, productUpdatedAt: Date, messages: string[]) {
  const admin = await adminFor(shop);
  const connection = await db.channelConnection.findUnique({ where: { shopDomain: shop }, select: { channelId: true } });
  const data = await gql(admin, PRODUCT_FEEDBACK, {
    feedbackInput: [{
      productId,
      channelId: connection?.channelId ?? undefined,
      state: messages.length ? "REQUIRES_ACTION" : "ACCEPTED",
      feedbackGeneratedAt: new Date().toISOString(),
      productUpdatedAt: productUpdatedAt.toISOString(),
      messages: messages.length ? messages : undefined,
    }],
  });
  assertNoUserErrors("Could not report product feedback", data?.bulkProductResourceFeedbackCreate?.userErrors);
}

export async function processProductFeed({ shop, payload }: { shop: string; payload: ProductFeedPayload }) {
  const product = payload.product;
  const feed = payload.productFeed;
  if (!product?.id || !feed?.id) return;

  await db.productFeed.upsert({
    where: { feedId: feed.id },
    create: { feedId: feed.id, shopDomain: shop, country: feed.country, language: feed.language },
    update: { country: feed.country, language: feed.language, lastError: null },
  });

  if (shouldRemoveDirectoryProduct(payload)) {
    await db.directoryProduct.deleteMany({ where: { shopDomain: shop, feedId: feed.id, productId: product.id } });
    return;
  }

  const action = payload.metadata?.action?.toUpperCase();
  if (!["CREATE", "UPDATE"].includes(action ?? "") || product.isPublished !== true) return;

  const messages = validateDirectoryProduct(product);
  const productUpdatedAt = normalizeProductUpdatedAt(product);
  const image = primaryFeedImage(product);
  const variants = feedVariants(product);

  await db.$transaction(async (tx) => {
    const saved = await tx.directoryProduct.upsert({
      where: { shopDomain_feedId_productId: { shopDomain: shop, feedId: feed.id!, productId: product.id } },
      create: {
        shopDomain: shop,
        feedId: feed.id!,
        productId: product.id,
        country: feed.country,
        language: feed.language,
        title: product.title?.trim() || "Untitled product",
        handle: product.handle,
        description: product.description,
        onlineStoreUrl: product.onlineStoreUrl,
        imageUrl: image?.url,
        imageWidth: image?.width,
        imageHeight: image?.height,
        isPublished: true,
        validationMessages: messages,
        payload: product as Prisma.InputJsonValue,
        productUpdatedAt,
      },
      update: {
        country: feed.country,
        language: feed.language,
        title: product.title?.trim() || "Untitled product",
        handle: product.handle,
        description: product.description,
        onlineStoreUrl: product.onlineStoreUrl,
        imageUrl: image?.url,
        imageWidth: image?.width,
        imageHeight: image?.height,
        isPublished: true,
        validationMessages: messages,
        payload: product as Prisma.InputJsonValue,
        productUpdatedAt,
        lastSyncedAt: new Date(),
      },
    });

    await tx.directoryVariant.deleteMany({ where: { directoryProductId: saved.id } });
    if (variants.length) {
      await tx.directoryVariant.createMany({
        data: variants.map((variant) => ({
          directoryProductId: saved.id,
          variantId: variant.id,
          title: variant.title?.trim() || "Default",
          sku: variant.sku?.trim() || null,
          priceAmount: String(variant.price?.amount ?? "0"),
          priceCurrency: variant.price?.currencyCode || "USD",
          compareAtPriceAmount: variant.compareAtPrice?.amount == null ? null : String(variant.compareAtPrice.amount),
          quantityAvailable: variant.quantityAvailable ?? 0,
          availableForSale: variant.availableForSale ?? false,
          payload: variant as Prisma.InputJsonValue,
        })),
      });
    }
  });

  await reportProductFeedback(shop, product.id, productUpdatedAt, messages);
}

export async function processProductFeedStatus({ shop, payload }: { shop: string; payload: ProductFeedPayload }) {
  const feedId = payload.productFeed?.id || payload.id;
  if (!feedId) return;
  const fullSync = payload.fullSync;
  const status = fullSync?.status || payload.status || "active";
  await db.productFeed.upsert({
    where: { feedId },
    create: {
      feedId,
      shopDomain: shop,
      country: payload.productFeed?.country || payload.country,
      language: payload.productFeed?.language || payload.language,
      status,
      lastFullSyncAt: fullSync ? new Date() : null,
      lastFullSyncCount: fullSync?.count ?? null,
      lastError: fullSync?.errorCode || null,
    },
    update: {
      country: payload.productFeed?.country || payload.country,
      language: payload.productFeed?.language || payload.language,
      status,
      ...(fullSync ? { lastFullSyncAt: new Date(), lastFullSyncCount: fullSync.count ?? null } : {}),
      lastError: fullSync?.errorCode || null,
    },
  });
}
