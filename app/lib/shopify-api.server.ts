// Thin wrapper around the Admin GraphQL client used by the background worker.
// - Loads the offline session for any installed shop.
// - Turns throttling and network errors into RetryableError.
// - Turns mutation userErrors into PermanentError (data problems that need a human).

import { unauthenticated } from "../shopify.server";
import { PermanentError, RetryableError } from "./jobs.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AdminClient = Awaited<ReturnType<typeof unauthenticated.admin>>["admin"];

export async function adminFor(shop: string): Promise<AdminClient> {
  try {
    const { admin } = await unauthenticated.admin(shop);
    return admin;
  } catch (e) {
    throw new PermanentError(
      `No access to ${shop} — the app may have been uninstalled (${(e as Error).message})`,
    );
  }
}

function isThrottle(errors: any): boolean {
  const list = Array.isArray(errors) ? errors : errors?.graphQLErrors ?? [];
  return list.some(
    (e: any) => e?.extensions?.code === "THROTTLED" || /throttl/i.test(String(e?.message)),
  );
}

export async function gql<T = any>(
  admin: AdminClient,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  let json: any;
  try {
    const res = await admin.graphql(query, { variables, tries: 2 });
    json = await res.json();
  } catch (e: any) {
    const body = e?.body ?? e?.response;
    if (isThrottle(body?.errors) || e?.response?.code === 429 || /throttl/i.test(String(e?.message))) {
      throw new RetryableError("Shopify API throttled", 5_000);
    }
    if (body?.errors) {
      throw new RetryableError(`GraphQL error: ${JSON.stringify(body.errors).slice(0, 500)}`);
    }
    throw new RetryableError(`Shopify request failed: ${e?.message ?? e}`);
  }
  if (json?.errors?.length) {
    if (isThrottle(json.errors)) throw new RetryableError("Shopify API throttled", 5_000);
    throw new RetryableError(`GraphQL error: ${JSON.stringify(json.errors).slice(0, 500)}`);
  }
  return json.data as T;
}

/** Throws PermanentError if a mutation returned userErrors. */
export function assertNoUserErrors(label: string, errors: any[] | null | undefined): void {
  if (errors && errors.length) {
    const msg = errors
      .map((e) => `${(e.field ?? []).join(".") || "-"}: ${e.message}`)
      .join("; ");
    throw new PermanentError(`${label}: ${msg}`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
