// One brand order: lines, shipments, refunds, full timeline, recovery actions.

import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { requireMarketplace } from "../lib/guard.server";
import { enqueue } from "../lib/jobs.server";
import { logEvent } from "../lib/alerts.server";
import { retryBrandOrders } from "../lib/handlers/orders.server";
import { legacyId } from "../lib/core/gid.ts";
import { config } from "../lib/config.server";
import { StatusBadge, money, when } from "../lib/ui";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireMarketplace(request);
  const order = await db.brandOrder.findUnique({
    where: { id: params.id },
    include: {
      brand: { select: { id: true, name: true, shopDomain: true } },
      lines: true,
      fulfillments: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });
  if (!order) throw new Response("Not found", { status: 404 });
  return { order, marketplaceShop: config.marketplaceShop };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await requireMarketplace(request);
  const intent = (await request.formData()).get("intent");
  const id = params.id!;
  if (intent === "retry") {
    await retryBrandOrders([id]);
    return { message: "Queued for another attempt." };
  }
  if (intent === "cancel-at-brand") {
    await logEvent(id, "CANCEL_REQUESTED", "Cancellation at brand requested by L-Beauty admin");
    await enqueue("cancel_at_brand", { brandOrderId: id }, { dedupeKey: `cancel:${id}` });
    return { message: "Cancellation sent to the brand store." };
  }
  if (intent === "mark-portal") {
    await db.brandOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await logEvent(id, "MOVED_TO_PORTAL", "Marked as handled through the L-Beauty portal instead", "warning");
    return { message: "Marked as handled through the portal." };
  }
  return null;
};

export default function OrderDetail() {
  const { order, marketplaceShop } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const totalQty = order.lines.reduce((s, l) => s + l.quantity, 0);
  const refundedQty = order.lines.reduce((s, l) => s + l.refundedQty, 0);
  const hasShippedOrReturned =
    order.lines.some((l) => l.fulfilledQty > 0 || l.refundedQty > 0) || order.refunds.length > 0;
  const canRetry = order.status === "FAILED" && !order.brandOrderId;
  const canCancel =
    !!order.brandOrderId && ["TRANSFERRED", "LB_CANCELLED"].includes(order.status) && !hasShippedOrReturned;
  const lbAdmin = (path: string) => `https://${marketplaceShop}/admin/${path}`;
  const brandAdmin = (path: string) => `https://${order.brand.shopDomain}/admin/${path}`;

  return (
    <s-page heading={`${order.lbOrderName} → ${order.brand.name}`}>
      <s-link slot="breadcrumb-actions" href="/app/orders">Brand orders</s-link>
      {result?.message && <s-banner tone="success">{result.message}</s-banner>}
      {order.lastError && order.status !== "TRANSFERRED" && (
        <s-banner tone="critical" heading="Last error">{order.lastError}</s-banner>
      )}

      <s-section heading="Summary">
        <s-stack gap="small-200">
          <s-paragraph>
            Status: <StatusBadge status={order.status} />
            {refundedQty > 0 && (
              <>
                {" "}
                <s-badge tone="warning">{refundedQty >= totalQty ? "Refunded" : "Partly refunded"}</s-badge>
              </>
            )}
            {order.isTest ? " · Test order" : ""}
          </s-paragraph>
          <s-paragraph>
            L-Beauty order:{" "}
            {order.isTest ? order.lbOrderName : <s-link href={lbAdmin(`orders/${order.lbOrderId}`)} target="_blank">{order.lbOrderName}</s-link>}
          </s-paragraph>
          <s-paragraph>
            Brand order:{" "}
            {order.brandOrderId ? (
              <s-link href={brandAdmin(`orders/${legacyId(order.brandOrderId)}`)} target="_blank">{order.brandOrderName}</s-link>
            ) : "not created yet"}{" "}
            in {order.brand.shopDomain}
          </s-paragraph>
          <s-paragraph>Value to brand: {money(order.subtotalMinor, order.currency)} · Transfer attempts: {order.attempts}</s-paragraph>
        </s-stack>
        <s-stack direction="inline" gap="base">
          {canRetry && (
            <Form method="post">
              <input type="hidden" name="intent" value="retry" />
              <s-button type="submit" variant="primary" disabled={busy}>Retry transfer</s-button>
            </Form>
          )}
          {canRetry && (
            <Form method="post">
              <input type="hidden" name="intent" value="mark-portal" />
              <s-button type="submit" disabled={busy}>Handle via portal instead</s-button>
            </Form>
          )}
          {canCancel && (
            <Form method="post">
              <input type="hidden" name="intent" value="cancel-at-brand" />
              <s-button type="submit" tone="critical" disabled={busy}>Cancel in brand store</s-button>
            </Form>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Items">
        <s-table>
          <s-table-header-row>
            <s-table-header>Product</s-table-header>
            <s-table-header>SKU</s-table-header>
            <s-table-header>Qty</s-table-header>
            <s-table-header>Line total</s-table-header>
            <s-table-header>Shipped</s-table-header>
            <s-table-header>Refunded</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {order.lines.map((l) => (
              <s-table-row key={l.id}>
                <s-table-cell>{l.title}</s-table-cell>
                <s-table-cell>{l.sku}</s-table-cell>
                <s-table-cell>{l.quantity}</s-table-cell>
                <s-table-cell>{money(l.lineTotalMinor, order.currency)}</s-table-cell>
                <s-table-cell>{l.fulfilledQty}</s-table-cell>
                <s-table-cell>{l.refundedQty}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      {order.fulfillments.length > 0 && (
        <s-section heading="Shipments">
          {order.fulfillments.map((f) => (
            <s-paragraph key={f.id}>
              {f.status === "cancelled" ? "Cancelled — " : ""}
              {f.trackingCompany ?? "Carrier not given"} {f.trackingNumber ?? ""}{" "}
              {f.trackingUrl && <s-link href={f.trackingUrl} target="_blank">Track</s-link>} · {when(f.createdAt)}
              {!f.lbFulfillmentId && f.status !== "cancelled" ? " · not yet mirrored on L-Beauty" : ""}
            </s-paragraph>
          ))}
        </s-section>
      )}

      {order.refunds.length > 0 && (
        <s-section heading="Refunds and returns">
          {order.refunds.map((r) => (
            <s-paragraph key={r.id}>
              {r.source === "LBEAUTY" ? "Customer refunded by L-Beauty" : "Recorded by brand"}: {r.quantity} unit(s),{" "}
              {money(r.amountMinor, order.currency)} · {when(r.createdAt)}
            </s-paragraph>
          ))}
        </s-section>
      )}

      <s-section heading="Timeline">
        <s-table>
          <s-table-header-row>
            <s-table-header>When</s-table-header>
            <s-table-header>Event</s-table-header>
            <s-table-header>Details</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {order.events.map((e) => (
              <s-table-row key={e.id}>
                <s-table-cell>{when(e.createdAt)}</s-table-cell>
                <s-table-cell>
                  <s-badge tone={e.level === "error" ? "critical" : e.level === "warning" ? "warning" : "neutral"}>{e.kind}</s-badge>
                </s-table-cell>
                <s-table-cell>{e.message}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
