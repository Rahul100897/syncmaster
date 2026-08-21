/**
 * Anomaly detection (implemented in Phase 2).
 * Rules (see CLAUDE.md): inventory change > 10x current value → flag;
 * price change > 50% → flag. Flagged events are paused and alerted.
 */

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
