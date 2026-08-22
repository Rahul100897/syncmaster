/**
 * Snapshot + rollback (Phase 3).
 * Snapshots serialize both stores' products + inventory to JSON, upload to
 * Cloudflare R2, and record a Snapshot row (fileUrl, itemCount, size, expiry).
 * Restores are additive only (create/update) — never delete (CLAUDE.md).
 */
import type { Snapshot } from "@prisma/client";
import prisma from "../db.server";
import { getConnectionShops, applyProductSync } from "./sync.server";
import { fetchProducts, type ProductLite } from "./graphql.server";
import { upload, download, getSignedUrl, isR2Configured } from "./r2.server";

const SNAPSHOT_TTL_DAYS = 30;

export interface SnapshotData {
  version: 1;
  connectionId: string;
  primaryShop: string;
  secondaryShop: string;
  createdAt: string;
  products: { primary: ProductLite[]; secondary: ProductLite[] };
}

function snapshotKey(connectionId: string, id: string): string {
  return `snapshots/${connectionId}/${id}.json`;
}

/**
 * Create a snapshot of both stores for a connection. Uploads JSON to R2 and
 * records a Snapshot row. Throws (marking the row failed) if R2 isn't set up.
 */
export async function createSnapshot(connectionId: string): Promise<Snapshot> {
  const { primaryShop, secondaryShop } = await getConnectionShops(connectionId);
  const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_DAYS * 24 * 60 * 60 * 1000);

  const snapshot = await prisma.snapshot.create({
    data: { connectionId, itemCount: 0, status: "pending", expiresAt },
  });

  try {
    if (!isR2Configured()) {
      throw new Error(
        "Cloudflare R2 is not configured (set R2_* env vars) — cannot store snapshot.",
      );
    }
    const [primary, secondary] = await Promise.all([
      fetchProducts(primaryShop),
      fetchProducts(secondaryShop),
    ]);
    const data: SnapshotData = {
      version: 1,
      connectionId,
      primaryShop,
      secondaryShop,
      createdAt: snapshot.createdAt.toISOString(),
      products: { primary: primary.products, secondary: secondary.products },
    };
    const json = JSON.stringify(data);
    const key = snapshotKey(connectionId, snapshot.id);
    await upload(key, json, "application/json");

    const updated = await prisma.snapshot.update({
      where: { id: snapshot.id },
      data: {
        fileUrl: key,
        itemCount: primary.products.length + secondary.products.length,
        sizeBytes: Buffer.byteLength(json),
        status: "ready",
      },
    });
    await prisma.activityLog.create({
      data: {
        shopId: primaryShop,
        action: `Snapshot created (${updated.itemCount} items)`,
        resourceType: "snapshot",
        itemCount: updated.itemCount,
      },
    });
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.snapshot.update({
      where: { id: snapshot.id },
      data: { status: "failed" },
    });
    console.error(`[snapshot] failed for connection ${connectionId}:`, message);
    throw error;
  }
}

/** A time-limited signed download URL for a ready snapshot. */
export async function snapshotDownloadUrl(snapshotId: string): Promise<string> {
  const snapshot = await prisma.snapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot?.fileUrl) throw new Error("Snapshot has no stored file.");
  return getSignedUrl(snapshot.fileUrl, 300);
}

async function loadSnapshotData(snapshotId: string): Promise<SnapshotData> {
  const snapshot = await prisma.snapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot?.fileUrl) throw new Error("Snapshot is not ready or has no file.");
  const raw = await download(snapshot.fileUrl);
  return JSON.parse(raw) as SnapshotData;
}

export interface RestoreDiff {
  snapshotId: string;
  toRestore: number; // products present in snapshot that will be written back
  changedSince: number; // products that differ from the snapshot (will be reverted)
  unchanged: number; // identical (will be skipped)
  inventoryLevels: number;
}

/** Compute what a restore would do, without writing anything. */
export async function restorePreview(snapshotId: string): Promise<RestoreDiff> {
  const data = await loadSnapshotData(snapshotId);
  // Restore targets the secondary store (the sync destination).
  const current = await fetchProducts(data.secondaryShop);
  const currentByHandle = new Map(current.products.map((p) => [p.handle, p]));

  let changedSince = 0;
  let unchanged = 0;
  let inventoryLevels = 0;
  for (const snap of data.products.secondary) {
    inventoryLevels += snap.variants.length;
    const now = currentByHandle.get(snap.handle);
    if (!now) {
      changedSince++;
      continue;
    }
    if (JSON.stringify(now) !== JSON.stringify(snap)) changedSince++;
    else unchanged++;
  }

  return {
    snapshotId,
    toRestore: data.products.secondary.length,
    changedSince,
    unchanged,
    inventoryLevels,
  };
}

/**
 * Execute a restore: write every snapshot product back onto the secondary
 * store (additive upsert). Logs a SyncJob + SyncEvents. Never deletes.
 */
export async function restoreSnapshot(snapshotId: string): Promise<string> {
  const snapshot = await prisma.snapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) throw new Error("Snapshot not found.");
  const data = await loadSnapshotData(snapshotId);

  const job = await prisma.syncJob.create({
    data: {
      connectionId: snapshot.connectionId,
      type: "restore",
      status: "running",
      triggeredBy: "manual",
      targetShop: data.secondaryShop,
      totalItems: data.products.secondary.length,
    },
  });

  let success = 0;
  let failed = 0;
  for (const product of data.products.secondary) {
    const ok = await applyProductSync({
      jobId: job.id,
      targetShop: data.secondaryShop,
      product,
    });
    if (ok) success++;
    else failed++;
  }

  await prisma.syncJob.update({
    where: { id: job.id },
    data: {
      status: "completed",
      successItems: success,
      failedItems: failed,
      completedAt: new Date(),
    },
  });
  await prisma.activityLog.create({
    data: {
      shopId: data.secondaryShop,
      action: `Restored ${success} product(s) from snapshot`,
      resourceType: "snapshot",
      itemCount: success,
    },
  });
  return job.id;
}
