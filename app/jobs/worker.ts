/**
 * Background worker entry point. Run with: npm run worker
 * Requires the same env as the web app (SHOPIFY_API_KEY/SECRET/APP_URL,
 * DATABASE_URL, REDIS_URL) so it can make authenticated cross-store calls.
 */
import { syncWorker } from "./syncInventory.job";
import { snapshotQueue } from "../lib/queue.server";

console.log("[worker] SyncMaster worker started — listening on 'sync' queue");

// Keep a reference so the snapshot queue connection is initialised too
// (snapshot worker lands in Phase 3).
void snapshotQueue;

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received — closing worker`);
  await syncWorker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
