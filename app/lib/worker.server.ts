// Shared job-processing loop. Used by the long-running worker (`npm run worker`)
// and by the cron tick endpoint for hosts that can't run a separate process.

import type { Job } from "@prisma/client";
import { claimJobs, completeJob, failJob, pruneOld, reclaimStaleJobs } from "./jobs.server";
import { handlers } from "./handlers/index.server";

async function runOne(job: Job): Promise<void> {
  const handler = handlers[job.type];
  if (!handler) {
    await failJob({ ...job, attempts: job.maxAttempts }, new Error(`Unknown job type ${job.type}`));
    return;
  }
  try {
    await handler.run(job.payload);
    await completeJob(job.id);
  } catch (err) {
    const dead = await failJob(job, err);
    try {
      await handler.onError?.(job, err, dead);
    } catch (hookErr) {
      console.error("[worker] onError hook failed", hookErr);
    }
    console.error(`[worker] ${job.type} ${job.id} attempt ${job.attempts} failed${dead ? " (DEAD)" : ""}:`, (err as Error)?.message ?? err);
  }
}

/** Claims and processes up to `limit` due jobs in parallel. Returns how many ran. */
export async function tick(workerId: string, limit: number): Promise<number> {
  const jobs = await claimJobs(workerId, limit);
  await Promise.all(jobs.map(runOne));
  return jobs.length;
}

export async function housekeeping(): Promise<void> {
  const n = await reclaimStaleJobs();
  if (n) console.warn(`[worker] re-queued ${n} stale job(s)`);
  await pruneOld();
}
