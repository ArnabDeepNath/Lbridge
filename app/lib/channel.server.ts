// Sales Channel account linking. Shopify calls are deliberately ordered:
// channelCreate -> storefrontAccessTokenCreate -> channelFullSync.

import db from "../db.server";
import { adminFor, assertNoUserErrors, gql } from "./shopify-api.server";

export const LBRIDGE_SPECIFICATION_HANDLE = "lbridge-marketplace";
const STOREFRONT_TOKEN_TITLE = "LBridge Directory Checkout Token";

export type ChannelAdminClient = Parameters<typeof gql>[0];

export interface ConnectDirectoryInput {
  accountId: string;
  accountName: string;
  directoryUrl: string;
  apiKey: string;
}

interface VerifiedDirectoryAccount {
  accountName?: string;
  directoryUrl?: string;
}

function cleanRequired(value: string, label: string, maxLength = 255): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) throw new Error(`${label} is required (maximum ${maxLength} characters).`);
  return cleaned;
}

function cleanDirectoryUrl(value: string): string {
  const url = new URL(cleanRequired(value, "Directory URL", 2_000));
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Directory URL must use HTTPS.");
  }
  return url.toString();
}

/** Verify the merchant's external account without persisting their API key. */
async function verifyDirectoryAccount(shop: string, input: ConnectDirectoryInput): Promise<VerifiedDirectoryAccount> {
  const verifyUrl = process.env.LBRIDGE_ACCOUNT_VERIFY_URL;
  if (!verifyUrl) {
    throw new Error("LBRIDGE_ACCOUNT_VERIFY_URL is not configured. Set it to the external directory's account verification endpoint.");
  }

  const response = await fetch(verifyUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ accountId: input.accountId, shop }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`LBridge Directory rejected the account connection (${response.status}).`);
  const result = (await response.json()) as VerifiedDirectoryAccount & { valid?: boolean };
  if (result.valid !== true) throw new Error("LBridge Directory could not verify this account and API key.");
  return result;
}

const CHANNEL_CREATE = `#graphql
  mutation CreateLBridgeChannel($input: ChannelCreateInput!) {
    channelCreate(input: $input) {
      channel { id handle }
      userErrors { field message }
    }
  }
`;

const STOREFRONT_TOKEN_CREATE = `#graphql
  mutation CreateLBridgeStorefrontToken($input: StorefrontAccessTokenInput!) {
    storefrontAccessTokenCreate(input: $input) {
      storefrontAccessToken { id accessToken }
      userErrors { field message }
    }
  }
`;

const CHANNEL_FULL_SYNC = `#graphql
  mutation StartLBridgeChannelSync($channelId: ID!) {
    channelFullSync(channelId: $channelId) {
      userErrors { field message }
    }
  }
`;

const CHANNEL_DELETE = `#graphql
  mutation DeleteLBridgeChannel($id: ID!) {
    channelDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;

const STOREFRONT_TOKEN_DELETE = `#graphql
  mutation DeleteLBridgeStorefrontToken($input: StorefrontAccessTokenDeleteInput!) {
    storefrontAccessTokenDelete(input: $input) {
      deletedStorefrontAccessTokenId
      userErrors { field message }
    }
  }
`;

export async function connectDirectoryAccount(
  admin: ChannelAdminClient,
  shop: string,
  rawInput: ConnectDirectoryInput,
) {
  const input: ConnectDirectoryInput = {
    accountId: cleanRequired(rawInput.accountId, "External account ID"),
    accountName: cleanRequired(rawInput.accountName, "Account name"),
    directoryUrl: cleanDirectoryUrl(rawInput.directoryUrl),
    apiKey: cleanRequired(rawInput.apiKey, "API key", 4_000),
  };
  const verified = await verifyDirectoryAccount(shop, input);
  const accountName = verified.accountName?.trim() || input.accountName;
  const directoryUrl = cleanDirectoryUrl(verified.directoryUrl || input.directoryUrl);

  let connection = await db.channelConnection.upsert({
    where: { shopDomain: shop },
    create: { shopDomain: shop, accountId: input.accountId, accountName, directoryUrl, status: "CONNECTING" },
    update: { accountId: input.accountId, accountName, directoryUrl, status: "CONNECTING", lastError: null, disconnectedAt: null },
  });

  try {
    // 1. Channel creation must precede Storefront token creation.
    if (!connection.channelId || !connection.channelHandle) {
      const data = await gql(admin, CHANNEL_CREATE, {
        input: {
          specificationHandle: LBRIDGE_SPECIFICATION_HANDLE,
          accountId: input.accountId,
          accountName,
        },
      });
      assertNoUserErrors("Could not create LBridge channel", data?.channelCreate?.userErrors);
      const channel = data?.channelCreate?.channel;
      if (!channel?.id || !channel.handle) throw new Error("channelCreate returned no channel.");
      connection = await db.channelConnection.update({
        where: { id: connection.id },
        data: { channelId: channel.id, channelHandle: channel.handle },
      });
    }

    // 2. Reuse a saved token on retries; otherwise create it only after channelCreate.
    if (!connection.storefrontAccessToken) {
      const data = await gql(admin, STOREFRONT_TOKEN_CREATE, { input: { title: STOREFRONT_TOKEN_TITLE } });
      assertNoUserErrors("Could not create Storefront access token", data?.storefrontAccessTokenCreate?.userErrors);
      const token = data?.storefrontAccessTokenCreate?.storefrontAccessToken;
      if (!token?.id || !token.accessToken) throw new Error("storefrontAccessTokenCreate returned no token.");
      connection = await db.channelConnection.update({
        where: { id: connection.id },
        data: { storefrontTokenId: token.id, storefrontAccessToken: token.accessToken },
      });
    }

    // 3. Automatic product feeds now exist, so start the initial catalog sync.
    const sync = await gql(admin, CHANNEL_FULL_SYNC, { channelId: connection.channelId });
    assertNoUserErrors("Could not start LBridge catalog sync", sync?.channelFullSync?.userErrors);

    return await db.channelConnection.update({
      where: { id: connection.id },
      data: { status: "CONNECTED", connectedAt: new Date(), lastError: null, disconnectedAt: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.channelConnection.update({ where: { id: connection.id }, data: { status: "ERROR", lastError: message } });
    throw error;
  }
}

export async function disconnectDirectoryAccount(shop: string): Promise<void> {
  const connection = await db.channelConnection.findUnique({ where: { shopDomain: shop } });
  if (!connection) return;
  const admin = await adminFor(shop);

  if (connection.channelId) {
    const data = await gql(admin, CHANNEL_DELETE, { id: connection.channelId });
    assertNoUserErrors("Could not delete LBridge channel", data?.channelDelete?.userErrors);
  }
  if (connection.storefrontTokenId) {
    const data = await gql(admin, STOREFRONT_TOKEN_DELETE, { input: { id: connection.storefrontTokenId } });
    assertNoUserErrors("Could not delete Storefront access token", data?.storefrontAccessTokenDelete?.userErrors);
  }

  await db.$transaction(async (tx) => {
    await tx.directoryProduct.deleteMany({ where: { shopDomain: shop } });
    await tx.productFeed.deleteMany({ where: { shopDomain: shop } });
    await tx.channelConnection.update({
      where: { id: connection.id },
      data: {
        status: "DISCONNECTED",
        channelId: null,
        channelHandle: null,
        storefrontTokenId: null,
        storefrontAccessToken: null,
        disconnectedAt: new Date(),
        lastError: null,
      },
    });
  });
}
