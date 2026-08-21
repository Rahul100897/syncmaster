/**
 * Pre-sync conflict scanner.
 * Detects handle conflicts, duplicate SKUs, barcode mismatches, and variant
 * structure differences between two stores before any write happens.
 */
import { fetchProducts, type ProductLite } from "./graphql.server";

export interface Conflict {
  resourceType: string;
  resourceId: string;
  kind: "handle" | "sku" | "barcode" | "variant_structure";
  detail: string;
}

export interface ConflictReport {
  conflicts: Conflict[];
  warnings: string[];
  safe: boolean;
  scanned: { primary: number; secondary: number };
}

/** Map of SKU -> handles that use it, for duplicate detection within a store. */
function duplicateSkus(products: ProductLite[]): Map<string, string[]> {
  const skuToHandles = new Map<string, string[]>();
  for (const p of products) {
    for (const v of p.variants) {
      if (!v.sku) continue;
      const list = skuToHandles.get(v.sku) ?? [];
      if (!list.includes(p.handle)) list.push(p.handle);
      skuToHandles.set(v.sku, list);
    }
  }
  // Keep only SKUs used by more than one product.
  const dupes = new Map<string, string[]>();
  for (const [sku, handles] of skuToHandles) {
    if (handles.length > 1) dupes.set(sku, handles);
  }
  return dupes;
}

export async function scanConflicts(
  primaryShop: string,
  secondaryShop: string,
): Promise<ConflictReport> {
  const [primary, secondary] = await Promise.all([
    fetchProducts(primaryShop),
    fetchProducts(secondaryShop),
  ]);

  const conflicts: Conflict[] = [];
  const warnings: string[] = [];

  if (primary.truncated) {
    warnings.push(
      `Primary store has more products than the scan limit; only the first batch was checked.`,
    );
  }
  if (secondary.truncated) {
    warnings.push(
      `Secondary store has more products than the scan limit; only the first batch was checked.`,
    );
  }

  // Duplicate SKUs within each store (a data-quality problem for matching).
  for (const [store, list] of [
    ["primary", primary.products] as const,
    ["secondary", secondary.products] as const,
  ]) {
    for (const [sku, handles] of duplicateSkus(list)) {
      warnings.push(
        `Duplicate SKU "${sku}" on the ${store} store across: ${handles.join(", ")}`,
      );
    }
  }

  const secondaryByHandle = new Map(
    secondary.products.map((p) => [p.handle, p]),
  );

  // Products present in both stores (matched by handle) — check for structural
  // and identity conflicts that would make a safe update impossible.
  for (const p of primary.products) {
    const match = secondaryByHandle.get(p.handle);
    if (!match) continue; // Not a conflict — it's a "will_create" during sync.

    // Variant structure: option names or variant counts differ.
    const optsA = p.options.join("|").toLowerCase();
    const optsB = match.options.join("|").toLowerCase();
    if (optsA !== optsB || p.variants.length !== match.variants.length) {
      conflicts.push({
        resourceType: "product",
        resourceId: p.handle,
        kind: "variant_structure",
        detail: `Options/variants differ — primary [${p.options.join(", ")}] (${p.variants.length} variants) vs secondary [${match.options.join(", ")}] (${match.variants.length} variants)`,
      });
      continue; // Structure conflict supersedes finer checks.
    }

    // SKU / barcode mismatches on positionally-matched variants.
    for (let i = 0; i < p.variants.length; i++) {
      const a = p.variants[i];
      const b = match.variants[i];
      if (a.sku && b.sku && a.sku !== b.sku) {
        conflicts.push({
          resourceType: "variant",
          resourceId: `${p.handle}#${i + 1}`,
          kind: "sku",
          detail: `SKU mismatch — primary "${a.sku}" vs secondary "${b.sku}"`,
        });
      }
      if (a.barcode && b.barcode && a.barcode !== b.barcode) {
        conflicts.push({
          resourceType: "variant",
          resourceId: `${p.handle}#${i + 1}`,
          kind: "barcode",
          detail: `Barcode mismatch — primary "${a.barcode}" vs secondary "${b.barcode}"`,
        });
      }
    }
  }

  return {
    conflicts,
    warnings,
    safe: conflicts.length === 0,
    scanned: {
      primary: primary.products.length,
      secondary: secondary.products.length,
    },
  };
}
