import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useLocation, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { isMarketplace } from "../lib/config.server";
import { authenticateAdminOrLocal } from "../lib/guard.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, embedded } = await authenticateAdminOrLocal(request);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    embedded,
    shop: session.shop,
    role: isMarketplace(session.shop) ? ("marketplace" as const) : ("brand" as const),
  };
};

export default function App() {
  const { apiKey, embedded, shop, role } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (embedded) return;
    const handleNavigate = (event: Event) => {
      const href = (event.target as HTMLElement)?.getAttribute("href");
      if (href) {
        navigate(href);
      }
    };
    document.addEventListener("shopify:navigate", handleNavigate);
    return () => document.removeEventListener("shopify:navigate", handleNavigate);
  }, [embedded, navigate]);

  if (embedded) {
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

  const navItems =
    role === "marketplace"
      ? [
          { href: "/app", label: "Overview", exact: true },
          { href: "/app/orders", label: "Brand orders", exact: false },
          { href: "/app/brands", label: "Brands", exact: false },
          { href: "/app/reconciliation", label: "Reconciliation", exact: false },
        ]
      : [{ href: "/app", label: "L-Beauty connection", exact: true }];

  return (
    <div style={{ minHeight: "100vh", background: "#f1f2f4", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <script src="https://cdn.shopify.com/shopifycloud/polaris.js" />
      <header
        style={{
          background: "#1a1a1a",
          color: "#ffffff",
          padding: "0 24px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #303030",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <span style={{ fontWeight: 600, fontSize: "15px", letterSpacing: "-0.01em" }}>
            L-Beauty Order Bridge
          </span>
          <nav style={{ display: "flex", gap: "4px" }}>
            {navItems.map((item) => {
              const active = item.exact
                ? location.pathname === item.href
                : location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  style={{
                    color: active ? "#ffffff" : "#b5b5b5",
                    background: active ? "#303030" : "transparent",
                    textDecoration: "none",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px", color: "#b5b5b5" }}>
          <span>Store: {shop}</span>
        </div>
      </header>
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px" }}>
        <Outlet />
      </main>
    </div>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};