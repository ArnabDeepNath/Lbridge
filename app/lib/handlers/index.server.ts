// Job type -> handler registry used by the worker.

import type { Job } from "@prisma/client";
import {
  cancelAtBrand,
  onCancelError,
  onTransferError,
  routeLbOrder,
  transferBrandOrder,
} from "./orders.server";
import { brandFulfillment, onSyncError, orderCancelled, refundCreated } from "./sync-back.server";
import { matchBrandVariants } from "./brands.server";
import { alert } from "../alerts.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Handler {
  run: (payload: any) => Promise<void>;
  /** Called after every failed attempt; `dead` = no more automatic retries. */
  onError?: (job: Job, err: unknown, dead: boolean) => Promise<void>;
}

export const handlers: Record<string, Handler> = {
  route_lb_order: {
    run: routeLbOrder,
    onError: async (job, err, dead) => {
      if (dead) await alert("error", `Could not route L-Beauty order ${(job.payload as any).lbOrderId}: ${(err as Error).message}`);
    },
  },
  transfer_brand_order: {
    run: transferBrandOrder,
    onError: (job, err, dead) => onTransferError(job.payload as any, err, dead),
  },
  cancel_at_brand: {
    run: cancelAtBrand,
    onError: (job, err, dead) => onCancelError(job.payload as any, err, dead),
  },
  brand_fulfillment: {
    run: brandFulfillment,
    onError: (job, err, dead) => onSyncError(job as any, err, dead),
  },
  order_cancelled: {
    run: orderCancelled,
    onError: (job, err, dead) => onSyncError(job as any, err, dead),
  },
  refund_created: {
    run: refundCreated,
    onError: (job, err, dead) => onSyncError(job as any, err, dead),
  },
  match_variants: {
    run: matchBrandVariants,
    onError: async (job, err, dead) => {
      if (dead) await alert("error", `Product matching failed for brand ${(job.payload as any).brandId}: ${(err as Error).message}`);
    },
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */
