/**
 * Background worker entry point. Run with: npm run worker
 * Requires the same env as the web app (SHOPIFY_API_KEY/SECRET/APP_URL,
 * DATABASE_URL, REDIS_URL, and R2_* for snapshots) so it can make
 * authenticated cross-store calls.
 */
import { syncWorker } from "./syncInventory.job";
import { snapshotWorker } from "./createSnapshot.job";

console.log("[worker] SyncMaster worker started — listening on 'sync' + 'snapshot' queues");

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received — closing workers`);
  await Promise.all([syncWorker.close(), snapshotWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
