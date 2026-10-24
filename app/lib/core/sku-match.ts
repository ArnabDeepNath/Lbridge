// SKU matching between one brand store and the L-Beauty catalogue.
// L-Beauty variants are only considered if their product vendor matches the
// brand's vendor name (when set), so equal SKUs across 200+ brands are safe.

export interface BrandVariant {
  id: string; // gid
  sku: string;
}

export interface LbVariant {
  id: string; // gid
  sku: string;
  productId: string; // gid
  vendor: string;
}

export interface MatchResult {
  matches: { lbVariantId: string; lbProductId: string; brandVariantId: string; sku: string }[];
  duplicateBrandSkus: string[]; // same SKU on several brand variants
  brandSkusMissing: number; // brand variants with no SKU
  unmatchedLbSkus: string[]; // L-Beauty variants of this vendor with no brand match
}

export const normSku = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

export function brandSkuIndex(variants: BrandVariant[]) {
  const index = new Map<string, string>();
  const dupes = new Set<string>();
  let missing = 0;
  for (const v of variants) {
    const k = normSku(v.sku);
    if (!k) {
      missing += 1;
      continue;
    }
    if (index.has(k)) dupes.add(k);
    else index.set(k, v.id);
  }
  for (const d of dupes) index.delete(d); // ambiguous — never auto-map
  return { index, dupes: [...dupes], missing };
}

const legacy = (gid: string) => gid.split("/").pop() ?? gid;

export function matchVariants(
  brandVariants: BrandVariant[],
  lbVariants: LbVariant[],
  vendorName: string | null,
): MatchResult {
  const { index, dupes, missing } = brandSkuIndex(brandVariants);
  const vendor = vendorName ? vendorName.trim().toLowerCase() : null;
  const matches: MatchResult["matches"] = [];
  const unmatched: string[] = [];

  for (const lv of lbVariants) {
    if (vendor && lv.vendor.trim().toLowerCase() !== vendor) continue;
    const k = normSku(lv.sku);
    const brandVariantId = k ? index.get(k) : undefined;
    if (brandVariantId) {
      matches.push({
        lbVariantId: legacy(lv.id),
        lbProductId: legacy(lv.productId),
        brandVariantId,
        sku: k,
      });
    } else if (k) {
      unmatched.push(k);
    }
  }
  return { matches, duplicateBrandSkus: dupes, brandSkusMissing: missing, unmatchedLbSkus: unmatched };
}

/** Builds a Shopify search query for a batch of SKUs (quoted, escaped). */
export function skuSearchQuery(skus: string[]): string {
  return skus.map((s) => `sku:"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(" OR ");
}
