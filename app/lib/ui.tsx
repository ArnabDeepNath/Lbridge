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
