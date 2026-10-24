# L-Beauty Order Bridge

A Shopify app that sends paid L-Beauty marketplace orders into each brand's own
Shopify store, and brings shipping, tracking, cancellations and refunds back to
L-Beauty. Built to run 200+ brands from one app.

One app, two roles:

| Installed on | What it does there |
|---|---|
| **L-Beauty's store** (`MARKETPLACE_SHOP`) | Watches paid orders, splits them by brand, receives shipments back, admin screens, reconciliation |
| **Each brand's store** | Receives L-Beauty orders (tagged `L-Beauty`), reports fulfillments/tracking/cancellations/refunds |

Brands still on the L-Beauty portal are untouched: lines whose product isn't
matched to a **live** Shopify brand stay in the portal flow.

---

## How brands connect: one link + approval

1. L-Beauty copies the **install link** from *Brands* in the app and sends it to a brand.
2. The brand opens it, reviews the access Shopify shows them, and clicks **Install**.
   The app receives a token for their store. No passwords or API keys change hands.
3. The brand appears under *Brands* as **Awaiting approval**, and a Slack alert fires.
4. L-Beauty **approves**, which starts SKU matching automatically. L-Beauty then checks
   the match report, sends a **test order**, and clicks **Go live**.

The same link works for every brand. That is why this is a **public app with an
unlisted listing**, not a custom-distribution app: custom distribution only
covers stores in a single Plus organization and [cannot be changed later](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method).

---

## Architecture (built for 200+ brands)

```
Shopify webhooks ──► /webhooks/events ──► Postgres job queue ──► worker(s) ──► Shopify Admin API
 (L-Beauty + brands)   verify, dedupe,       durable, retries,      npm run worker
                       drop irrelevant,      backoff, dead-letter   (scale horizontally)
                       enqueue (< 50 ms)
```

- **Webhooks never call Shopify inline.** They verify, de-duplicate by webhook ID,
  discard events that aren't about L-Beauty orders, and enqueue. This keeps
  responses fast no matter how many brand stores send traffic.
- **Job queue in Postgres** (`SELECT … FOR UPDATE SKIP LOCKED`). Run as many
  `npm run worker` processes as you need; they never pick up the same job.
  Shopify rate limits are per store, so 200 brand stores process in parallel.
- **Retries:** 30 s, 1 m, 2 m … capped at 1 h, 8 attempts. Throttling waits and retries.
  Data problems (for example out of stock, or a deleted variant) fail fast. After that
  the order shows **Failed**, a Slack alert fires, and the admin can **Retry**,
  **Retry all failed**, or **Handle via portal instead**.
- **No duplicates:** each brand order carries a reference tag. Before creating, the
  worker checks whether an earlier attempt already created it.
- **Timeline per order:** every attempt, error, shipment, refund and manual action is logged.
- **Privacy:** customer details are stored only until the brand order is created,
  then deleted. The buyer's email is not shared with brands unless `SHARE_CUSTOMER_EMAIL=true`.
- **SKU collisions across brands:** matching is scoped by each brand's **vendor name**
  in the L-Beauty catalogue, and a variant can never be mapped to two brands.

### What's included (from the requirement)

| Requirement | Where |
|---|---|
| Automatic routing, incl. multi-brand orders | `handlers/orders.server.ts` → `routeLbOrder` |
| Product/variant matching | `handlers/brands.server.ts` → SKU match per brand, report in *Brands › brand* |
| Fulfillment + tracking back to L-Beauty | `handlers/sync-back.server.ts` → `brandFulfillment` |
| Admin view of each brand order + transfer status | *Brand orders* list + order page with timeline |
| Alerts, retries, manual recovery | job queue + Slack alerts + Retry / Retry all failed / Handle via portal |
| Cancellation, return, refund info | `orderCancelled`, `refundCreated`; shown on the order page |
| Reconciliation export (sales, refunds, commission, due) | *Reconciliation* + payouts / order-detail CSV |
| Pilot with first brands, staged rollout | Approve → match → test order → Go live, per brand |
| Brands with a 3PL on Shopify | Orders land in the brand store like any order, so their Shopify→3PL flow picks them up. Use the test order to confirm. |

Beyond the brief: brand health (failure rate, brand cancellations, average time to
ship over 30 days), bulk retry, queue monitor on the overview, and a status page
inside each brand's admin.

