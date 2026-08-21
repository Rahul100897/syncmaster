/**
 * Core sync engine — dry-run classification (Phase 2).
 *
 * SyncMaster rules (see CLAUDE.md):
 * - Never write to a destination store without a dry-run check first.
 * - Always take a snapshot before any bulk sync operation.
 * - Respect SyncRule.direction per field.
 * - Never delete data on the destination — only create or update.
 * - Log every sync event to the SyncEvent table.
 */
import prisma from "../db.server";
import { fetchProducts, type ProductLite } from "./graphql.server";

export type Classification =
  | "will_create"
  | "will_update"
  | "will_skip"
  | "conflict";

export interface DryRunItem {
  resourceId: string; // product handle
  resourceType: string;
  title: string;
  classification: Classification;
  reason?: string;
}

export interface DryRunResult {
  willCreate: number;
  willUpdate: number;
  willSkip: number;
  conflicts: number;
  items: DryRunItem[];
  warnings: string[];
  primaryShop: string;
  secondaryShop: string;
}

export interface DryRunOptions {
  /** Reserved for future filters (by tag/collection/vendor). */
  limit?: number;
}

interface ConnectionShops {
  primaryShop: string;
  secondaryShop: string;
}

/** Load a connection and assert both stores are connected (CLAUDE.md rule). */
export async function getConnectionShops(
  connectionId: string,
): Promise<ConnectionShops> {
  const connection = await prisma.storeConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found.`);
  }
  if (connection.status !== "connected" || !connection.secondaryShopId) {
    throw new Error(
      `Connection ${connectionId} is not fully connected — both stores must be linked before syncing.`,
    );
  }
  return {
    primaryShop: connection.primaryShopId,
    secondaryShop: connection.secondaryShopId,
  };
}

function structureDiffers(a: ProductLite, b: ProductLite): boolean {
  return (
    a.options.join("|").toLowerCase() !== b.options.join("|").toLowerCase() ||
    a.variants.length !== b.variants.length
  );
}

/** Fields that would trigger an update if they differ (structure already equal). */
function fieldDiffs(a: ProductLite, b: ProductLite): string[] {
  const diffs: string[] = [];
  if (a.title !== b.title) diffs.push("title");
  if (a.status !== b.status) diffs.push("status");
  for (let i = 0; i < a.variants.length; i++) {
    const va = a.variants[i];
    const vb = b.variants[i];
    if (!vb) continue;
    if ((va.price ?? "") !== (vb.price ?? "")) diffs.push(`variant ${i + 1} price`);
    if ((va.sku ?? "") !== (vb.sku ?? "")) diffs.push(`variant ${i + 1} sku`);
    if ((va.barcode ?? "") !== (vb.barcode ?? ""))
      diffs.push(`variant ${i + 1} barcode`);
    if ((va.inventoryQuantity ?? null) !== (vb.inventoryQuantity ?? null))
      diffs.push(`variant ${i + 1} inventory`);
  }
  return diffs;
}

/**
 * Classify every primary product against the secondary store. Read-only.
 */
export async function dryRun(
  connectionId: string,
  _options: DryRunOptions = {},
): Promise<DryRunResult> {
  const { primaryShop, secondaryShop } = await getConnectionShops(connectionId);

  const [primary, secondary] = await Promise.all([
    fetchProducts(primaryShop),
    fetchProducts(secondaryShop),
  ]);

  const warnings: string[] = [];
  if (primary.truncated)
    warnings.push("Primary catalog exceeds the preview limit — not all products shown.");
  if (secondary.truncated)
    warnings.push("Secondary catalog exceeds the preview limit — not all products shown.");

  const secondaryByHandle = new Map(secondary.products.map((p) => [p.handle, p]));

  const items: DryRunItem[] = [];
  let willCreate = 0;
  let willUpdate = 0;
  let willSkip = 0;
  let conflicts = 0;

  for (const p of primary.products) {
    const match = secondaryByHandle.get(p.handle);
    if (!match) {
      willCreate++;
      items.push({
        resourceId: p.handle,
        resourceType: "product",
        title: p.title,
        classification: "will_create",
        reason: "Not present on the secondary store",
      });
      continue;
    }
    if (structureDiffers(p, match)) {
      conflicts++;
      items.push({
        resourceId: p.handle,
        resourceType: "product",
        title: p.title,
        classification: "conflict",
        reason: `Variant structure differs — [${p.options.join(", ")}] (${p.variants.length}) vs [${match.options.join(", ")}] (${match.variants.length})`,
      });
      continue;
    }
    const diffs = fieldDiffs(p, match);
    if (diffs.length > 0) {
      willUpdate++;
      items.push({
        resourceId: p.handle,
        resourceType: "product",
        title: p.title,
        classification: "will_update",
        reason: `Changed: ${diffs.join(", ")}`,
      });
    } else {
      willSkip++;
      items.push({
        resourceId: p.handle,
        resourceType: "product",
        title: p.title,
        classification: "will_skip",
        reason: "Identical",
      });
    }
  }

  return {
    willCreate,
    willUpdate,
    willSkip,
    conflicts,
    items,
    warnings,
    primaryShop,
    secondaryShop,
  };
}
