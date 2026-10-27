// Small shared UI helpers (Polaris web components).

const TONES: Record<string, "success" | "critical" | "warning" | "info" | "neutral"> = {
  PENDING: "info",
  TRANSFERRED: "info",
  PARTIALLY_FULFILLED: "warning",
  FULFILLED: "success",
  FAILED: "critical",
  LB_CANCELLED: "neutral",
  BRAND_CANCELLED: "critical",
  CANCELLED: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "info",
  ACTIVE: "success",
  PAUSED: "neutral",
  UNINSTALLED: "critical",
};

const LABELS: Record<string, string> = {
  PENDING: "Sending",
  TRANSFERRED: "Sent to brand",
  PARTIALLY_FULFILLED: "Partly shipped",
  FULFILLED: "Shipped",
  FAILED: "Failed",
  LB_CANCELLED: "Cancelled (L-Beauty)",
  BRAND_CANCELLED: "Cancelled by brand",
  CANCELLED: "Cancelled",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Onboarding",
  ACTIVE: "Live",
  PAUSED: "Paused",
  UNINSTALLED: "Uninstalled",
};

export function StatusBadge({ status }: { status: string }) {
  return <s-badge tone={TONES[status] ?? "neutral"}>{LABELS[status] ?? status}</s-badge>;
}

export const statusLabel = (s: string) => LABELS[s] ?? s;

export function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

export function when(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** Shows a toast inside Shopify Admin (App Bridge) or a standalone browser fallback. */
export function showToast(message: string, opts?: { isError?: boolean }) {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    shopify?: { toast?: { show?: (msg: string, o?: { isError?: boolean }) => void } };
  };
  if (w.shopify?.toast?.show) {
    w.shopify.toast.show(message, opts);
    return;
  }
  const el = document.createElement("div");
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    background: opts?.isError ? "#8e1f0b" : "#1a1a1a",
    color: "#ffffff",
    padding: "10px 18px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "500",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    zIndex: "9999",
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/** Triggers a file download for an authenticated CSV route inside the embedded admin. */
export async function downloadFile(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}