---

## Run it locally (macOS)

Prerequisites: Node 22.12+, Docker Desktop, [Shopify CLI](https://shopify.dev/docs/api/shopify-cli), a Shopify Partner account, and two or more development stores (one plays L-Beauty, the others play brands).

```bash
npm install
cp .env.example .env              # set MARKETPLACE_SHOP to your "L-Beauty" dev store
npm run db:up                     # local Postgres in Docker
npx prisma migrate dev --name init
npm run config:link               # create/link the app in your Partner/Dev Dashboard
npm run graphql-codegen           # validates every query against the 2026-10 Admin schema
npm test                          # core logic tests
npm run dev                       # terminal 1: app + tunnel
npm run worker                    # terminal 2: background worker
```

1. Install on the **L-Beauty dev store** (press `p` in the CLI). You'll see the overview.
2. Open **Brands**, copy the install link, and open it while logged in to a **brand dev store**.
3. Back on L-Beauty: approve the brand, set its vendor name, check matching, send a test order, then Go live.
4. Place a paid order on the L-Beauty store for that brand's product. It appears in the brand store within seconds.
5. Fulfil it in the brand store with a tracking number. The L-Beauty order becomes fulfilled with the same tracking.

> Dev stores limit how many orders an app can create per minute. That's fine for testing.

---

## Before going live

1. **Distribution:** in the app's dashboard choose **Public distribution** and
   create the listing with **unlisted** visibility. Submit for review. Until it's
   approved, the app can only be installed on development stores.
2. **Protected customer data:** in the dashboard, request access to customer
   **name, address and phone** (and email only if you enable `SHARE_CUSTOMER_EMAIL`).
   The reason is "to create marketplace orders the merchant fulfils". The app keeps
   data only until the order is delivered to the brand. The compliance
   webhooks are implemented in `webhooks.compliance.tsx`.
3. **Hosting:** any Node host + managed Postgres. Run one web process and one or more
   worker processes from the same image (`docker compose --profile prod up --scale worker=3`).
   If your host can't run a worker, call `POST /api/jobs/tick` every minute with
   `Authorization: Bearer $CRON_SECRET`.
4. Set `ALERT_WEBHOOK_URL` so failures reach your ops channel.
5. Pilot with three brands, then onboard the rest in batches.

### Scaling notes

- 200 brands × typical order volume is a few webhooks per second at peak, which is well
  within one web process. Add worker processes if the overview shows the queue growing.
- Brand stores also send events for their own non-L-Beauty orders. The webhook route
  drops these after one indexed lookup. Above a few thousand brands, consider
  Shopify's EventBridge / Pub/Sub delivery instead of HTTPS.
- Reconciliation computes in the app. Monthly ranges with tens of thousands of orders
  are fine. For multi-year exports, move the aggregation into SQL.

---

## Assumptions to confirm with L-Beauty

- **Price sent to the brand** is the price the customer paid after discounts. Commission
  is deducted in reconciliation, not on the brand order. Shipping is shown to the brand as 0.
- **L-Beauty's own fulfillment orders** for brand products must be open at a
  merchant-managed location so the app can mark them fulfilled. If L-Beauty uses a
  fulfillment service app for these products, the scope changes slightly.
- **Same currency** in L-Beauty and brand stores (for example INR). Taxes follow the
  L-Beauty order's "taxes included" setting; GST invoicing stays with whoever issues the invoice today.
- **Brand changes after transfer** (editing items on the order) are not synced back. The
  brand page asks brands to contact L-Beauty instead.
- **Inventory** is not synced by this app. That is left to the existing product sync. If a
  brand is out of stock, order creation fails, the order shows Failed and an alert fires.
- **Matching** uses SKU + vendor. Products whose SKUs differ between stores need their
  SKUs aligned (the match report lists them).

## Project layout

```
app/lib/core/          pure business logic (split, fulfillment plan, reconciliation, SKU match) — unit tested
app/lib/handlers/      background jobs: orders, sync-back, brands
app/lib/jobs.server.ts Postgres job queue
app/routes/            admin pages, webhooks, cron tick, CSV export
worker/index.ts        worker process
prisma/schema.prisma   data model
tests/core.test.ts     tests (npm test)
```
