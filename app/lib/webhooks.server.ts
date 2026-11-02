import { createHmac, timingSafeEqual } from "node:crypto";

const HMAC_HEADER = "X-Shopify-Hmac-Sha256";

export async function verifyShopifyWebhook(request: Request): Promise<boolean> {
  const secret = process.env.SHOPIFY_API_SECRET || "";
  if (!secret) return false;

  const header = request.headers.get(HMAC_HEADER) ?? "";
  const rawBody = await request.text();
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  const got = Buffer.from(header, "utf8");
  const want = Buffer.from(digest, "utf8");
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function verifyWebhookOrReject(request: Request): Promise<Response | null> {
  const ok = await verifyShopifyWebhook(request);
  return ok ? null : new Response("Unauthorized", { status: 401 });
}