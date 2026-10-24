// Background worker: `npm run worker`. Run 1+ copies next to the web server.
// Each copy processes WORKER_CONCURRENCY jobs at a time; copies never clash.

import "../app/env.server";
import { hostname } from "node:os";
import { config } from "../app/lib/config.server";
import { housekeeping, tick } from "../app/lib/worker.server";

const workerId = `${hostname()}-${process.pid}`;
let stopping = false;

async function main() {
  console.log(`[worker] ${workerId} started (concurrency ${config.workerConcurrency})`);
  let lastHousekeeping = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastHousekeeping > 5 * 60_000) {
        await housekeeping();
        lastHousekeeping = Date.now();
      }
      const ran = await tick(workerId, config.workerConcurrency);
      if (ran === 0) await new Promise((r) => setTimeout(r, config.workerPollMs));
    } catch (e) {
      console.error("[worker] loop error", e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.log("[worker] stopped");
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[worker] ${sig} — finishing current jobs`);
    stopping = true;
  });
}

main();
