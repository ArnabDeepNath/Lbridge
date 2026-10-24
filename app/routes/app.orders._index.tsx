// Every brand order with its transfer status. Filter, search, bulk-retry.

import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useSearchParams, useActionData, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { Prisma, BrandOrderStatus } from "@prisma/client";
import db from "../db.server";
import { requireMarketplace } from "../lib/guard.server";
import { retryBrandOrders } from "../lib/handlers/orders.server";
import { StatusBadge, money, statusLabel, when } from "../lib/ui";

const PAGE = 50;
const STATUSES: BrandOrderStatus[] = [
  "PENDING", "TRANSFERRED", "PARTIALLY_FULFILLED", "FULFILLED", "FAILED", "LB_CANCELLED", "BRAND_CANCELLED", "CANCELLED",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireMarketplace(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") as BrandOrderStatus | null;
  const brandId = url.searchParams.get("brand") || undefined;
  const q = url.searchParams.get("q")?.trim() || undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));

  const where: Prisma.BrandOrderWhereInput = {
    ...(status && STATUSES.includes(status) ? { status } : {}),
    ...(brandId ? { brandId } : {}),
    ...(q
      ? { OR: [{ lbOrderName: { contains: q, mode: "insensitive" } }, { brandOrderName: { contains: q, mode: "insensitive" } }] }
      : {}),
  };
  const [orders, total, brands] = await Promise.all([
    db.brandOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { brand: { select: { name: true } } },
    }),
    db.brandOrder.count({ where }),
    db.brand.findMany({ where: { status: { not: "UNINSTALLED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { orders, total, page, pages: Math.max(1, Math.ceil(total / PAGE)), brands };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireMarketplace(request);
  const form = await request.formData();
  if (form.get("intent") === "retry-all-failed") {
    const failed = await db.brandOrder.findMany({ where: { status: "FAILED", brandOrderId: null }, select: { id: true }, take: 1000 });
    return { retried: await retryBrandOrders(failed.map((f) => f.id)) };
  }
  const ids = form.getAll("ids").map(String);
  return { retried: await retryBrandOrders(ids) };
};

export default function Orders() {
  const { orders, total, page, pages, brands } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const [params] = useSearchParams();
  const nav = useNavigation();
  const submit = useSubmit();
  const pageHref = (p: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    return `/app/orders?${next}`;
  };

  return (
    <s-page heading="Brand orders">
      {result && (
        <s-banner tone="success">{result.retried} order(s) queued for another attempt.</s-banner>
      )}

      <s-section>
        <Form method="get">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-text-field label="Search order number" name="q" defaultValue={params.get("q") ?? ""} />
            <s-select label="Status" name="status" value={params.get("status") ?? ""}>
              <s-option value="">All</s-option>
              {STATUSES.map((s) => <s-option key={s} value={s}>{statusLabel(s)}</s-option>)}
            </s-select>
            <s-select label="Brand" name="brand" value={params.get("brand") ?? ""}>
              <s-option value="">All brands</s-option>
              {brands.map((b) => <s-option key={b.id} value={b.id}>{b.name}</s-option>)}
            </s-select>
            <s-button type="submit">Filter</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading={`${total.toLocaleString("en-IN")} order(s)`}>
        <Form method="post">
          <s-stack direction="inline" gap="base">
            <s-button type="submit" disabled={nav.state !== "idle"}>Retry selected</s-button>
            <s-button
              tone="critical"
              disabled={nav.state !== "idle"}
              onClick={() => submit({ intent: "retry-all-failed" }, { method: "post" })}
            >
              Retry all failed
            </s-button>
          </s-stack>
          <s-table>
            <s-table-header-row>
              <s-table-header />
              <s-table-header>L-Beauty order</s-table-header>
              <s-table-header>Brand</s-table-header>
              <s-table-header>Brand order</s-table-header>
              <s-table-header>Value</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Created</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {orders.map((o) => (
                <s-table-row key={o.id}>
                  <s-table-cell>
                    {o.status === "FAILED" && !o.brandOrderId ? <s-checkbox name="ids" value={o.id} accessibilityLabel={`Select ${o.lbOrderName}`} /> : null}
                  </s-table-cell>
                  <s-table-cell>
                    <s-link href={`/app/orders/${o.id}`}>{o.lbOrderName}</s-link>{o.isTest ? " (test)" : ""}
                  </s-table-cell>
                  <s-table-cell>{o.brand.name}</s-table-cell>
                  <s-table-cell>{o.brandOrderName ?? "—"}</s-table-cell>
                  <s-table-cell>{money(o.subtotalMinor, o.currency)}</s-table-cell>
                  <s-table-cell><StatusBadge status={o.status} /></s-table-cell>
                  <s-table-cell>{when(o.createdAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </Form>
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
