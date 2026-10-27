// All connected brands: install link, approval queue, health per brand.

import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { BrandStatus, Prisma } from "@prisma/client";
import db from "../db.server";
import { requireMarketplace } from "../lib/guard.server";
import { config } from "../lib/config.server";
import { StatusBadge, showToast, statusLabel, when } from "../lib/ui";

const PAGE = 50;
const STATUSES: BrandStatus[] = ["PENDING_APPROVAL", "APPROVED", "ACTIVE", "PAUSED", "UNINSTALLED"];

interface Health {
  brandId: string;
  total: number;
  failed: number;
  brand_cancelled: number;
  avg_ship_hours: number | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireMarketplace(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") as BrandStatus | null;
  const q = url.searchParams.get("q")?.trim() || undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));

  const where: Prisma.BrandWhereInput = {
    ...(status && STATUSES.includes(status) ? { status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { shopDomain: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [brands, total] = await Promise.all([
    db.brand.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    db.brand.count({ where }),
  ]);

  // 30-day health for the brands on this page, in one query.
  const ids = brands.map((b) => b.id);
  const health = ids.length
    ? await db.$queryRaw<Health[]>`
        SELECT "brandId",
               count(*)::int AS total,
               (count(*) FILTER (WHERE "status" = 'FAILED'))::int AS failed,
               (count(*) FILTER (WHERE "status" = 'BRAND_CANCELLED'))::int AS brand_cancelled,
               (avg(extract(epoch FROM ("fulfilledAt" - "transferredAt"))) / 3600)::float8 AS avg_ship_hours
          FROM "BrandOrder"
         WHERE "isTest" = false
           AND "createdAt" > now() - interval '30 days'
           AND "brandId" = ANY(${ids})
         GROUP BY "brandId"`
    : [];

  return {
    brands,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE)),
    health: Object.fromEntries(health.map((h) => [h.brandId, h])) as Record<string, Health>,
    installUrl: config.brandInstallUrl,
  };
};

export default function Brands() {
  const { brands, total, page, pages, health, installUrl } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const pageHref = (p: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    return `/app/brands?${next}`;
  };
  const copy = async () => {
    await navigator.clipboard.writeText(installUrl);
    showToast("Install link copied");
  };

  return (
    <s-page heading="Brands">
      <s-section heading="Brand install link">
        <s-paragraph>
          Send this link to any brand on Shopify. They open it, review the access requested and click
          Install. They then appear below as “Awaiting approval”. One link works for every brand.
        </s-paragraph>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-text-field label="Install link" labelAccessibilityVisibility="exclusive" value={installUrl} readOnly />
          <s-button onClick={copy}>Copy link</s-button>
        </s-stack>
      </s-section>

      <s-section>
        <Form method="get">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-text-field label="Search brand or store" name="q" defaultValue={params.get("q") ?? ""} />
            <s-select label="Status" name="status" value={params.get("status") ?? ""}>
              <s-option value="">All</s-option>
              {STATUSES.map((s) => <s-option key={s} value={s}>{statusLabel(s)}</s-option>)}
            </s-select>
            <s-button type="submit">Filter</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading={`${total} brand(s)`}>
        <s-table>
          <s-table-header-row>
            <s-table-header>Brand</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Matched products</s-table-header>
            <s-table-header>Orders (30d)</s-table-header>
            <s-table-header>Failed</s-table-header>
            <s-table-header>Brand cancels</s-table-header>
            <s-table-header>Avg. time to ship</s-table-header>
            <s-table-header>Installed</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {brands.map((b) => {
              const h = health[b.id];
              return (
                <s-table-row key={b.id}>
                  <s-table-cell>
                    <s-link href={`/app/brands/${b.id}`}>{b.name}</s-link>
                    <s-text color="subdued"> {b.shopDomain}</s-text>
                  </s-table-cell>
                  <s-table-cell><StatusBadge status={b.status} /></s-table-cell>
                  <s-table-cell>{b.mappedVariantCount}</s-table-cell>
                  <s-table-cell>{h?.total ?? 0}</s-table-cell>
                  <s-table-cell>{h?.failed ?? 0}</s-table-cell>
                  <s-table-cell>{h?.brand_cancelled ?? 0}</s-table-cell>
                  <s-table-cell>{h?.avg_ship_hours != null ? `${(h.avg_ship_hours / 24).toFixed(1)} days` : "—"}</s-table-cell>
                  <s-table-cell>{when(b.installedAt)}</s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>
        <s-stack direction="inline" gap="base">
          {page > 1 && <s-link href={pageHref(page - 1)}>← Previous</s-link>}
          <s-text>Page {page} of {pages}</s-text>
          {page < pages && <s-link href={pageHref(page + 1)}>Next →</s-link>}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
