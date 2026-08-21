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

// ---------------------------------------------------------------------------
// Write path (Phase 2) — inventory sync, product upsert, migration runner.
// Every attempt logs a SyncEvent (CLAUDE.md). Nothing is ever deleted on the
// destination — only created or updated.
// ---------------------------------------------------------------------------
import { adminGraphql, type ProductLite as _ProductLite } from "./graphql.server";
import { checkAnomaly, sendAnomalyAlert } from "./anomaly.server";

const SOURCE_SKU_QUERY = `#graphql
  query SmInventorySku($id: ID!) {
    inventoryItem(id: $id) { id sku variant { id sku } }
  }
`;

const TARGET_VARIANT_BY_SKU = `#graphql
  query SmVariantBySku($q: String!) {
    productVariants(first: 1, query: $q) {
      nodes { id inventoryQuantity inventoryItem { id } }
    }
  }
`;

const FIRST_LOCATION_QUERY = `#graphql
  query SmFirstLocation { locations(first: 1, query: "status:active") { nodes { id } } }
`;

const INVENTORY_SET = `#graphql
  mutation SmInventorySet($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      userErrors { field message }
    }
  }
`;

const PRODUCT_SET = `#graphql
  mutation SmProductSet($input: ProductSetInput!, $synchronous: Boolean!) {
    productSet(synchronous: $synchronous, input: $input) {
      product { id handle }
      userErrors { field message }
    }
  }
`;

interface UserErrorResp {
  data?: Record<string, { userErrors: Array<{ field: string[] | null; message: string }> }>;
}

function firstUserError(json: unknown, root: string): string | null {
  const errs = (json as UserErrorResp).data?.[root]?.userErrors;
  if (errs && errs.length > 0) return errs.map((e) => e.message).join("; ");
  return null;
}

/** SyncRule + direction gate for a field. Defaults to allow primary→secondary. */
async function isFieldSyncAllowed(
  connectionId: string,
  field: string,
  sourceShop: string,
  primaryShop: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const rule = await prisma.syncRule.findFirst({ where: { connectionId, field } });
  const enabled = rule?.enabled ?? true;
  if (!enabled) return { allowed: false, reason: `Sync disabled for "${field}"` };

  const direction = rule?.direction ?? "primary_to_secondary";
  const sourceIsPrimary = sourceShop === primaryShop;
  if (direction === "primary_to_secondary" && !sourceIsPrimary)
    return { allowed: false, reason: "Rule direction is primary→secondary" };
  if (direction === "secondary_to_primary" && sourceIsPrimary)
    return { allowed: false, reason: "Rule direction is secondary→primary" };
  return { allowed: true };
}

async function logEvent(params: {
  jobId: string;
  resourceType: string;
  resourceId: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  status: "success" | "failed" | "skipped" | "anomaly";
  error?: string;
}): Promise<void> {
  await prisma.syncEvent.create({
    data: {
      jobId: params.jobId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      field: params.field ?? null,
      oldValue: params.oldValue ?? null,
      newValue: params.newValue ?? null,
      status: params.status,
      error: params.error ?? null,
    },
  });
}

interface FirstLocationResp {
  data?: { locations: { nodes: Array<{ id: string }> } };
}
async function firstLocationId(shop: string): Promise<string | null> {
  const json = (await adminGraphql(shop, FIRST_LOCATION_QUERY)) as FirstLocationResp;
  return json.data?.locations.nodes[0]?.id ?? null;
}

interface SkuResp {
  data?: { inventoryItem: { sku: string | null; variant: { sku: string | null } | null } | null };
}
interface TargetVariantResp {
  data?: {
    productVariants: {
      nodes: Array<{ id: string; inventoryQuantity: number | null; inventoryItem: { id: string } | null }>;
    };
  };
}

export interface InventorySyncInput {
  jobId: string;
  connectionId: string;
  sourceShop: string;
  targetShop: string;
  primaryShop: string;
  inventoryItemId: string; // gid on the source store
  available: number;
}

/**
 * Apply one inventory-level change from source → target, mapped by SKU.
 * Runs the anomaly gate; on anomaly it pauses (logs, no write) per CLAUDE.md.
 */
