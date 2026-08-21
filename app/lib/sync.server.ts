/**
 * Core sync engine (implemented in Phase 2+).
 *
 * SyncMaster rules (see CLAUDE.md):
 * - Never write to a destination store without a dry-run check first.
 * - Always take a snapshot before any bulk sync operation.
 * - Respect SyncRule.direction per field.
 * - Never delete data on the destination — only create or update.
 * - Log every sync event to the SyncEvent table.
 */

export interface DryRunItem {
  resourceId: string;
  resourceType: string;
  classification: "will_create" | "will_update" | "will_skip" | "conflict";
  reason?: string;
}

export interface DryRunResult {
  willCreate: number;
  willUpdate: number;
  willSkip: number;
  conflicts: number;
  items: DryRunItem[];
}

export async function dryRun(
  _connectionId: string,
): Promise<DryRunResult> {
  throw new Error("sync.dryRun not implemented until Phase 2");
}
