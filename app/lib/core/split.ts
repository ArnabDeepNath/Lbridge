// Splits a paid L-Beauty order into one brand order per connected brand.
// Lines whose variant is not mapped to an ACTIVE Shopify brand are left
// "unrouted" — they keep going through the existing L-Beauty portal.

import { toMinor } from "./money.ts";

export interface LbOrderInput {
  lbOrderId: string;
  name: string;
  currency: string;
  email: string | null;
  phone: string | null;
  taxesIncluded: boolean;
  shippingAddress: ShippingAddress | null;
  lines: LbLine[];
}

export interface ShippingAddress {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  provinceCode: string | null;
  countryCode: string | null;
  zip: string | null;
  phone: string | null;
}

export interface LbLine {
  lbLineItemId: string;
  lbVariantId: string | null;
  sku: string;
  title: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number; // total discount allocated to the whole line
}

export interface MappingRef {
  brandId: string;
  brandVariantId: string;
}

export interface BrandLine {
  lbLineItemId: string;
  lbVariantId: string;
  brandVariantId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface SplitResult {
  byBrand: Map<string, BrandLine[]>;
  unrouted: LbLine[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Converts an `orders/paid` webhook payload into the fields routing needs. */
export function parseOrderWebhook(p: any): LbOrderInput {
  const a = p.shipping_address;
  return {
    lbOrderId: String(p.id),
    name: String(p.name ?? `#${p.order_number ?? p.id}`),
    currency: String(p.currency ?? p.presentment_currency ?? "INR"),
    email: p.email || p.contact_email || null,
    phone: p.phone || a?.phone || null,
    taxesIncluded: Boolean(p.taxes_included),
    shippingAddress: a
      ? {
          firstName: a.first_name ?? null,
          lastName: a.last_name ?? null,
          company: a.company ?? null,
          address1: a.address1 ?? null,
          address2: a.address2 ?? null,
          city: a.city ?? null,
          provinceCode: a.province_code ?? null,
          countryCode: a.country_code ?? null,
          zip: a.zip ?? null,
          phone: a.phone ?? null,
        }
      : null,
    lines: (p.line_items ?? []).map((li: any): LbLine => {
      // current_quantity reflects order edits / removed items when present.
      const qty = Number(li.current_quantity ?? li.quantity ?? 0);
      const allocations: any[] = li.discount_allocations ?? [];
      const discountMinor = allocations.length
        ? allocations.reduce((s, d) => s + toMinor(d.amount), 0)
        : toMinor(li.total_discount);
      return {
        lbLineItemId: String(li.id),
        lbVariantId: li.variant_id ? String(li.variant_id) : null,
        sku: String(li.sku ?? ""),
        title: String(li.name ?? li.title ?? ""),
        quantity: qty,
        unitPriceMinor: toMinor(li.price),
        discountMinor,
      };
    }),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function splitByBrand(
  lines: LbLine[],
  mappings: Map<string, MappingRef>,
): SplitResult {
  const byBrand = new Map<string, BrandLine[]>();
  const unrouted: LbLine[] = [];

  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const m = line.lbVariantId ? mappings.get(line.lbVariantId) : undefined;
    if (!m || !line.lbVariantId) {
      unrouted.push(line);
      continue;
    }
    const lineTotalMinor = Math.max(
      0,
      line.unitPriceMinor * line.quantity - line.discountMinor,
    );
    const brandLine: BrandLine = {
      lbLineItemId: line.lbLineItemId,
      lbVariantId: line.lbVariantId,
      brandVariantId: m.brandVariantId,
      sku: line.sku,
      title: line.title,
      quantity: line.quantity,
      // Brand sees the discounted unit price; lineTotal stays exact for payouts.
      unitPriceMinor: Math.round(lineTotalMinor / line.quantity),
      lineTotalMinor,
    };
    const list = byBrand.get(m.brandId) ?? [];
    list.push(brandLine);
    byBrand.set(m.brandId, list);
  }
  return { byBrand, unrouted };
}

/** Pairs created brand line items back to our lines, in order, by variant. */
export function pairCreatedLines<T extends { brandVariantId: string }>(
  ours: T[],
  created: { id: string; variantId: string | null }[],
): Map<T, string> {
  const pool = new Map<string, string[]>();
  for (const c of created) {
    if (!c.variantId) continue;
    const list = pool.get(c.variantId) ?? [];
    list.push(c.id);
    pool.set(c.variantId, list);
  }
  const out = new Map<T, string>();
  for (const line of ours) {
    const id = pool.get(line.brandVariantId)?.shift();
    if (id) out.set(line, id);
  }
  return out;
}
