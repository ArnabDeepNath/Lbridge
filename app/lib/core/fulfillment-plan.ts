// Turns a brand fulfillment into the `lineItemsByFulfillmentOrder` input for
// a fulfillment on the L-Beauty order.

export interface LbFulfillmentOrder {
  id: string;
  status: string;
  lineItems: { id: string; lineItemId: string; remainingQuantity: number }[];
}

export interface FulfillmentPlan {
  lineItemsByFulfillmentOrder: {
    fulfillmentOrderId: string;
    fulfillmentOrderLineItems: { id: string; quantity: number }[];
  }[];
  /** lbLineItemId -> quantity that could not be placed on an open FO */
  shortfall: Map<string, number>;
  /** lbLineItemId -> quantity planned */
  planned: Map<string, number>;
}

const FULFILLABLE = new Set(["OPEN", "IN_PROGRESS"]);

/**
 * @param wanted lbLineItemId (numeric legacy id) -> quantity shipped by brand
 * @param fulfillmentOrders the L-Beauty order's fulfillment orders; each FO
 *   line's `lineItemId` must be the numeric legacy id of the order line item
 */
export function planFulfillment(
  wanted: Map<string, number>,
  fulfillmentOrders: LbFulfillmentOrder[],
): FulfillmentPlan {
  const remaining = new Map(wanted);
  const planned = new Map<string, number>();
  const byFo = new Map<string, { id: string; quantity: number }[]>();

  for (const fo of fulfillmentOrders) {
    if (!FULFILLABLE.has(fo.status)) continue;
    for (const li of fo.lineItems) {
      const need = remaining.get(li.lineItemId) ?? 0;
      if (need <= 0 || li.remainingQuantity <= 0) continue;
      const qty = Math.min(need, li.remainingQuantity);
      remaining.set(li.lineItemId, need - qty);
      planned.set(li.lineItemId, (planned.get(li.lineItemId) ?? 0) + qty);
      const list = byFo.get(fo.id) ?? [];
      list.push({ id: li.id, quantity: qty });
      byFo.set(fo.id, list);
    }
  }

  const shortfall = new Map<string, number>();
  for (const [k, v] of remaining) if (v > 0) shortfall.set(k, v);

  return {
    lineItemsByFulfillmentOrder: [...byFo].map(([fulfillmentOrderId, items]) => ({
      fulfillmentOrderId,
      fulfillmentOrderLineItems: items,
    })),
    shortfall,
    planned,
  };
}
