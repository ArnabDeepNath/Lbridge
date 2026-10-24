import db from "../db.server";
import { reconcile, type ReconOrder } from "./core/reconciliation.ts";

export interface ReconQuery {
  from: Date;
  to: Date; // exclusive
  brandId?: string;
}

export function parseRange(url: URL): ReconQuery & { fromStr: string; toStr: string } {
  const today = new Date();
  const firstOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const fromStr = url.searchParams.get("from") || iso(firstOfMonth);
  const toStr = url.searchParams.get("to") || iso(today);
  const from = new Date(`${fromStr}T00:00:00+05:30`);
  const to = new Date(new Date(`${toStr}T00:00:00+05:30`).getTime() + 86_400_000);
  return { from, to, fromStr, toStr, brandId: url.searchParams.get("brand") || undefined };
}

/** Orders in the period (by L-Beauty order date), with brand + refunds. */
export async function loadOrders({ from, to, brandId }: ReconQuery) {
  return db.brandOrder.findMany({
    where: { createdAt: { gte: from, lt: to }, isTest: false, ...(brandId ? { brandId } : {}) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, lbOrderName: true, brandOrderName: true, status: true, isTest: true,
      currency: true, subtotalMinor: true, createdAt: true, fulfilledAt: true,
      brand: { select: { id: true, name: true, commissionBps: true } },
      refunds: { select: { source: true, amountMinor: true } },
    },
  });
}

export async function summarize(q: ReconQuery) {
  const orders = await loadOrders(q);
  const input: ReconOrder[] = orders.map((o) => ({
    brandId: o.brand.id,
    brandName: o.brand.name,
    commissionBps: o.brand.commissionBps,
    status: o.status,
    isTest: o.isTest,
    subtotalMinor: o.subtotalMinor,
    refunds: o.refunds,
  }));
  const currency = orders[0]?.currency ?? "INR";
  return { rows: reconcile(input), currency, orders };
}
