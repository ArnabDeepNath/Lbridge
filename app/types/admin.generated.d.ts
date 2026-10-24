/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.js';

export type LbBridgeShopInfoQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type LbBridgeShopInfoQuery = { shop: Pick<AdminTypes.Shop, 'name' | 'contactEmail' | 'currencyCode'> };

export type LbBridgeBrandVariantsQueryVariables = AdminTypes.Exact<{
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type LbBridgeBrandVariantsQuery = { productVariants: { nodes: Array<Pick<AdminTypes.ProductVariant, 'id' | 'sku'>>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'endCursor'> } };

export type LbBridgeLbVariantsQueryVariables = AdminTypes.Exact<{
  q: AdminTypes.Scalars['String']['input'];
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type LbBridgeLbVariantsQuery = { productVariants: { nodes: Array<(
      Pick<AdminTypes.ProductVariant, 'id' | 'sku'>
      & { product: Pick<AdminTypes.Product, 'id' | 'vendor'> }
    )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'endCursor'> } };

export type LbBridgeVariantQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type LbBridgeVariantQuery = { productVariant?: AdminTypes.Maybe<(
    Pick<AdminTypes.ProductVariant, 'id' | 'price' | 'title'>
    & { product: Pick<AdminTypes.Product, 'title'> }
  )> };

export type LbBridgeOrderCreateMutationVariables = AdminTypes.Exact<{
  order: AdminTypes.OrderCreateOrderInput;
  options?: AdminTypes.InputMaybe<AdminTypes.OrderCreateOptionsInput>;
}>;


export type LbBridgeOrderCreateMutation = { orderCreate?: AdminTypes.Maybe<{ order?: AdminTypes.Maybe<(
      Pick<AdminTypes.Order, 'id' | 'name'>
      & { lineItems: { nodes: Array<(
          Pick<AdminTypes.LineItem, 'id'>
          & { variant?: AdminTypes.Maybe<Pick<AdminTypes.ProductVariant, 'id'>> }
        )> } }
    )>, userErrors: Array<Pick<AdminTypes.OrderCreateUserError, 'field' | 'message'>> }> };

export type LbBridgeFindOrderQueryVariables = AdminTypes.Exact<{
  q: AdminTypes.Scalars['String']['input'];
}>;


export type LbBridgeFindOrderQuery = { orders: { nodes: Array<(
      Pick<AdminTypes.Order, 'id' | 'name'>
      & { lineItems: { nodes: Array<(
          Pick<AdminTypes.LineItem, 'id'>
          & { variant?: AdminTypes.Maybe<Pick<AdminTypes.ProductVariant, 'id'>> }
        )> } }
    )> } };

export type LbBridgeOrderCancelMutationVariables = AdminTypes.Exact<{
  orderId: AdminTypes.Scalars['ID']['input'];
}>;


export type LbBridgeOrderCancelMutation = { orderCancel?: AdminTypes.Maybe<{ job?: AdminTypes.Maybe<Pick<AdminTypes.Job, 'id'>>, orderCancelUserErrors: Array<Pick<AdminTypes.OrderCancelUserError, 'field' | 'message'>> }> };

export type LbBridgeFulfillmentOrdersQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type LbBridgeFulfillmentOrdersQuery = { order?: AdminTypes.Maybe<(
    Pick<AdminTypes.Order, 'id'>
    & { fulfillmentOrders: { nodes: Array<(
        Pick<AdminTypes.FulfillmentOrder, 'id' | 'status'>
        & { lineItems: { nodes: Array<(
            Pick<AdminTypes.FulfillmentOrderLineItem, 'id' | 'remainingQuantity'>
            & { lineItem: Pick<AdminTypes.LineItem, 'id'> }
          )> } }
      )> } }
  )> };

export type LbBridgeFulfillmentCreateMutationVariables = AdminTypes.Exact<{
  fulfillment: AdminTypes.FulfillmentInput;
}>;


export type LbBridgeFulfillmentCreateMutation = { fulfillmentCreate?: AdminTypes.Maybe<{ fulfillment?: AdminTypes.Maybe<Pick<AdminTypes.Fulfillment, 'id' | 'status'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type LbBridgeTrackingUpdateMutationVariables = AdminTypes.Exact<{
  fulfillmentId: AdminTypes.Scalars['ID']['input'];
  trackingInfoInput: AdminTypes.FulfillmentTrackingInput;
}>;


export type LbBridgeTrackingUpdateMutation = { fulfillmentTrackingInfoUpdate?: AdminTypes.Maybe<{ fulfillment?: AdminTypes.Maybe<Pick<AdminTypes.Fulfillment, 'id'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type LbBridgeOwnAddressQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type LbBridgeOwnAddressQuery = { shop: (
    Pick<AdminTypes.Shop, 'name'>
    & { billingAddress: Pick<AdminTypes.ShopAddress, 'address1' | 'address2' | 'city' | 'provinceCode' | 'countryCodeV2' | 'zip' | 'phone'> }
  ) };

interface GeneratedQueryTypes {
  "#graphql\n      query LbBridgeShopInfo { shop { name contactEmail currencyCode } }": {return: LbBridgeShopInfoQuery, variables: LbBridgeShopInfoQueryVariables},
  "#graphql\n  query LbBridgeBrandVariants($after: String) {\n    productVariants(first: 250, after: $after) {\n      nodes { id sku }\n      pageInfo { hasNextPage endCursor }\n    }\n  }": {return: LbBridgeBrandVariantsQuery, variables: LbBridgeBrandVariantsQueryVariables},
  "#graphql\n  query LbBridgeLbVariants($q: String!, $after: String) {\n    productVariants(first: 250, query: $q, after: $after) {\n      nodes { id sku product { id vendor } }\n      pageInfo { hasNextPage endCursor }\n    }\n  }": {return: LbBridgeLbVariantsQuery, variables: LbBridgeLbVariantsQueryVariables},
  "#graphql\n  query LbBridgeVariant($id: ID!) { productVariant(id: $id) { id price title product { title } } }": {return: LbBridgeVariantQuery, variables: LbBridgeVariantQueryVariables},
  "#graphql\n  query LbBridgeFindOrder($q: String!) {\n    orders(first: 1, query: $q) {\n      nodes { id name lineItems(first: 250) { nodes { id variant { id } } } }\n    }\n  }": {return: LbBridgeFindOrderQuery, variables: LbBridgeFindOrderQueryVariables},
  "#graphql\n  query LbBridgeFulfillmentOrders($id: ID!) {\n    order(id: $id) {\n      id\n      fulfillmentOrders(first: 50) {\n        nodes {\n          id\n          status\n          lineItems(first: 250) { nodes { id remainingQuantity lineItem { id } } }\n        }\n      }\n    }\n  }": {return: LbBridgeFulfillmentOrdersQuery, variables: LbBridgeFulfillmentOrdersQueryVariables},
  "#graphql\n        query LbBridgeOwnAddress { shop { name billingAddress { address1 address2 city provinceCode countryCodeV2 zip phone } } }": {return: LbBridgeOwnAddressQuery, variables: LbBridgeOwnAddressQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n  mutation LbBridgeOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {\n    orderCreate(order: $order, options: $options) {\n      order {\n        id\n        name\n        lineItems(first: 250) { nodes { id variant { id } } }\n      }\n      userErrors { field message }\n    }\n  }": {return: LbBridgeOrderCreateMutation, variables: LbBridgeOrderCreateMutationVariables},
  "#graphql\n  mutation LbBridgeOrderCancel($orderId: ID!) {\n    orderCancel(orderId: $orderId, reason: CUSTOMER, restock: true, notifyCustomer: false,\n                refundMethod: { originalPaymentMethodsRefund: false },\n                staffNote: \"Cancelled by L-Beauty marketplace\") {\n      job { id }\n      orderCancelUserErrors { field message }\n    }\n  }": {return: LbBridgeOrderCancelMutation, variables: LbBridgeOrderCancelMutationVariables},
  "#graphql\n  mutation LbBridgeFulfillmentCreate($fulfillment: FulfillmentInput!) {\n    fulfillmentCreate(fulfillment: $fulfillment) {\n      fulfillment { id status }\n      userErrors { field message }\n    }\n  }": {return: LbBridgeFulfillmentCreateMutation, variables: LbBridgeFulfillmentCreateMutationVariables},
  "#graphql\n  mutation LbBridgeTrackingUpdate($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!) {\n    fulfillmentTrackingInfoUpdate(fulfillmentId: $fulfillmentId, trackingInfoInput: $trackingInfoInput, notifyCustomer: true) {\n      fulfillment { id }\n      userErrors { field message }\n    }\n  }": {return: LbBridgeTrackingUpdateMutation, variables: LbBridgeTrackingUpdateMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
