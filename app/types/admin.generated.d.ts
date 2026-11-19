/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.js';

export type CreateLBridgeChannelMutationVariables = AdminTypes.Exact<{
  input: AdminTypes.ChannelCreateInput;
}>;


export type CreateLBridgeChannelMutation = { channelCreate?: AdminTypes.Maybe<{ channel?: AdminTypes.Maybe<Pick<AdminTypes.Channel, 'id' | 'handle'>>, userErrors: Array<Pick<AdminTypes.ChannelCreateUserError, 'field' | 'message'>> }> };

export type CreateLBridgeStorefrontTokenMutationVariables = AdminTypes.Exact<{
  input: AdminTypes.StorefrontAccessTokenInput;
}>;


export type CreateLBridgeStorefrontTokenMutation = { storefrontAccessTokenCreate?: AdminTypes.Maybe<{ storefrontAccessToken?: AdminTypes.Maybe<Pick<AdminTypes.StorefrontAccessToken, 'id' | 'accessToken'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type StartLBridgeChannelSyncMutationVariables = AdminTypes.Exact<{
  channelId: AdminTypes.Scalars['ID']['input'];
}>;


export type StartLBridgeChannelSyncMutation = { channelFullSync?: AdminTypes.Maybe<{ userErrors: Array<Pick<AdminTypes.ChannelFullSyncUserError, 'field' | 'message'>> }> };

export type DeleteLBridgeChannelMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type DeleteLBridgeChannelMutation = { channelDelete?: AdminTypes.Maybe<(
    Pick<AdminTypes.ChannelDeletePayload, 'deletedId'>
    & { userErrors: Array<Pick<AdminTypes.ChannelDeleteUserError, 'field' | 'message'>> }
  )> };

export type DeleteLBridgeStorefrontTokenMutationVariables = AdminTypes.Exact<{
  input: AdminTypes.StorefrontAccessTokenDeleteInput;
}>;


export type DeleteLBridgeStorefrontTokenMutation = { storefrontAccessTokenDelete?: AdminTypes.Maybe<(
    Pick<AdminTypes.StorefrontAccessTokenDeletePayload, 'deletedStorefrontAccessTokenId'>
    & { userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }
  )> };

export type LbBridgeWebhookSubscribeMutationVariables = AdminTypes.Exact<{
  topic: AdminTypes.WebhookSubscriptionTopic;
  callbackUrl: AdminTypes.Scalars['String']['input'];
}>;


export type LbBridgeWebhookSubscribeMutation = { webhookSubscriptionCreate?: AdminTypes.Maybe<{ webhookSubscription?: AdminTypes.Maybe<Pick<AdminTypes.WebhookSubscription, 'id'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

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

export type LbBridgeOrderRefundableLinesQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type LbBridgeOrderRefundableLinesQuery = { order?: AdminTypes.Maybe<(
    Pick<AdminTypes.Order, 'id'>
    & { lineItems: { nodes: Array<Pick<AdminTypes.LineItem, 'id' | 'refundableQuantity'>> } }
  )> };

export type LbBridgeSuggestedRefundQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  refundLineItems: Array<AdminTypes.RefundLineItemInput> | AdminTypes.RefundLineItemInput;
}>;


export type LbBridgeSuggestedRefundQuery = { order?: AdminTypes.Maybe<(
    Pick<AdminTypes.Order, 'id'>
    & { suggestedRefund?: AdminTypes.Maybe<{ amountSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount' | 'currencyCode'>, presentmentMoney: Pick<AdminTypes.MoneyV2, 'amount' | 'currencyCode'> }, suggestedTransactions: Array<(
        Pick<AdminTypes.SuggestedOrderTransaction, 'gateway' | 'kind'>
        & { amountSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount' | 'currencyCode'>, presentmentMoney: Pick<AdminTypes.MoneyV2, 'amount' | 'currencyCode'> }, parentTransaction?: AdminTypes.Maybe<Pick<AdminTypes.OrderTransaction, 'id'>> }
      )> }> }
  )> };

export type LbBridgeRefundCreateMutationVariables = AdminTypes.Exact<{
  input: AdminTypes.RefundInput;
  idempotencyKey: AdminTypes.Scalars['String']['input'];
}>;


export type LbBridgeRefundCreateMutation = { refundCreate?: AdminTypes.Maybe<{ refund?: AdminTypes.Maybe<Pick<AdminTypes.Refund, 'id'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type ReportLBridgeProductIssuesMutationVariables = AdminTypes.Exact<{
  feedbackInput: Array<AdminTypes.ProductResourceFeedbackInput> | AdminTypes.ProductResourceFeedbackInput;
}>;


export type ReportLBridgeProductIssuesMutation = { bulkProductResourceFeedbackCreate?: AdminTypes.Maybe<{ feedback?: AdminTypes.Maybe<Array<Pick<AdminTypes.ProductResourceFeedback, 'productId' | 'state'>>>, userErrors: Array<Pick<AdminTypes.BulkProductResourceFeedbackCreateUserError, 'field' | 'message'>> }> };

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
  "#graphql\n  query LbBridgeOrderRefundableLines($id: ID!) {\n    order(id: $id) {\n      id\n      lineItems(first: 250) {\n        nodes { id refundableQuantity }\n      }\n    }\n  }": {return: LbBridgeOrderRefundableLinesQuery, variables: LbBridgeOrderRefundableLinesQueryVariables},
  "#graphql\n  query LbBridgeSuggestedRefund($id: ID!, $refundLineItems: [RefundLineItemInput!]!) {\n    order(id: $id) {\n      id\n      suggestedRefund(refundLineItems: $refundLineItems) {\n        amountSet {\n          shopMoney { amount currencyCode }\n          presentmentMoney { amount currencyCode }\n        }\n        suggestedTransactions {\n          amountSet {\n            shopMoney { amount currencyCode }\n            presentmentMoney { amount currencyCode }\n          }\n          gateway\n          kind\n          parentTransaction { id }\n        }\n      }\n    }\n  }": {return: LbBridgeSuggestedRefundQuery, variables: LbBridgeSuggestedRefundQueryVariables},
  "#graphql\n        query LbBridgeOwnAddress { shop { name billingAddress { address1 address2 city provinceCode countryCodeV2 zip phone } } }": {return: LbBridgeOwnAddressQuery, variables: LbBridgeOwnAddressQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n  mutation CreateLBridgeChannel($input: ChannelCreateInput!) {\n    channelCreate(input: $input) {\n      channel { id handle }\n      userErrors { field message }\n    }\n  }\n": {return: CreateLBridgeChannelMutation, variables: CreateLBridgeChannelMutationVariables},
  "#graphql\n  mutation CreateLBridgeStorefrontToken($input: StorefrontAccessTokenInput!) {\n    storefrontAccessTokenCreate(input: $input) {\n      storefrontAccessToken { id accessToken }\n      userErrors { field message }\n    }\n  }\n": {return: CreateLBridgeStorefrontTokenMutation, variables: CreateLBridgeStorefrontTokenMutationVariables},
  "#graphql\n  mutation StartLBridgeChannelSync($channelId: ID!) {\n    channelFullSync(channelId: $channelId) {\n      userErrors { field message }\n    }\n  }\n": {return: StartLBridgeChannelSyncMutation, variables: StartLBridgeChannelSyncMutationVariables},
  "#graphql\n  mutation DeleteLBridgeChannel($id: ID!) {\n    channelDelete(id: $id) {\n      deletedId\n      userErrors { field message }\n    }\n  }\n": {return: DeleteLBridgeChannelMutation, variables: DeleteLBridgeChannelMutationVariables},
  "#graphql\n  mutation DeleteLBridgeStorefrontToken($input: StorefrontAccessTokenDeleteInput!) {\n    storefrontAccessTokenDelete(input: $input) {\n      deletedStorefrontAccessTokenId\n      userErrors { field message }\n    }\n  }\n": {return: DeleteLBridgeStorefrontTokenMutation, variables: DeleteLBridgeStorefrontTokenMutationVariables},
  "#graphql\n  mutation LbBridgeWebhookSubscribe($topic: WebhookSubscriptionTopic!, $callbackUrl: String!) {\n    webhookSubscriptionCreate(\n      topic: $topic\n      webhookSubscription: { uri: $callbackUrl, format: JSON }\n    ) {\n      webhookSubscription { id }\n      userErrors { field message }\n    }\n  }": {return: LbBridgeWebhookSubscribeMutation, variables: LbBridgeWebhookSubscribeMutationVariables},
  "#graphql\n  mutation LbBridgeOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {\n    orderCreate(order: $order, options: $options) {\n      order {\n        id\n        name\n        lineItems(first: 250) { nodes { id variant { id } } }\n      }\n      userErrors { field message }\n    }\n  }": {return: LbBridgeOrderCreateMutation, variables: LbBridgeOrderCreateMutationVariables},
  "#graphql\n  mutation LbBridgeOrderCancel($orderId: ID!) {\n    orderCancel(orderId: $orderId, reason: CUSTOMER, restock: true, notifyCustomer: false,\n                refundMethod: { originalPaymentMethodsRefund: false },\n                staffNote: \"Cancelled by L-Beauty marketplace\") {\n      job { id }\n      orderCancelUserErrors { field message }\n    }\n  }": {return: LbBridgeOrderCancelMutation, variables: LbBridgeOrderCancelMutationVariables},
  "#graphql\n  mutation LbBridgeFulfillmentCreate($fulfillment: FulfillmentInput!) {\n    fulfillmentCreate(fulfillment: $fulfillment) {\n      fulfillment { id status }\n      userErrors { field message }\n    }\n  }": {return: LbBridgeFulfillmentCreateMutation, variables: LbBridgeFulfillmentCreateMutationVariables},
  "#graphql\n  mutation LbBridgeTrackingUpdate($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!) {\n    fulfillmentTrackingInfoUpdate(fulfillmentId: $fulfillmentId, trackingInfoInput: $trackingInfoInput, notifyCustomer: true) {\n      fulfillment { id }\n      userErrors { field message }\n    }\n  }": {return: LbBridgeTrackingUpdateMutation, variables: LbBridgeTrackingUpdateMutationVariables},
  "#graphql\n  mutation LbBridgeRefundCreate($input: RefundInput!, $idempotencyKey: String!) {\n    refundCreate(input: $input) @idempotent(key: $idempotencyKey) {\n      refund { id }\n      userErrors { field message }\n    }\n  }": {return: LbBridgeRefundCreateMutation, variables: LbBridgeRefundCreateMutationVariables},
  "#graphql\n  mutation ReportLBridgeProductIssues($feedbackInput: [ProductResourceFeedbackInput!]!) {\n    bulkProductResourceFeedbackCreate(feedbackInput: $feedbackInput) {\n      feedback { productId state }\n      userErrors { field message }\n    }\n  }\n": {return: ReportLBridgeProductIssuesMutation, variables: ReportLBridgeProductIssuesMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