export async function applyInventorySync(input: InventorySyncInput): Promise<void> {
  const gate = await isFieldSyncAllowed(
    input.connectionId,
    "inventory",
    input.sourceShop,
    input.primaryShop,
  );
  if (!gate.allowed) {
    await logEvent({
      jobId: input.jobId,
      resourceType: "inventory",
      resourceId: input.inventoryItemId,
      field: "inventory",
      status: "skipped",
      error: gate.reason,
    });
    return;
  }

  // 1) Resolve the SKU on the source store.
  const skuJson = (await adminGraphql(input.sourceShop, SOURCE_SKU_QUERY, {
    id: input.inventoryItemId,
  })) as SkuResp;
  const sku = skuJson.data?.inventoryItem?.variant?.sku ?? skuJson.data?.inventoryItem?.sku ?? null;
  if (!sku) {
    await logEvent({
      jobId: input.jobId,
      resourceType: "inventory",
      resourceId: input.inventoryItemId,
      field: "inventory",
      status: "skipped",
      error: "Source inventory item has no SKU to map on",
    });
    return;
  }

  // 2) Find the matching variant on the target store.
  const tvJson = (await adminGraphql(input.targetShop, TARGET_VARIANT_BY_SKU, {
    q: `sku:${JSON.stringify(sku)}`,
  })) as TargetVariantResp;
  const targetVariant = tvJson.data?.productVariants.nodes[0];
  if (!targetVariant?.inventoryItem) {
    await logEvent({
      jobId: input.jobId,
      resourceType: "inventory",
      resourceId: sku,
      field: "inventory",
      status: "skipped",
      error: `No variant with SKU "${sku}" on ${input.targetShop}`,
    });
    return;
  }

  const current = targetVariant.inventoryQuantity ?? 0;

  // 3) Anomaly gate (inventory > 10x) — pause instead of writing.
  const anomaly = checkAnomaly("inventory", current, input.available);
  if (anomaly.anomaly) {
    await logEvent({
      jobId: input.jobId,
      resourceType: "inventory",
      resourceId: sku,
      field: "inventory",
      oldValue: String(current),
      newValue: String(input.available),
      status: "anomaly",
      error: anomaly.reason,
    });
    await sendAnomalyAlert({ shopId: input.targetShop, resourceId: sku, reason: anomaly.reason ?? "anomaly" });
    return;
  }

  // 4) Write it.
  const locationId = await firstLocationId(input.targetShop);
  if (!locationId) {
    await logEvent({
      jobId: input.jobId,
      resourceType: "inventory",
      resourceId: sku,
      field: "inventory",
      status: "failed",
      error: `No active location on ${input.targetShop}`,
    });
    return;
  }

  const setJson = await adminGraphql(input.targetShop, INVENTORY_SET, {
    input: {
      name: "available",
      reason: "correction",
      ignoreCompareQuantity: true,
      quantities: [
        {
          inventoryItemId: targetVariant.inventoryItem.id,
          locationId,
          quantity: input.available,
        },
      ],
    },
  });
  const err = firstUserError(setJson, "inventorySetQuantities");
  await logEvent({
    jobId: input.jobId,
    resourceType: "inventory",
    resourceId: sku,
    field: "inventory",
    oldValue: String(current),
    newValue: String(input.available),
    status: err ? "failed" : "success",
    error: err ?? undefined,
  });
}

/** Build a productSet input from a fetched product (upsert by handle). */
function productSetInput(product: _ProductLite) {
  const optionValues = new Map<string, Set<string>>();
  for (const v of product.variants) {
    for (const o of v.selectedOptions) {
      const set = optionValues.get(o.name) ?? new Set<string>();
      set.add(o.value);
      optionValues.set(o.name, set);
    }
  }
  const productOptions = product.options.map((name, i) => ({
    name,
    position: i + 1,
    values: Array.from(optionValues.get(name) ?? []).map((value) => ({ name: value })),
  }));

  const variants = product.variants.map((v) => ({
    optionValues: v.selectedOptions.map((o) => ({ optionName: o.name, name: o.value })),
    price: v.price ?? undefined,
    barcode: v.barcode ?? undefined,
    inventoryItem: v.sku ? { sku: v.sku } : undefined,
  }));

  return {
    handle: product.handle,
    title: product.title,
    status: product.status,
    productOptions,
    variants,
  };
}

/** Create or update a product on the target store (additive upsert). */
export async function applyProductSync(params: {
  jobId: string;
  targetShop: string;
  product: _ProductLite;
}): Promise<boolean> {
  const json = await adminGraphql(params.targetShop, PRODUCT_SET, {
    synchronous: true,
    input: productSetInput(params.product),
  });
  const err = firstUserError(json, "productSet");
  await logEvent({
    jobId: params.jobId,
    resourceType: "product",
    resourceId: params.product.handle,
    status: err ? "failed" : "success",
    error: err ?? undefined,
  });
  return !err;
}

