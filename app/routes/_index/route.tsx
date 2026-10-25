import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  if (!url.searchParams.get("login")) {
    throw redirect("/app");
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>L-Beauty Order Bridge</h1>
        <p className={styles.text}>
          Multi-brand order splitting, fulfillment sync-back, and brand reconciliation for L-Beauty.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: nh0md3-b7.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Connect store
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Order Splitting</strong>. Automatically splits paid L-Beauty orders by brand and transfers each part to the corresponding brand Shopify store.
          </li>
          <li>
            <strong>Fulfillment & Tracking Sync</strong>. Syncs shipment tracking and cancellations from brand stores back to L-Beauty.
          </li>
          <li>
            <strong>Brand Reconciliation</strong>. Tracks GMV, commission, and net payout per brand with CSV export.
          </li>
        </ul>
      </div>
    </div>
  );
}