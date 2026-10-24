// Retry schedule for jobs: 30s, 1m, 2m, 4m ... capped at 1h, with ±20% jitter.

export const BASE_DELAY_MS = 30_000;
export const MAX_DELAY_MS = 60 * 60_000;

export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const n = Math.max(1, attempt);
  const raw = Math.min(BASE_DELAY_MS * 2 ** (n - 1), MAX_DELAY_MS);
  const jitter = 1 + (random() * 0.4 - 0.2);
  return Math.round(raw * jitter);
}
