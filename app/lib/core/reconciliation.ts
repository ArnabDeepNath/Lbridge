// Brand-level reconciliation: sales, refunds, commission and amount due.
//
// Rules
// - Gross = sum of line totals (after discounts) of brand orders in the period.
// - Cancelled brand orders (any cancel status) contribute nothing; they are
//   counted separately so finance can see them.
// - Refunds = customer refunds issued by L-Beauty on that brand's lines.
//   Refunds issued by the brand in its own store are informational only.
// - Commission = net × brand commission rate. Amount due = net − commission.
// - Test orders are excluded.

import { applyBps } from "./money.ts";

export const CANCELLED_STATUSES = new Set([
  "LB_CANCELLED",
  "BRAND_CANCELLED",
  "CANCELLED",
]);

export interface ReconOrder {
  brandId: string;
  brandName: string;
  commissionBps: number;
  status: string;
  isTest: boolean;
  subtotalMinor: number;
  refunds: { source: "LBEAUTY" | "BRAND"; amountMinor: number }[];
}

export interface ReconRow {
  brandId: string;
  brandName: string;
  commissionBps: number;
  orders: number;
  cancelledOrders: number;
  grossMinor: number;
  refundsMinor: number;
  netMinor: number;
  commissionMinor: number;
  dueMinor: number;
}

export function reconcile(orders: ReconOrder[]): ReconRow[] {
  const rows = new Map<string, ReconRow>();
  for (const o of orders) {
    if (o.isTest) continue;
    let row = rows.get(o.brandId);
    if (!row) {
      row = {
        brandId: o.brandId,
        brandName: o.brandName,
        commissionBps: o.commissionBps,
        orders: 0,
        cancelledOrders: 0,
        grossMinor: 0,
        refundsMinor: 0,
        netMinor: 0,
        commissionMinor: 0,
        dueMinor: 0,
      };
      rows.set(o.brandId, row);
    }
    if (CANCELLED_STATUSES.has(o.status)) {
      row.cancelledOrders += 1;
      continue;
    }
    row.orders += 1;
    row.grossMinor += o.subtotalMinor;
    const refunded = o.refunds
      .filter((r) => r.source === "LBEAUTY")
      .reduce((s, r) => s + r.amountMinor, 0);
    // A refund can never exceed what the order was worth.
    row.refundsMinor += Math.min(refunded, o.subtotalMinor);
  }
  for (const row of rows.values()) {
    row.netMinor = row.grossMinor - row.refundsMinor;
    row.commissionMinor = applyBps(row.netMinor, row.commissionBps);
    row.dueMinor = row.netMinor - row.commissionMinor;
  }
  return [...rows.values()].sort((a, b) => a.brandName.localeCompare(b.brandName));
}

/** Refund value of `qty` units of a line, pro-rata to its discounted total. */
export function refundValue(
  lineTotalMinor: number,
  lineQty: number,
  qty: number,
): number {
  if (lineQty <= 0) return 0;
  return Math.round((lineTotalMinor * Math.min(qty, lineQty)) / lineQty);
}
