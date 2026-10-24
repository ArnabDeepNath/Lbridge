// Brand-level reconciliation: sales, refunds, commission, amount due.

import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useSearchParams } from "react-router";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import db from "../db.server";
import { requireMarketplace } from "../lib/guard.server";
import { parseRange, summarize } from "../lib/reconciliation.server";
import { downloadFile, money } from "../lib/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireMarketplace(request);
  const range = parseRange(new URL(request.url));
  const [{ rows, currency }, brands] = await Promise.all([
    summarize(range),
    db.brand.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const totals = rows.reduce(
    (t, r) => ({
      gross: t.gross + r.grossMinor,
      refunds: t.refunds + r.refundsMinor,
      commission: t.commission + r.commissionMinor,
      due: t.due + r.dueMinor,
    }),
    { gross: 0, refunds: 0, commission: 0, due: 0 },
  );
  return { rows, currency, totals, brands, fromStr: range.fromStr, toStr: range.toStr };
};

export default function Reconciliation() {
  const { rows, currency, totals, brands, fromStr, toStr } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const shopify = useAppBridge();
  const [busy, setBusy] = useState(false);
  const m = (n: number) => money(n, currency);

  const download = async (detail: boolean) => {
    setBusy(true);
    try {
      const qs = new URLSearchParams(params);
      if (detail) qs.set("detail", "1");
      await downloadFile(`/app/reconciliation-export?${qs}`, `l-beauty-${detail ? "orders" : "payouts"}-${fromStr}-to-${toStr}.csv`);
    } catch (e) {
      shopify.toast.show((e as Error).message, { isError: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <s-page heading="Reconciliation">
      <s-section>
        <Form method="get">
          <s-stack direction="inline" gap="base" alignItems="end">
            <label>
              <s-text>From</s-text>
              <br />
              <input type="date" name="from" defaultValue={fromStr} />
            </label>
            <label>
              <s-text>To</s-text>
              <br />
              <input type="date" name="to" defaultValue={toStr} />
            </label>
            <s-select label="Brand" name="brand" value={params.get("brand") ?? ""}>
              <s-option value="">All brands</s-option>
              {brands.map((b) => <s-option key={b.id} value={b.id}>{b.name}</s-option>)}
            </s-select>
            <s-button type="submit">Update</s-button>
          </s-stack>
        </Form>
        <s-paragraph>
          Based on L-Beauty order date. Gross is after discounts. Cancelled orders are excluded; customer refunds made
          on L-Beauty are deducted before commission. Test orders are never included.
        </s-paragraph>
      </s-section>

      <s-section heading={`Payouts ${fromStr} to ${toStr}`}>
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" onClick={() => download(false)} disabled={busy}>Export payouts CSV</s-button>
          <s-button onClick={() => download(true)} disabled={busy}>Export order detail CSV</s-button>
        </s-stack>
        <s-table>
          <s-table-header-row>
            <s-table-header>Brand</s-table-header>
            <s-table-header>Orders</s-table-header>
            <s-table-header>Cancelled</s-table-header>
            <s-table-header>Gross sales</s-table-header>
            <s-table-header>Refunds</s-table-header>
            <s-table-header>Commission</s-table-header>
            <s-table-header>Amount due</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((r) => (
              <s-table-row key={r.brandId}>
                <s-table-cell>{r.brandName}</s-table-cell>
                <s-table-cell>{r.orders}</s-table-cell>
                <s-table-cell>{r.cancelledOrders}</s-table-cell>
                <s-table-cell>{m(r.grossMinor)}</s-table-cell>
                <s-table-cell>{m(r.refundsMinor)}</s-table-cell>
                <s-table-cell>{m(r.commissionMinor)} ({r.commissionBps / 100}%)</s-table-cell>
                <s-table-cell>{m(r.dueMinor)}</s-table-cell>
              </s-table-row>
            ))}
            <s-table-row>
              <s-table-cell><s-text type="strong">Total</s-text></s-table-cell>
              <s-table-cell />
              <s-table-cell />
              <s-table-cell><s-text type="strong">{m(totals.gross)}</s-text></s-table-cell>
              <s-table-cell><s-text type="strong">{m(totals.refunds)}</s-text></s-table-cell>
              <s-table-cell><s-text type="strong">{m(totals.commission)}</s-text></s-table-cell>
              <s-table-cell><s-text type="strong">{m(totals.due)}</s-text></s-table-cell>
            </s-table-row>
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
