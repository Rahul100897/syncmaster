import crypto from "node:crypto";
import prisma from "../db.server";
import { syncQueue } from "./queue.server";
import { isPro } from "./billing.server";

/**
 * Verify the HMAC-SHA256 signature on an incoming Shopify webhook request.
 * shopify-app-remix's authenticate.webhook already does this; kept for any
 * manual/raw webhook handling. Reads the body — pass a clone if needed again.
 */
export async function verifyWebhook(request: Request): Promise<boolean> {
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!hmacHeader || !secret) return false;

  const rawBody = Buffer.from(await request.arrayBuffer());
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface ConnectionContext {
  connectionId: string;
  primaryShop: string;
  sourceShop: string;
  targetShop: string;
}

/**
 * Resolve the connected pair a shop belongs to and the counterpart (target)
 * store that changes should flow to. Returns null if the shop isn't connected.
 */
export async function connectionForShop(
  shop: string,
): Promise<ConnectionContext | null> {
  const connection = await prisma.storeConnection.findFirst({
    where: {
      status: "connected",
      OR: [{ primaryShopId: shop }, { secondaryShopId: shop }],
    },
    orderBy: { connectedAt: "desc" },
  });
  if (!connection || !connection.secondaryShopId) return null;

  const targetShop =
    shop === connection.primaryShopId
      ? connection.secondaryShopId
      : connection.primaryShopId;

  return {
    connectionId: connection.id,
    primaryShop: connection.primaryShopId,
    sourceShop: shop,
    targetShop,
  };
}

function numericToGid(kind: string, id: number | string): string {
  const raw = String(id);
  return raw.startsWith("gid://") ? raw : `gid://shopify/${kind}/${raw}`;
}

interface InventoryLevelPayload {
  inventory_item_id?: number | string;
  available?: number;
}

/** Enqueue an inventory-level change for the counterpart store. */
export async function enqueueInventoryWebhook(
  shop: string,
  payload: InventoryLevelPayload,
): Promise<void> {
  const ctx = await connectionForShop(shop);
  if (!ctx) return;
  if (payload.inventory_item_id == null || payload.available == null) return;
  // Real-time sync is a Pro feature (Free = migration mode only).
  if (!(await isPro(ctx.primaryShop))) {
    console.log(`[webhook] real-time inventory sync skipped for ${shop} (Free plan)`);
    return;
  }

  const job = await prisma.syncJob.create({
    data: {
      connectionId: ctx.connectionId,
      type: "inventory",
      status: "pending",
      triggeredBy: "webhook",
      totalItems: 1,
      sourceShop: ctx.sourceShop,
      targetShop: ctx.targetShop,
    },
  });
  await syncQueue.add("inventory", {
    jobId: job.id,
    connectionId: ctx.connectionId,
    sourceShop: ctx.sourceShop,
    targetShop: ctx.targetShop,
    primaryShop: ctx.primaryShop,
    inventoryItemId: numericToGid("InventoryItem", payload.inventory_item_id),
    available: payload.available,
  });
}

interface ProductPayload {
  handle?: string;
  id?: number | string;
}

/** Enqueue a product create/update to upsert onto the counterpart store. */
export async function enqueueProductWebhook(
  shop: string,
  payload: ProductPayload,
): Promise<void> {
  const ctx = await connectionForShop(shop);
  if (!ctx || !payload.handle) return;
  if (!(await isPro(ctx.primaryShop))) {
    console.log(`[webhook] real-time product sync skipped for ${shop} (Free plan)`);
    return;
  }

  const job = await prisma.syncJob.create({
    data: {
      connectionId: ctx.connectionId,
      type: "product",
      status: "pending",
      triggeredBy: "webhook",
      totalItems: 1,
      sourceShop: ctx.sourceShop,
      targetShop: ctx.targetShop,
    },
  });
  await syncQueue.add("product", {
    jobId: job.id,
    connectionId: ctx.connectionId,
    sourceShop: ctx.sourceShop,
    targetShop: ctx.targetShop,
    primaryShop: ctx.primaryShop,
    handle: payload.handle,
  });
}

/**
 * A product was deleted on the source. Per CLAUDE.md we NEVER delete on the
 * destination — record the event only.
 */
export async function recordProductDeletion(
  shop: string,
  payload: ProductPayload,
): Promise<void> {
  const ctx = await connectionForShop(shop);
  if (!ctx) return;
  await prisma.activityLog.create({
    data: {
      shopId: shop,
      action: `Product ${payload.handle ?? payload.id ?? ""} deleted on source (not propagated — SyncMaster never deletes)`,
      resourceType: "product",
    },
  });
}
