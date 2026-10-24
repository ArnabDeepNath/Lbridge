import "./env.server";
import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const DEFAULT_SCOPES = [
  "read_orders",
  "write_orders",
  "read_products",
  "read_merchant_managed_fulfillment_orders",
  "write_merchant_managed_fulfillment_orders",
];

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October26,
  scopes: process.env.SCOPES ? process.env.SCOPES.split(",") : DEFAULT_SCOPES,
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  // Public app with an unlisted listing: one install link works for every brand.
  distribution: AppDistribution.AppStore,
  hooks: {
    // Runs when L-Beauty or a brand installs (or re-installs) the app.
    afterAuth: async ({ session, admin }) => {
      // Lazy import avoids a module cycle (handlers use this file's exports).
      const { onInstall } = await import("./lib/handlers/brands.server");
      await onInstall(session.shop, admin);
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
