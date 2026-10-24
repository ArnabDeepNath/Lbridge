// Money helpers. All arithmetic is done in integer minor units (paise/cents).

export function toMinor(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) throw new Error(`Invalid money amount: ${amount}`);
  return Math.round(n * 100);
}

export function fromMinor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Percentage given in basis points (1000 = 10%), rounded half away from zero. */
export function applyBps(minor: number, bps: number): number {
  const raw = (minor * bps) / 10000;
  return raw < 0 ? -Math.round(-raw) : Math.round(raw);
}
