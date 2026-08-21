/**
 * Pre-sync conflict scanner (implemented in Phase 2).
 * Detects handle conflicts, duplicate SKUs, barcode mismatches, and variant
 * structure differences between two stores before any write happens.
 */

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
}

export async function scanConflicts(
  _primaryShop: string,
  _secondaryShop: string,
): Promise<ConflictReport> {
  throw new Error("conflict.scanConflicts not implemented until Phase 2");
}