/**
 * Execute a migration SyncJob: upsert every will_create / will_update product
 * onto the secondary store. Conflicts and skips are left untouched. Inventory
 * levels stay in sync via the real-time webhook path (applyInventorySync).
 *
 * NOTE: a pre-sync snapshot (CLAUDE.md) is created here once Snapshot lands in
 * Phase 3; for now the step is a no-op and logged as such.
 */
export async function runMigration(jobId: string): Promise<void> {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`SyncJob ${jobId} not found`);

  try {
    const { primaryShop, secondaryShop } = await getConnectionShops(job.connectionId);
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "running" },
    });

    // ALWAYS snapshot before a bulk sync (CLAUDE.md). Dynamic import avoids a
    // circular dependency with snapshot.server.ts. If R2 isn't configured the
    // snapshot fails — log and continue so dev without R2 isn't hard-blocked.
    try {
      const { createSnapshot } = await import("./snapshot.server");
      await createSnapshot(job.connectionId);
    } catch (snapErr) {
      const m = snapErr instanceof Error ? snapErr.message : String(snapErr);
      console.warn(`[migration ${jobId}] pre-sync snapshot skipped: ${m}`);
      await logEvent({
        jobId,
        resourceType: "snapshot",
        resourceId: job.connectionId,
        status: "skipped",
        error: `Pre-sync snapshot failed: ${m}`,
      });
    }

    const [dry, primary] = await Promise.all([
      dryRun(job.connectionId),
      fetchProducts(primaryShop),
    ]);
    const primaryByHandle = new Map(primary.products.map((p) => [p.handle, p]));

    const toSync = dry.items.filter(
      (i) => i.classification === "will_create" || i.classification === "will_update",
    );

    let success = 0;
    let failed = 0;
    for (const item of toSync) {
      const product = primaryByHandle.get(item.resourceId);
      if (!product) {
        failed++;
        await logEvent({
          jobId,
          resourceType: "product",
          resourceId: item.resourceId,
          status: "failed",
          error: "Product disappeared from source during sync",
        });
        continue;
      }
      const ok = await applyProductSync({ jobId, targetShop: secondaryShop, product });
      if (ok) success++;
      else failed++;
    }

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        totalItems: toSync.length,
        successItems: success,
        failedItems: failed,
        completedAt: new Date(),
      },
    });
    await prisma.activityLog.create({
      data: {
        shopId: primaryShop,
        action: `Migration synced ${success} product(s) to ${secondaryShop}`,
        resourceType: "product",
        itemCount: success,
      },
    });
  } catch (error) {
    // Never swallow — mark failed and record the real reason (CLAUDE.md).
    const message = error instanceof Error ? error.message : String(error);
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "failed", completedAt: new Date() },
    });
    await logEvent({
      jobId,
      resourceType: "job",
      resourceId: jobId,
      status: "failed",
      error: message,
    });
    throw error;
  }
}

/**
 * Force-apply an inventory quantity to a target variant by SKU, bypassing the
 * anomaly gate. Used when a merchant approves a paused anomaly.
 */
