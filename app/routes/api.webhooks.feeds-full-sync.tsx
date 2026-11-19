import type { ActionFunctionArgs } from "react-router";
import { productFeedWebhookAction } from "../lib/product-feed-webhooks.server";

export const action = ({ request }: ActionFunctionArgs) =>
  productFeedWebhookAction(request, "PRODUCT_FEEDS_FULL_SYNC");
