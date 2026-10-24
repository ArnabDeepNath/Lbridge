// Durable Postgres job queue.
//
// - Webhooks call `enqueue` and return 200 immediately (Shopify needs < 5s).
// - Workers call `claimJobs`, which uses FOR UPDATE SKIP LOCKED so any number
//   of worker processes can run side by side without double-processing.
// - Failures retry with exponential backoff; after maxAttempts (or a
//   PermanentError) the job goes DEAD and the handler's onDead hook raises
//   an alert and marks the order for manual recovery.

import { Prisma, type Job } from "@prisma/client";
import db from "../db.server";
import { retryDelayMs } from "./core/backoff.ts";

export class PermanentError extends Error {
  readonly permanent = true;
}

export class RetryableError extends Error {
  constructor(
    message: string,
    readonly delayMs?: number,
  ) {
    super(message);
  }
}

export interface EnqueueOptions {
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
}

export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  opts: EnqueueOptions = {},
): Promise<void> {
  try {
    await db.job.create({
      data: {
        type,
        payload: payload as Prisma.InputJsonValue,
        runAt: opts.runAt ?? new Date(),
        dedupeKey: opts.dedupeKey ?? null,
        maxAttempts: opts.maxAttempts ?? 8,
      },
    });
  } catch (e) {
    // Same work already queued — nothing to do.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
}

export async function claimJobs(workerId: string, limit: number): Promise<Job[]> {
  return db.$queryRaw<Job[]>`
    UPDATE "Job"
       SET "status" = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId},
           "attempts" = "attempts" + 1, "updatedAt" = now()
     WHERE "id" IN (
       SELECT "id" FROM "Job"
        WHERE "status" = 'QUEUED' AND "runAt" <= now()
        ORDER BY "runAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING *`;
}

export async function completeJob(id: string): Promise<void> {
  await db.job.update({
    where: { id },
    data: { status: "DONE", lockedAt: null, lockedBy: null, dedupeKey: null, lastError: null },
  });
}

/** Returns true when the job is now DEAD (no more automatic retries). */
export async function failJob(job: Job, err: unknown): Promise<boolean> {
  const message = err instanceof Error ? err.message : String(err);
  const permanent = err instanceof PermanentError;
  const dead = permanent || job.attempts >= job.maxAttempts;
  const delay =
    err instanceof RetryableError && err.delayMs ? err.delayMs : retryDelayMs(job.attempts);
  await db.job.update({
    where: { id: job.id },
    data: dead
      ? { status: "DEAD", lockedAt: null, lockedBy: null, dedupeKey: null, lastError: message }
      : {
          status: "QUEUED",
          lockedAt: null,
          lockedBy: null,
          lastError: message,
          runAt: new Date(Date.now() + delay),
        },
  });
  return dead;
}

/** Re-queues jobs whose worker crashed mid-run. */
export async function reclaimStaleJobs(olderThanMs = 10 * 60_000): Promise<number> {
  const res = await db.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - olderThanMs) } },
    data: { status: "QUEUED", lockedAt: null, lockedBy: null },
  });
  return res.count;
}

/** Housekeeping: drop finished jobs and old webhook ids. */
export async function pruneOld(days = 14): Promise<void> {
  const before = new Date(Date.now() - days * 86_400_000);
  await db.job.deleteMany({ where: { status: "DONE", updatedAt: { lt: before } } });
  await db.webhookEvent.deleteMany({ where: { receivedAt: { lt: before } } });
}

export async function queueStats() {
  const rows = await db.job.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>;
}
