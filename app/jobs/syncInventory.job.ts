import { Worker, type Job } from "bullmq";
import { connection } from "../lib/queue.server";
import prisma from "../db.server";
import {
  applyInventorySync,
  applyProductSync,
  runMigration,
  type InventorySyncInput,
} from "../lib/sync.server";
import { fetchProductByHandle } from "../lib/graphql.server";

interface ProductJobData {
  jobId: string;
  sourceShop: string;
  targetShop: string;
  handle: string;
}
interface MigrationJobData {
  jobId: string;
}

/** Recompute a single-item SyncJob's status + counters from its events. */
async function finalizeJob(jobId: string): Promise<void> {
  const events = await prisma.syncEvent.findMany({ where: { jobId } });
  const success = events.filter((e) => e.status === "success").length;
  const failed = events.filter((e) => e.status === "failed").length;
  const hasAnomaly = events.some((e) => e.status === "anomaly");
  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: hasAnomaly ? "anomaly" : "completed",
      totalItems: events.length,
      successItems: success,
      failedItems: failed,
      completedAt: new Date(),
    },
  });
}

async function process(job: Job): Promise<void> {
  switch (job.name) {
    case "inventory": {
      const data = job.data as InventorySyncInput;
      await prisma.syncJob.update({
        where: { id: data.jobId },
        data: { status: "running" },
      });
      await applyInventorySync(data);
      await finalizeJob(data.jobId);
      return;
    }
    case "product": {
      const data = job.data as ProductJobData;
      await prisma.syncJob.update({
        where: { id: data.jobId },
        data: { status: "running" },
      });
      const product = await fetchProductByHandle(data.sourceShop, data.handle);
      if (!product) {
        await prisma.syncEvent.create({
          data: {
            jobId: data.jobId,
            resourceType: "product",
            resourceId: data.handle,
            status: "skipped",
            error: `Product "${data.handle}" not found on ${data.sourceShop}`,
          },
        });
      } else {
        await applyProductSync({
          jobId: data.jobId,
          targetShop: data.targetShop,
          product,
        });
      }
      await finalizeJob(data.jobId);
      return;
    }
    case "migration": {
      const data = job.data as MigrationJobData;
      await runMigration(data.jobId);
      return;
    }
    default:
      throw new Error(`Unknown sync job type: ${job.name}`);
  }
}

/** The sync worker. Started by app/jobs/worker.ts. */
export const syncWorker = new Worker("sync", process, {
  connection,
  concurrency: 5,
});

syncWorker.on("failed", (job, err) => {
  console.error(`[sync worker] job ${job?.id} (${job?.name}) failed:`, err.message);
});
syncWorker.on("completed", (job) => {
  console.log(`[sync worker] job ${job.id} (${job.name}) completed`);
});
