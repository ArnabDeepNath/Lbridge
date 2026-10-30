// Runtime configuration (see .env.example).
import "../env.server";

const bool = (v: string | undefined, d = false) =>
  v === undefined ? d : ["1", "true", "yes", "on"].includes(v.toLowerCase());

export const config = {
  /** L-Beauty's own store. Every other store that installs is a brand. */
  marketplaceShop: (
    process.env.MARKETPLACE_SHOP ||
    process.env.MARKETPLACE_SHOP_DOMAIN ||
    "lbeauty-demo-marketplace.myshopify.com"
  )
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, ""),
  /** Slack-compatible incoming webhook for alerts (optional). */
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || "",
  /** Pass the buyer's email to brand stores (default off — brands get the address only). */
  shareCustomerEmail: bool(process.env.SHARE_CUSTOMER_EMAIL),
  /** Cancel the brand order automatically when L-Beauty cancels (if unshipped). */
  autoCancelAtBrand: bool(process.env.AUTO_CANCEL_AT_BRAND),
  /** Tag added to every order created in a brand store. */
  orderTag: process.env.ORDER_TAG || "L-Beauty",
  /** Gateway / shipping-line label shown in brand stores. */
  channelLabel: process.env.CHANNEL_LABEL || "L-Beauty Marketplace",
  /** Link brands open to install. Use the unlisted App Store listing URL once approved. */
  brandInstallUrl:
    process.env.BRAND_INSTALL_URL ||
    `https://admin.shopify.com/oauth/install?client_id=${process.env.SHOPIFY_API_KEY || "fd77ecddff8c7efa0418e2e93d5c97e5"}`,
  /** Worker tuning */
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY || 8),
  workerPollMs: Number(process.env.WORKER_POLL_MS || 1000),
  /** Secret for the /api/jobs/tick endpoint (serverless hosting without a worker). */
  cronSecret: process.env.CRON_SECRET || "",
};

export function isMarketplace(shop: string | null | undefined): boolean {
  return !!shop && !!config.marketplaceShop && shop.toLowerCase() === config.marketplaceShop;
}

if (!config.marketplaceShop) {
  console.warn("[config] MARKETPLACE_SHOP is not set — no store will be treated as L-Beauty.");
}
