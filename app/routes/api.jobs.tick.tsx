// Optional: process jobs from a cron (for hosts that can't run `npm run worker`).
// POST /api/jobs/tick with header `Authorization: Bearer <CRON_SECRET>`.

import type { ActionFunctionArgs } from "react-router";
import { timingSafeEqual } from "node:crypto";
import { config } from "../lib/config.server";
import { housekeeping, tick } from "../lib/worker.server";

function authorized(request: Request): boolean {
  if (!config.cronSecret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${config.cronSecret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function runTick(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  await housekeeping();
  const deadline = Date.now() + 20_000;
  let total = 0;
  while (Date.now() < deadline) {
    const ran = await tick(`cron-${process.pid}`, config.workerConcurrency);
    total += ran;
    if (ran === 0) break;
  }
  return Response.json({ processed: total });
}

export const action = async ({ request }: ActionFunctionArgs) => runTick(request);

export const loader = async ({ request }: ActionFunctionArgs) => runTick(request);
