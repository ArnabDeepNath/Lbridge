# LBridge Sales Channel runbook (Reference 147683)

## 1. Configure and migrate

1. Use Shopify CLI 4.0+ (the repository currently declares CLI 5.x) and Node 22.12+.
2. Copy `.env.example` values into your protected local/hosting environment. Set `LBRIDGE_ACCOUNT_VERIFY_URL` to the real external account verification endpoint and replace the support placeholders.
3. Apply the new database tables with `npx prisma migrate deploy` and run the web app plus at least one worker (`npm run worker`). Feed webhooks enqueue work; the worker performs catalog writes and Admin feedback calls.
4. Review `extensions/channel-config/specifications/lbridge-channel.toml`. It currently supports English/US/USD and English/IN/INR. Remove any market the directory does not actually support before deploying.

The account verification endpoint receives a bearer API key and `{ accountId, shop }`. It must return HTTP 200 and `{ "valid": true, "accountName": "…", "directoryUrl": "https://…" }`. The API key is never saved. The optional response fields override the values entered in Admin.

## 2. Deploy (irreversible Sales Channel conversion)

Validate first:

```bash
shopify app config validate --json
npm test
npm run typecheck
npm run build
```

Then deploy the root app configuration and `channel_config` extension:

```bash
shopify app deploy
```

Deploying `channel_config` permanently declares the app as a Sales Channel. This was **not** executed by the code-generation task. Reinstall/reauthorize the development store after deployment so the new scopes and declarative feed webhook subscriptions take effect.

## 3. Connection and feed flow

The Admin home contains the Account connection, active Banner, publishing summary, external directory link, and Footer help. On Connect, `app/lib/channel.server.ts` performs these operations in strict order:

1. `channelCreate` with specification `lbridge-marketplace` and the verified external `accountId`/`accountName`.
2. `storefrontAccessTokenCreate`, saving the token ID and token server-side.
3. `channelFullSync` for the new channel ID.

The 2026-10 API uses flat `accountId` and `accountName` inputs (not a nested `account` object). Disconnect deletes the Shopify channel/token and clears the local catalog.

Declarative webhook routes:

- `/api/webhooks/feeds-full-sync`
- `/api/webhooks/feeds-full-sync-finish`
- `/api/webhooks/feeds-incremental-sync`
- `/api/webhooks/feeds-update`

`CREATE`/`UPDATE` events with `product.isPublished === true` upsert localized product/variant data. `DELETE` or `isPublished === false` deletes the listing. Validation failures are sent with the 2026-10 `bulkProductResourceFeedbackCreate` mutation, including the required `productUpdatedAt`; valid products are marked `ACCEPTED` to clear earlier feedback.

## 4. Shopify Checkout only

The public `/directory/{shop}.myshopify.com` page has no payment capture. Its Buy Now form calls `/api/checkout`, which redirects to an attributed cart permalink containing `access_token` and `source_name=channel:{channelHandle}`.

For the Storefront Cart API alternative, submit `method=cart` to `/api/checkout`. The backend calls `cartCreate` at the shop's 2026-10 Storefront endpoint with `X-Shopify-Storefront-Access-Token`, then redirects to `cart.checkoutUrl`. Request JSON responses with `Accept: application/json` when integrating a separate directory frontend.

The existing Admin API `orderCreate` in `app/lib/handlers/orders.server.ts` is retained intentionally: it routes an **already-paid L-Beauty marketplace order** to the fulfilling brand. It is not used by the external directory to create buyer orders or capture payment.

## 5. Billing audit

No Stripe, Razorpay, external pricing page, in-app subscription charge, or usage charge was found in the embedded app. LBridge is therefore represented as free in this revision, and no billing mutation is triggered. If monetization is added before submission, use Shopify's supported App Pricing/Billing surface and send merchants to Shopify's `confirmationUrl`; do not add external payment/pricing links to the embedded UI. Re-run the billing audit after any pricing change.

## 6. Reviewer submission assets

Complete `docs/reviewer-testing-instructions.md` with real pre-created, 2FA-free test credentials and the live directory URL. Never commit those credentials. Record a clean 2–3 minute English screencast showing:

1. Install LBridge and approve the new scopes.
2. Connect the external account through Account connection and show the active Banner.
3. Publish a valid product to LBridge in Shopify Admin and wait for the feed sync.
4. Open **View on LBridge Directory** and show the synced product.
5. Click **Buy Now with Shopify** and land on Shopify Checkout.
6. Optionally publish a product without an image/SKU and show `REQUIRES_ACTION` feedback in Shopify Admin.

Useful Shopify documentation:

- [Channel config extension](https://shopify.dev/docs/apps/build/sales-channels/channel-config-extension)
- [Managing channel connections](https://shopify.dev/docs/apps/build/sales-channels/channel-connections)
- [Contextual product feeds](https://shopify.dev/docs/apps/build/sales-channels/contextual-product-feeds)
- [Cart permalinks and Sales Channel attribution](https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks)
- [Storefront Cart API](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/migrate-to-cart-api/migrate-your-app)
- [Product resource feedback](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/bulkProductResourceFeedbackCreate)
