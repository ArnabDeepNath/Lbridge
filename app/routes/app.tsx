import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { isMarketplace } from "../lib/config.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    // eslint-disable-next-line no-undef
    apiKey: process.env.SHOPIFY_API_KEY || "",
    role: isMarketplace(session.shop) ? ("marketplace" as const) : ("brand" as const),
  };
};

export default function App() {
  const { apiKey, role } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        {role === "marketplace" ? (
          <>
            <s-link href="/app">Overview</s-link>
            <s-link href="/app/orders">Brand orders</s-link>
            <s-link href="/app/brands">Brands</s-link>
            <s-link href="/app/reconciliation">Reconciliation</s-link>
          </>
        ) : (
          <s-link href="/app">L-Beauty connection</s-link>
        )}
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
