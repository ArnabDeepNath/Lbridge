// One brand: approval, settings, product matching, test order, go-live.

import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { requireMarketplace } from "../lib/guard.server";
import { enqueue } from "../lib/jobs.server";
import { alert } from "../lib/alerts.server";
import { sendTestOrder } from "../lib/handlers/brands.server";
import { StatusBadge, when } from "../lib/ui";

interface MatchReport {
  brandVariants: number;
  matched: number;
  conflicts: string[];
  duplicateBrandSkus: string[];
  brandSkusMissing: number;
  unmatchedLbSkus: string[];
  unmatchedLbSkuCount: number;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireMarketplace(request);
  const brand = await db.brand.findUnique({ where: { id: params.id } });
  if (!brand) throw new Response("Not found", { status: 404 });
  const [matching, lastTest] = await Promise.all([
    db.job.findFirst({ where: { type: "match_variants", status: { in: ["QUEUED", "RUNNING"] }, dedupeKey: `match:${brand.id}` } }),
    db.brandOrder.findFirst({ where: { brandId: brand.id, isTest: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return { brand, matching: !!matching, lastTest };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await requireMarketplace(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const id = params.id!;
  const brand = await db.brand.findUniqueOrThrow({ where: { id } });

  switch (intent) {
    case "save": {
      const pct = Number(String(form.get("commission") ?? "10").replace("%", ""));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { error: "Commission must be between 0 and 100." };
      await db.brand.update({
        where: { id },
        data: {
          name: String(form.get("name") || brand.name),
          vendorName: String(form.get("vendorName") || "").trim() || null,
          commissionBps: Math.round(pct * 100),
          notes: String(form.get("notes") || "") || null,
        },
      });
      return { message: "Saved." };
    }
    case "approve":
      await db.brand.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date() } });
      await enqueue("match_variants", { brandId: id }, { dedupeKey: `match:${id}` });
      return { message: "Approved. Matching products now." };
    case "match":
      await enqueue("match_variants", { brandId: id }, { dedupeKey: `match:${id}` });
      return { message: "Product matching started." };
    case "test-order": {
      // Ship-to: L-Beauty's own address, so nothing goes to a real customer.
      const res = await admin.graphql(`#graphql
        query LbBridgeOwnAddress { shop { name billingAddress { address1 address2 city provinceCode countryCodeV2 zip phone } } }`);
      const shop = (await res.json()).data?.shop;
      const a = shop?.billingAddress ?? {};
      try {
        await sendTestOrder(id, {
          firstName: "L-Beauty", lastName: "Test order", company: shop?.name ?? null,
          address1: a.address1 ?? null, address2: a.address2 ?? null, city: a.city ?? null,
          provinceCode: a.provinceCode ?? null, countryCode: a.countryCodeV2 ?? null, zip: a.zip ?? null, phone: a.phone ?? null,
        });
      } catch (e) {
        return { error: (e as Error).message };
      }
      return { message: "Test order queued. It will appear in the brand's Orders tagged TEST." };
    }
    case "activate":
      if (brand.mappedVariantCount === 0) return { error: "No products matched yet — run matching first." };
      await db.brand.update({ where: { id }, data: { status: "ACTIVE", activatedAt: brand.activatedAt ?? new Date() } });
      await alert("info", `${brand.name} is live.`);
      return { message: `${brand.name} is live. New paid orders will be sent to their store.` };
    case "pause":
      await db.brand.update({ where: { id }, data: { status: "PAUSED" } });
      return { message: "Paused. New orders for this brand stay in the L-Beauty portal." };
    default:
      return null;
  }
};

export default function BrandDetail() {
  const { brand, matching, lastTest } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const report = brand.matchReport as unknown as MatchReport | null;
  const live = brand.status === "ACTIVE";

  return (
    <s-page heading={brand.name}>
      <s-link slot="breadcrumb-actions" href="/app/brands">Brands</s-link>
      {result && "message" in result && result.message && <s-banner tone="success">{result.message}</s-banner>}
      {result && "error" in result && result.error && <s-banner tone="critical">{result.error}</s-banner>}

      <s-section heading="Status">
        <s-paragraph><StatusBadge status={brand.status} /> · {brand.shopDomain} · {brand.contactEmail ?? "no contact email"}</s-paragraph>
        <s-paragraph>Installed {when(brand.installedAt)}{brand.activatedAt ? ` · Live since ${when(brand.activatedAt)}` : ""}</s-paragraph>
        <s-stack direction="inline" gap="base">
          {brand.status === "PENDING_APPROVAL" && (
            <Form method="post">
              <input type="hidden" name="intent" value="approve" />
              <s-button type="submit" variant="primary" disabled={busy}>Approve brand</s-button>
            </Form>
          )}
          {(brand.status === "APPROVED" || brand.status === "PAUSED") && (
            <Form method="post">
              <input type="hidden" name="intent" value="activate" />
              <s-button type="submit" variant="primary" disabled={busy}>Go live</s-button>
            </Form>
          )}
          {live && (
            <Form method="post">
              <input type="hidden" name="intent" value="pause" />
              <s-button type="submit" disabled={busy}>Pause routing</s-button>
            </Form>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Settings">
        <Form method="post">
          <input type="hidden" name="intent" value="save" />
          <s-stack gap="base">
            <s-text-field label="Brand name" name="name" defaultValue={brand.name} />
            <s-text-field
              label="Vendor name in the L-Beauty catalogue"
              name="vendorName"
              defaultValue={brand.vendorName ?? ""}
              details="Only L-Beauty products with this vendor are matched to this brand, so identical SKUs from other brands never mix."
            />
            <s-text-field label="Commission (%)" name="commission" defaultValue={String(brand.commissionBps / 100)} />
            <s-text-area label="Internal notes" name="notes" defaultValue={brand.notes ?? ""} />
            <s-button type="submit" disabled={busy}>Save settings</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Product matching">
        <s-paragraph>
          Matched by SKU between the brand store and L-Beauty. {brand.lastMatchedAt ? `Last run ${when(brand.lastMatchedAt)}.` : "Not run yet."}
        </s-paragraph>
        {matching && <s-banner tone="info">Matching is running — refresh in a minute.</s-banner>}
        {report && (
          <s-stack gap="small-200">
            <s-paragraph>✓ {report.matched} L-Beauty variants matched (brand has {report.brandVariants} variants)</s-paragraph>
            {report.unmatchedLbSkuCount > 0 && (
              <s-paragraph>
                ⚠ {report.unmatchedLbSkuCount} L-Beauty SKU(s) for this vendor not found in the brand store: {report.unmatchedLbSkus.slice(0, 20).join(", ")}
                {report.unmatchedLbSkuCount > 20 ? "…" : ""}
              </s-paragraph>
            )}
            {report.duplicateBrandSkus.length > 0 && (
              <s-paragraph>⚠ SKUs used on more than one brand variant (skipped): {report.duplicateBrandSkus.slice(0, 20).join(", ")}</s-paragraph>
            )}
            {report.conflicts.length > 0 && (
              <s-paragraph>⚠ {report.conflicts.length} variant(s) already mapped to another brand (skipped). Set the vendor name to avoid this.</s-paragraph>
            )}
            {report.brandSkusMissing > 0 && <s-paragraph>⚠ {report.brandSkusMissing} brand variant(s) have no SKU.</s-paragraph>}
          </s-stack>
        )}
        <s-stack direction="inline" gap="base">
          <Form method="post">
            <input type="hidden" name="intent" value="match" />
            <s-button type="submit" disabled={busy || matching || brand.status === "PENDING_APPROVAL"}>
              {report ? "Re-run matching" : "Run matching"}
            </s-button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="test-order" />
            <s-button type="submit" disabled={busy || brand.mappedVariantCount === 0}>
              Send test order
            </s-button>
          </Form>
        </s-stack>
        {lastTest && (
          <s-paragraph>
            Last test order: <s-link href={`/app/orders/${lastTest.id}`}>{lastTest.brandOrderName ?? lastTest.lbOrderName}</s-link>{" "}
            <StatusBadge status={lastTest.status} />
          </s-paragraph>
        )}
      </s-section>

      <s-section slot="aside" heading="Go-live checklist">
        <s-paragraph>{brand.status !== "PENDING_APPROVAL" ? "✓" : "○"} Approve the brand</s-paragraph>
        <s-paragraph>{brand.vendorName ? "✓" : "○"} Confirm the vendor name</s-paragraph>
        <s-paragraph>{brand.mappedVariantCount > 0 ? "✓" : "○"} Review product matching</s-paragraph>
        <s-paragraph>{lastTest?.brandOrderId ? "✓" : "○"} Test order received by the brand</s-paragraph>
        <s-paragraph>{live ? "✓" : "○"} Go live</s-paragraph>
        <s-link href={`/app/orders?brand=${brand.id}`}>{"View this brand's orders"}</s-link>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
