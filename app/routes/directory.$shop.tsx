// Public, unauthenticated LBridge directory. It contains no payment capture:
// every Buy Now form redirects to the merchant's attributed Shopify Checkout.

import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import db from "../db.server";
import { normalizeShopDomain } from "../lib/core/checkout.ts";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.connection.accountName} | LBridge Directory` : "LBridge Directory" },
];

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const shop = normalizeShopDomain(params.shop ?? "");
  const connection = await db.channelConnection.findUnique({ where: { shopDomain: shop } });
  if (!connection || connection.status !== "CONNECTED") throw new Response("Directory not found", { status: 404 });
  const products = await db.directoryProduct.findMany({
    where: { shopDomain: shop, isPublished: true },
    include: { variants: { orderBy: { title: "asc" } } },
    orderBy: { title: "asc" },
    take: 250,
  });
  return {
    shop,
    connection: { accountName: connection.accountName },
    products: products.filter((product) => Array.isArray(product.validationMessages) && product.validationMessages.length === 0),
  };
};

export default function Directory() {
  const { shop, connection, products } = useLoaderData<typeof loader>();
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 22px", fontFamily: "Inter, system-ui, sans-serif", color: "#17212b" }}>
      <header style={{ marginBottom: 32 }}>
        <p style={{ color: "#527064", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>LBridge Directory</p>
        <h1 style={{ fontSize: 40, margin: "8px 0" }}>{connection.accountName}</h1>
        <p style={{ color: "#5d6872" }}>Browse products published by this merchant. Checkout is securely completed on Shopify.</p>
      </header>

      {products.length === 0 ? (
        <section style={{ padding: 32, border: "1px solid #dce2e5", borderRadius: 16 }}>
          <h2>No published products yet</h2>
          <p>Products appear here after the merchant publishes them to LBridge Directory and they pass listing validation.</p>
        </section>
      ) : (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 22 }}>
          {products.map((product) => (
            <article key={product.id} style={{ border: "1px solid #dce2e5", borderRadius: 16, overflow: "hidden", background: "#fff" }}>
              {product.imageUrl && <img src={product.imageUrl} alt={product.title} style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />}
              <div style={{ padding: 18 }}>
                <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>{product.title}</h2>
                {product.description && <p style={{ color: "#5d6872", maxHeight: 72, overflow: "hidden" }}>{product.description}</p>}
                <form action="/api/checkout" method="get" style={{ display: "grid", gap: 12 }}>
                  <input type="hidden" name="shop" value={shop} />
                  <input type="hidden" name="method" value="permalink" />
                  <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 600 }}>
                    Variant
                    <select name="variantId" required style={{ padding: 10, borderRadius: 8, border: "1px solid #b8c2c8" }}>
                      {product.variants.map((variant) => (
                        <option key={variant.id} value={variant.variantId} disabled={!variant.availableForSale || variant.quantityAvailable < 1}>
                          {variant.title} — {formatMoney(variant.priceAmount, variant.priceCurrency)}
                          {!variant.availableForSale || variant.quantityAvailable < 1 ? " (Unavailable)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 600 }}>
                    Quantity
                    <input name="quantity" type="number" min="1" max="250" defaultValue="1" required style={{ padding: 10, borderRadius: 8, border: "1px solid #b8c2c8" }} />
                  </label>
                  <button type="submit" style={{ padding: "12px 16px", border: 0, borderRadius: 8, background: "#17212b", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                    Buy Now with Shopify
                  </button>
                </form>
              </div>
            </article>
          ))}
        </section>
      )}
      <footer style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid #dce2e5", color: "#5d6872", fontSize: 14 }}>
        Payments, taxes, shipping, and order confirmation are handled on Shopify by the merchant.
      </footer>
    </main>
  );
}

function formatMoney(amount: string, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}
