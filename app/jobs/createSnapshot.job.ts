import { Worker, type Job } from "bullmq";
import { connection } from "../lib/queue.server";
import { createSnapshot } from "../lib/snapshot.server";
import { restoreSnapshot } from "../lib/snapshot.server";

interface CreateSnapshotData {
  connectionId: string;
}
interface RestoreSnapshotData {
  snapshotId: string;
}

async function process(job: Job): Promise<void> {
  switch (job.name) {
    case "create": {
      const data = job.data as CreateSnapshotData;
      await createSnapshot(data.connectionId);
      return;
    }
    case "restore": {
      const data = job.data as RestoreSnapshotData;
      await restoreSnapshot(data.snapshotId);
      return;
    }
    default:
      throw new Error(`Unknown snapshot job type: ${job.name}`);
  }
}

/** The snapshot worker. Started by app/jobs/worker.ts. */
export const snapshotWorker = new Worker("snapshot", process, {
  connection,
  concurrency: 2,
});

snapshotWorker.on("failed", (job, err) => {
  console.error(`[snapshot worker] job ${job?.id} (${job?.name}) failed:`, err.message);
});
snapshotWorker.on("completed", (job) => {
  console.log(`[snapshot worker] job ${job.id} (${job.name}) completed`);
});
