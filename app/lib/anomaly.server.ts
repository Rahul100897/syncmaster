/**
 * Anomaly detection (Phase 2).
 * Rules (see CLAUDE.md): inventory change > 10x current value → flag;
 * price change > 50% → flag. Flagged events are paused (not written) and
 * surfaced on the dashboard with Approve / Reject actions.
 */
import prisma from "../db.server";

export interface AnomalyResult {
  anomaly: boolean;
  reason?: string;
}

export function checkAnomaly(
  field: string,
  oldValue: number,
  newValue: number,
): AnomalyResult {
  if (field === "inventory" && oldValue > 0 && newValue > oldValue * 10) {
    return {
      anomaly: true,
      reason: `Inventory jump from ${oldValue} to ${newValue} (>10x)`,
    };
  }
  if (field === "price" && oldValue > 0) {
    const changeRatio = Math.abs(newValue - oldValue) / oldValue;
    if (changeRatio > 0.5) {
      return {
        anomaly: true,
        reason: `Price change of ${Math.round(changeRatio * 100)}% (>50%)`,
      };
    }
  }
  return { anomaly: false };
}

/**
 * Record an alert for a detected anomaly. Writes an ActivityLog entry and logs
 * to the console. Email alerting is added with the health monitor in Phase 3.
 */
export async function sendAnomalyAlert(params: {
  shopId: string;
  resourceId: string;
  reason: string;
}): Promise<void> {
  console.warn(
    `[anomaly] ${params.shopId} — ${params.resourceId}: ${params.reason} (paused)`,
  );
  await prisma.activityLog.create({
    data: {
      shopId: params.shopId,
      action: `Anomaly paused: ${params.resourceId} — ${params.reason}`,
      resourceType: "anomaly",
    },
  });
}
