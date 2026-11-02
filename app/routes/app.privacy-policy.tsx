import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function PrivacyPolicy() {
  return (
    <s-page heading="Privacy Policy">
      <s-section>
        <s-paragraph>
          This Privacy Policy explains how L-Beauty (“we”, “us”, or “our”) collects, uses, stores, and shares information when
          you use the L-Beauty Order Bridge app (the “App”). By installing or using the App, you agree to the terms described
          below.
        </s-paragraph>
      </s-section>

      <s-section heading="Information We Collect">
        <s-stack gap="small-200">
          <s-paragraph>• Store information, including shop domain and account details required to authenticate the App.</s-paragraph>
          <s-paragraph>• Order data, including line items, pricing, and fulfillment information needed to route orders.</s-paragraph>
          <s-paragraph>• Customer data required for fulfillment and reconciliation, such as names, shipping addresses, and contact details.</s-paragraph>
          <s-paragraph>• Product and inventory details needed for catalog matching and order splitting.</s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="How We Use Information">
        <s-stack gap="small-200">
          <s-paragraph>• Split L-Beauty orders by brand and transfer them to the correct Shopify stores.</s-paragraph>
          <s-paragraph>• Sync fulfillment status, tracking, cancellations, and refunds back to L-Beauty.</s-paragraph>
          <s-paragraph>• Calculate reconciliation metrics such as gross sales, commission, and payout amounts.</s-paragraph>
          <s-paragraph>• Provide support and troubleshoot issues with order routing or fulfillment.</s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Data Retention">
        <s-paragraph>
          We retain data only for as long as necessary to operate the App, comply with legal obligations, resolve disputes, and
          enforce our agreements. You may request deletion of your data by contacting us at the email address below.
        </s-paragraph>
      </s-section>

      <s-section heading="Sharing of Information">
        <s-paragraph>
          We share information only with service providers and partners necessary to operate the App (for example, fulfillment
          partners or analytics providers). We do not sell merchant data. Any third parties are required to safeguard your data
          and use it only for authorized purposes.
        </s-paragraph>
      </s-section>

      <s-section heading="Security">
        <s-paragraph>
          We implement reasonable administrative, technical, and physical safeguards to protect data. However, no method of
          transmission over the internet or electronic storage is completely secure, and we cannot guarantee absolute security.
        </s-paragraph>
      </s-section>

      <s-section heading="Your Responsibilities">
        <s-paragraph>
          You are responsible for keeping your Shopify credentials secure and for ensuring that your staff follows appropriate
          access controls when using the App.
        </s-paragraph>
      </s-section>

      <s-section heading="Contact Us">
        <s-paragraph>
          If you have questions about this Privacy Policy or want to request data deletion, contact L-Beauty at
          privacy@l-beauty.example.
        </s-paragraph>
      </s-section>

      <s-section heading="Updates">
        <s-paragraph>
          We may update this Privacy Policy from time to time. We will post changes here and update the effective date when
          revisions are made.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);