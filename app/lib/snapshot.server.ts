import type { Snapshot } from "@prisma/client";

/**
 * Snapshot + rollback (implemented in Phase 3).
 * Snapshots are serialized to JSON and stored in Cloudflare R2; a Snapshot
 * row records the fileUrl, itemCount, and expiry. Restores are additive only
 * (create/update) — never delete.
 */
export async function createSnapshot(
  _connectionId: string,
): Promise<Snapshot> {
  throw new Error("snapshot.createSnapshot not implemented until Phase 3");
}

export async function restoreSnapshot(
  _snapshotId: string,
): Promise<void> {
  throw new Error("snapshot.restoreSnapshot not implemented until Phase 3");
}