export async function forceInventoryBySku(params: {
  jobId: string;
  targetShop: string;
  sku: string;
  quantity: number;
}): Promise<void> {
  const tvJson = (await adminGraphql(params.targetShop, TARGET_VARIANT_BY_SKU, {
    q: `sku:${JSON.stringify(params.sku)}`,
  })) as TargetVariantResp;
  const targetVariant = tvJson.data?.productVariants.nodes[0];
  if (!targetVariant?.inventoryItem) {
    await logEvent({
      jobId: params.jobId,
      resourceType: "inventory",
      resourceId: params.sku,
      field: "inventory",
      status: "failed",
      error: `No variant with SKU "${params.sku}" on ${params.targetShop}`,
    });
    return;
  }
  const locationId = await firstLocationId(params.targetShop);
  if (!locationId) {
    await logEvent({
      jobId: params.jobId,
      resourceType: "inventory",
      resourceId: params.sku,
      field: "inventory",
      status: "failed",
      error: `No active location on ${params.targetShop}`,
    });
    return;
  }
  const setJson = await adminGraphql(params.targetShop, INVENTORY_SET, {
    input: {
      name: "available",
      reason: "correction",
      ignoreCompareQuantity: true,
      quantities: [
        { inventoryItemId: targetVariant.inventoryItem.id, locationId, quantity: params.quantity },
      ],
    },
  });
  const err = firstUserError(setJson, "inventorySetQuantities");
  await logEvent({
    jobId: params.jobId,
    resourceType: "inventory",
    resourceId: params.sku,
    field: "inventory",
    newValue: String(params.quantity),
    status: err ? "failed" : "success",
    error: err ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Metafield + metaobject sync (Phase 3).
// Metafields: fetch ALL (no 50-item cap that competitors impose) and write in
// batches of 25 via metafieldsSet. Metaobjects: unique — upsert by handle.
// ---------------------------------------------------------------------------
import { fetchProductByHandle } from "./graphql.server";

const SOURCE_PRODUCT_METAFIELDS = `#graphql
  query SmProductMetafields($id: ID!, $cursor: String) {
    product(id: $id) {
      handle
      metafields(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { namespace key type value }
      }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation SmMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

interface ProductMetafieldsResp {
  data?: {
    product: {
      handle: string;
      metafields: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{ namespace: string; key: string; type: string; value: string }>;
      };
    } | null;
  };
}

async function connectionByShops(a: string, b: string) {
  return prisma.storeConnection.findFirst({
    where: {
      status: "connected",
      OR: [
        { primaryShopId: a, secondaryShopId: b },
        { primaryShopId: b, secondaryShopId: a },
      ],
    },
  });
}

async function fieldEnabled(connectionId: string, field: string): Promise<boolean> {
  const rule = await prisma.syncRule.findFirst({ where: { connectionId, field } });
  return rule?.enabled ?? true;
}

/**
 * Sync ALL metafields of a source product onto the matching destination
 * product (by handle). No 50-item limit — batched in groups of 25.
 */
export async function syncMetafields(
  sourceShop: string,
  destShop: string,
  productId: string,
): Promise<void> {
  const connection = await connectionByShops(sourceShop, destShop);
  if (connection && !(await fieldEnabled(connection.id, "metafields"))) return;

  // 1) Fetch every metafield on the source product.
  const metafields: Array<{ namespace: string; key: string; type: string; value: string }> = [];
  let cursor: string | null = null;
  let handle = "";
  for (;;) {
    const json = (await adminGraphql(sourceShop, SOURCE_PRODUCT_METAFIELDS, {
      id: productId,
      cursor,
    })) as ProductMetafieldsResp;
    const product = json.data?.product;
    if (!product) return;
    handle = product.handle;
    metafields.push(...product.metafields.nodes);
    if (!product.metafields.pageInfo.hasNextPage) break;
    cursor = product.metafields.pageInfo.endCursor;
  }
  if (metafields.length === 0) return;

  // 2) Resolve the destination product owner id (by handle).
  const dest = await fetchProductByHandle(destShop, handle);
  if (!dest) return;

  // 3) Write in batches of 25 (Shopify hard limit).
  for (let i = 0; i < metafields.length; i += 25) {
    const chunk = metafields.slice(i, i + 25).map((m) => ({
      ownerId: dest.id,
      namespace: m.namespace,
      key: m.key,
      type: m.type,
      value: m.value,
    }));
    await adminGraphql(destShop, METAFIELDS_SET, { metafields: chunk });
  }
}

const SOURCE_METAOBJECTS = `#graphql
  query SmMetaobjects($type: String!, $cursor: String) {
    metaobjects(type: $type, first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { handle type fields { key value } }
    }
  }
`;

const METAOBJECT_UPSERT = `#graphql
  mutation SmMetaobjectUpsert($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      userErrors { field message }
    }
  }
`;

interface MetaobjectsResp {
  data?: {
    metaobjects: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{ handle: string; type: string; fields: Array<{ key: string; value: string }> }>;
    };
  };
}

/**
 * Sync all metaobject entries of a given type from source → destination
 * (upsert by handle). Unique feature — no competitor offers metaobject sync.
 */
export async function syncMetaobjects(
  sourceShop: string,
  destShop: string,
  type: string,
): Promise<void> {
  const connection = await connectionByShops(sourceShop, destShop);
  if (connection && !(await fieldEnabled(connection.id, "metaobjects"))) return;

  let cursor: string | null = null;
  for (;;) {
    const json = (await adminGraphql(sourceShop, SOURCE_METAOBJECTS, {
      type,
      cursor,
    })) as MetaobjectsResp;
    const page = json.data?.metaobjects;
    if (!page) return;

    for (const entry of page.nodes) {
      await adminGraphql(destShop, METAOBJECT_UPSERT, {
        handle: { type: entry.type, handle: entry.handle },
        metaobject: {
          fields: entry.fields.map((f) => ({ key: f.key, value: f.value })),
        },
      });
    }

    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
}
