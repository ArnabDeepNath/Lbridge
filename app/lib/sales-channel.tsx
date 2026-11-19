// Required Sales Channel App Home compositions (Polaris web components).

import { Form, useNavigation } from "react-router";
import { when } from "./ui";

export interface SalesChannelView {
  connection: {
    status: "CONNECTING" | "CONNECTED" | "ERROR" | "DISCONNECTED";
    accountId: string;
    accountName: string;
    directoryUrl: string;
    lastError: string | null;
    connectedAt: string | Date | null;
  } | null;
  publishedCount: number;
  issueCount: number;
  defaultDirectoryUrl: string;
  supportEmail: string;
  supportUrl: string;
}

export function SalesChannelSections({ data, actionError }: { data: SalesChannelView; actionError?: string }) {
  return (
    <>
      {actionError && <s-banner tone="critical" heading="LBridge action failed">{actionError}</s-banner>}
      <StatusBanner connection={data.connection} />
      <AccountConnection data={data} />
      <ProductPublishingSummary data={data} />
      <s-divider />
    </>
  );
}

export function StatusBanner({ connection }: { connection: SalesChannelView["connection"] }) {
  if (connection?.status === "CONNECTED") {
    return (
      <s-banner tone="success" heading="LBridge Directory is active">
        Your store is connected to LBridge Directory and approved for publishing.
      </s-banner>
    );
  }
  if (connection?.status === "ERROR") {
    return (
      <s-banner tone="critical" heading="LBridge needs attention">
        {connection.lastError || "The connection could not be completed. Reconnect to retry."}
      </s-banner>
    );
  }
  if (connection?.status === "CONNECTING") {
    return <s-banner tone="info" heading="Connection in progress">Shopify is preparing your channel and contextual product feeds.</s-banner>;
  }
  return null;
}

/** Polaris Account connection composition: the first onboarding step. */
export function AccountConnection({ data }: { data: SalesChannelView }) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const connection = data.connection;
  const connected = connection?.status === "CONNECTED" || connection?.status === "CONNECTING";

  return (
    <s-section heading="1. Connect your LBridge Directory account">
      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
        <s-grid-item>
          <s-stack gap="small-200">
            <s-heading>LBridge Directory</s-heading>
            <s-text color="subdued">
              {connection ? `Connected as ${connection.accountName} (${connection.accountId})` : "No external directory account connected"}
            </s-text>
          </s-stack>
        </s-grid-item>
        <s-grid-item>
          {connected && (
            <Form method="post">
              <input type="hidden" name="intent" value="disconnect" />
              <s-button type="submit" variant="secondary" tone="critical" loading={busy}>Disconnect</s-button>
            </Form>
          )}
        </s-grid-item>
      </s-grid>

      {connection?.connectedAt && connected && (
        <s-text color="subdued">Connected {when(connection.connectedAt)}. Product feeds and Shopify Checkout attribution are enabled.</s-text>
      )}

      {!connected && (
        <s-box padding="base" background="subdued" borderRadius="base">
          <Form method="post">
            <input type="hidden" name="intent" value="connect" />
            <s-stack gap="base">
              <s-paragraph>
                Enter your external LBridge Directory account details. The API key is used once for verification and is never stored.
              </s-paragraph>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-text-field label="Account name" name="accountName" defaultValue={connection?.accountName ?? ""} required />
                <s-text-field label="External account ID" name="accountId" defaultValue={connection?.accountId ?? ""} required />
              </s-grid>
              <s-url-field label="Live directory URL" name="directoryUrl" defaultValue={connection?.directoryUrl || data.defaultDirectoryUrl} required />
              <s-password-field label="Directory API key" name="apiKey" required />
              <s-button-group>
                <s-button type="submit" variant="primary" loading={busy}>Connect</s-button>
              </s-button-group>
            </s-stack>
          </Form>
        </s-box>
      )}
    </s-section>
  );
}

export function ProductPublishingSummary({ data }: { data: SalesChannelView }) {
  const connected = data.connection?.status === "CONNECTED";
  return (
    <s-section heading="2. Product publishing">
      <s-box padding="base" border="base" borderRadius="base">
        <s-stack gap="base">
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text color="subdued">Products published to LBridge</s-text>
              <s-heading>{data.publishedCount.toLocaleString("en-IN")}</s-heading>
            </s-box>
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text color="subdued">Products requiring action</s-text>
              <s-heading>{data.issueCount.toLocaleString("en-IN")}</s-heading>
            </s-box>
          </s-grid>
          <s-paragraph>
            Publish products in Shopify Admin. Contextual feeds sync only the products and regional prices assigned to LBridge.
          </s-paragraph>
          <s-button-group>
            <s-button href="shopify:admin/products?selectedView=all" variant="primary">Manage product publishing</s-button>
            {connected && (
              <s-button href={data.connection!.directoryUrl} target="_blank">View on LBridge Directory</s-button>
            )}
          </s-button-group>
        </s-stack>
      </s-box>
    </s-section>
  );
}

/** Polaris Footer help composition, kept after the channel content on every state. */
export function FooterHelp({ supportEmail, supportUrl }: { supportEmail: string; supportUrl: string }) {
  return (
    <s-box padding="base" background="subdued" borderRadius="base">
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-text>Need help with LBridge?</s-text>
        <s-link href={`mailto:${supportEmail}`}>Contact {supportEmail}</s-link>
        {supportUrl && <s-link href={supportUrl} target="_blank">Read setup documentation</s-link>}
      </s-stack>
    </s-box>
  );
}
