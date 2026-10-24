// CSV export. `?detail=1` gives one row per brand order; otherwise one row per brand.

import type { LoaderFunctionArgs } from "react-router";
import { requireMarketplace } from "../lib/guard.server";
import { parseRange, summarize } from "../lib/reconciliation.server";
import { toCsv } from "../lib/core/csv.ts";
import { fromMinor } from "../lib/core/money.ts";
import { CANCELLED_STATUSES } from "../lib/core/reconciliation.ts";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireMarketplace(request);
  const url = new URL(request.url);
  const range = parseRange(url);
  const { rows, currency, orders } = await summarize(range);

  let csv: string;
  if (url.searchParams.get("detail") === "1") {
    csv = toCsv([
      ["Brand", "L-Beauty order", "Brand order", "Order date", "Status", "Currency", "Gross", "Refunded by L-Beauty", "Commission %", "Commission", "Amount due"],
      ...orders.map((o) => {
        const cancelled = CANCELLED_STATUSES.has(o.status);
        const gross = cancelled ? 0 : o.subtotalMinor;
        const refunds = cancelled
          ? 0
          : Math.min(gross, o.refunds.filter((r) => r.source === "LBEAUTY").reduce((s, r) => s + r.amountMinor, 0));
        const commission = Math.round(((gross - refunds) * o.brand.commissionBps) / 10000);
        return [
          o.brand.name, o.lbOrderName, o.brandOrderName ?? "", o.createdAt.toISOString().slice(0, 10), o.status,
          o.currency, fromMinor(gross), fromMinor(refunds), o.brand.commissionBps / 100,
          fromMinor(commission), fromMinor(gross - refunds - commission),
        ];
      }),
    ]);
  } else {
    csv = toCsv([
      ["Period from", "Period to", "Brand", "Orders", "Cancelled orders", "Currency", "Gross sales", "Refunds", "Net sales", "Commission %", "Commission", "Amount due"],
      ...rows.map((r) => [
        range.fromStr, range.toStr, r.brandName, r.orders, r.cancelledOrders, currency,
        fromMinor(r.grossMinor), fromMinor(r.refundsMinor), fromMinor(r.netMinor),
        r.commissionBps / 100, fromMinor(r.commissionMinor), fromMinor(r.dueMinor),
      ]),
    ]);
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="l-beauty-${range.fromStr}-to-${range.toStr}.csv"`,
      "Cache-Control": "no-store",
    },
  });
};
