// Home page. L-Beauty sees the operations overview; a brand sees its
// connection status and the L-Beauty orders it has received.

import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { isMarketplace } from "../lib/config.server";
import { queueStats } from "../lib/jobs.server";
import { StatusBadge, money, when } from "../lib/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (!isMarketplace(session.shop)) {
    const brand = await db.brand.findUnique({ where: { shopDomain: session.shop } });
    const orders = brand
      ? await db.brandOrder.findMany({
          where: { brandId: brand.id },
          orderBy: { createdAt: "desc" },
          take: 25,
          select: { id: true, lbOrderName: true, brandOrderName: true, status: true, subtotalMinor: true, currency: true, createdAt: true, isTest: true },
        })
      : [];
    return { role: "brand" as const, brand, orders };
  }

  const since = new Date(Date.now() - 7 * 86_400_000);
  const [byStatus, brandsByStatus, attention, queue] = await Promise.all([
    db.brandOrder.groupBy({ by: ["status"], where: { createdAt: { gte: since }, isTest: false }, _count: { _all: true } }),
    db.brand.groupBy({ by: ["status"], _count: { _all: true } }),
    db.brandOrder.findMany({
      where: { OR: [{ status: "FAILED" }, { status: "BRAND_CANCELLED" }, { status: "PENDING", attempts: { gte: 2 } }] },
      orderBy: { updatedAt: "desc" },
      take: 15,
      include: { brand: { select: { name: true } } },
    }),
    queueStats(),
  ]);
  return {
    role: "marketplace" as const,
    orderCounts: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Record<string, number>,
    brandCounts: Object.fromEntries(brandsByStatus.map((r) => [r.status, r._count._all])) as Record<string, number>,
    attention,
    queue,
  };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();
  return data.role === "brand" ? <BrandHome data={data} /> : <MarketplaceHome data={data} />;
}

function MarketplaceHome({ data }: { data: Extract<ReturnType<typeof useLoaderData<typeof loader>>, { role: "marketplace" }> }) {
  const c = data.orderCounts;
  const b = data.brandCounts;
  const total = Object.values(c).reduce((s, n) => s + n, 0);
  return (
    <s-page heading="L-Beauty Order Bridge">
      {(b.PENDING_APPROVAL ?? 0) > 0 && (
        <s-banner tone="warning" heading={`${b.PENDING_APPROVAL} brand(s) waiting for approval`}>
          <s-paragraph>
            <s-link href="/app/brands?status=PENDING_APPROVAL">Review new brands</s-link>
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Last 7 days">
        <s-stack direction="inline" gap="large">
          <Stat label="Brand orders" value={total} />
          <Stat label="Sent to brands" value={(c.TRANSFERRED ?? 0) + (c.PARTIALLY_FULFILLED ?? 0)} />
          <Stat label="Shipped" value={c.FULFILLED ?? 0} />
          <Stat label="Failed" value={c.FAILED ?? 0} />
          <Stat label="Cancelled by brand" value={c.BRAND_CANCELLED ?? 0} />
        </s-stack>
      </s-section>

      <s-section heading="Needs attention">
        {data.attention.length === 0 ? (
          <s-paragraph>Nothing needs attention. All transfers are running normally.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>L-Beauty order</s-table-header>
              <s-table-header>Brand</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Problem</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.attention.map((o) => (
                <s-table-row key={o.id}>
                  <s-table-cell><s-link href={`/app/orders/${o.id}`}>{o.lbOrderName}</s-link></s-table-cell>
                  <s-table-cell>{o.brand.name}</s-table-cell>
                  <s-table-cell><StatusBadge status={o.status} /></s-table-cell>
                  <s-table-cell>{o.lastError ?? "—"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Brands">
        <s-stack direction="inline" gap="large">
          <Stat label="Live" value={b.ACTIVE ?? 0} />
          <Stat label="Onboarding" value={b.APPROVED ?? 0} />
          <Stat label="Awaiting approval" value={b.PENDING_APPROVAL ?? 0} />
          <Stat label="Paused" value={b.PAUSED ?? 0} />
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Background queue">
        <s-paragraph>Queued: {data.queue.QUEUED ?? 0} · Running: {data.queue.RUNNING ?? 0}</s-paragraph>
        <s-paragraph>Gave up: {data.queue.DEAD ?? 0}</s-paragraph>
        {(data.queue.QUEUED ?? 0) > 500 && (
          <s-paragraph>The queue is growing — add another worker process.</s-paragraph>
        )}
      </s-section>
    </s-page>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <s-box padding="base" border="base" borderRadius="base" minInlineSize="140px">
      <s-text color="subdued">{label}</s-text>
      <s-heading>{value.toLocaleString("en-IN")}</s-heading>
    </s-box>
  );
}

function BrandHome({ data }: { data: Extract<ReturnType<typeof useLoaderData<typeof loader>>, { role: "brand" }> }) {
  const { brand, orders } = data;
  const steps = [
    { done: !!brand, label: "App installed" },
    { done: !!brand && brand.status !== "PENDING_APPROVAL", label: "Approved by L-Beauty" },
    { done: !!brand && brand.mappedVariantCount > 0, label: "Products matched to the L-Beauty catalogue" },
    { done: brand?.status === "ACTIVE", label: "Live — L-Beauty orders arrive in your Orders list" },
  ];
  return (
    <s-page heading="L-Beauty marketplace">
      <s-section heading="Connection">
        {brand ? <StatusBadge status={brand.status} /> : <s-badge tone="warning">Setting up</s-badge>}
        <s-stack gap="small-200">
          {steps.map((s) => (
            <s-paragraph key={s.label}>{s.done ? "✓" : "○"} {s.label}</s-paragraph>
          ))}
        </s-stack>
        <s-paragraph>
          Paid L-Beauty orders for your products are created in your store with the tag “L-Beauty”.
          Fulfil them as usual (or through your 3PL). Tracking is sent back to L-Beauty automatically.
          Please don’t edit the items on these orders; contact L-Beauty if something can’t be shipped.
        </s-paragraph>
      </s-section>

      <s-section heading="Recent L-Beauty orders">
        {orders.length === 0 ? (
          <s-paragraph>No orders yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Your order</s-table-header>
              <s-table-header>L-Beauty order</s-table-header>
              <s-table-header>Value</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Received</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {orders.map((o) => (
                <s-table-row key={o.id}>
                  <s-table-cell>{o.brandOrderName ?? "—"}{o.isTest ? " (test)" : ""}</s-table-cell>
                  <s-table-cell>{o.lbOrderName}</s-table-cell>
                  <s-table-cell>{money(o.subtotalMinor, o.currency)}</s-table-cell>
                  <s-table-cell><StatusBadge status={o.status} /></s-table-cell>
                  <s-table-cell>{when(o.createdAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
