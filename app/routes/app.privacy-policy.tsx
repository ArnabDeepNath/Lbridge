import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function PrivacyPolicy() {
  return (
    <s-page heading="Privacy Policy">
      <s-section>
        <s-paragraph>
          This is a placeholder privacy policy for the L-Beauty Order Bridge app. Replace this text with your official policy
          before publishing or distributing the app.
        </s-paragraph>
        <s-paragraph>
          This policy describes how L-Beauty collects, uses, stores, and shares information when merchants use the app. It
          should also explain what data is collected from Shopify, how that data is processed, and how merchants can contact
          L-Beauty with questions.
        </s-paragraph>
        <s-paragraph>
          Key topics to include:
        </s-paragraph>
        <s-stack gap="small-200">
          <s-paragraph>• Data collected (orders, products, customer details required for fulfillment).</s-paragraph>
          <s-paragraph>• Purpose of collection (order routing, reconciliation, support).</s-paragraph>
          <s-paragraph>• Data retention period and deletion process.</s-paragraph>
          <s-paragraph>• Sharing with third parties (e.g., fulfillment partners or analytics tools).</s-paragraph>
          <s-paragraph>• Security measures and merchant responsibilities.</s-paragraph>
          <s-paragraph>• Contact information and policy updates.</s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);