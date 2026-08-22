/**
 * Revenue sharing / payout splits (Phase 3). For each order on a connected
 * store, split revenue between the primary and secondary store by the
 * configured percentage. Read-only aggregation.
 */
import prisma from "../db.server";
import { fetchOrders } from "./graphql.server";

export interface PayoutRow {
  orderId: string;
  soldBy: string;
  createdAt: string;
  total: number;
  primaryShare: number;
  secondaryShare: number;
}

export interface PayoutReport {
  days: number;
  connected: boolean;
  primaryShop: string | null;
  secondaryShop: string | null;
  primaryPct: number;
  rows: PayoutRow[];
  totals: { total: number; primary: number; secondary: number };
  truncated: boolean;
}

async function connectionFor(shop: string) {
  return prisma.storeConnection.findFirst({
    where: { status: "connected", OR: [{ primaryShopId: shop }, { secondaryShopId: shop }] },
    orderBy: { connectedAt: "desc" },
  });
}

export async function getPayouts(shop: string, days: number): Promise<PayoutReport> {
  const connection = await connectionFor(shop);
  if (!connection || !connection.secondaryShopId) {
    return {
      days,
      connected: false,
      primaryShop: null,
      secondaryShop: null,
      primaryPct: 50,
      rows: [],
      totals: { total: 0, primary: 0, secondary: 0 },
      truncated: false,
    };
  }

  const primaryPct = connection.payoutPrimaryPct;
  const fromISO = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const stores = [connection.primaryShopId, connection.secondaryShopId];

  const rows: PayoutRow[] = [];
  let truncated = false;
  for (const store of stores) {
    const res = await fetchOrders(store, fromISO);
    if (res.truncated) truncated = true;
    for (const o of res.orders) {
      const primaryShare = (o.total * primaryPct) / 100;
      rows.push({
        orderId: o.id.split("/").pop() ?? o.id,
        soldBy: store,
        createdAt: o.createdAt,
        total: o.total,
        primaryShare,
        secondaryShare: o.total - primaryShare,
      });
    }
  }
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      primary: acc.primary + r.primaryShare,
      secondary: acc.secondary + r.secondaryShare,
    }),
    { total: 0, primary: 0, secondary: 0 },
  );

  return {
    days,
    connected: true,
    primaryShop: connection.primaryShopId,
    secondaryShop: connection.secondaryShopId,
    primaryPct,
    rows,
    totals,
    truncated,
  };
}

export function payoutsToCsv(report: PayoutReport): string {
  const lines: string[] = [];
  lines.push(`SyncMaster payouts — last ${report.days} days (primary ${report.primaryPct}% / secondary ${100 - report.primaryPct}%)`);
  lines.push("");
  lines.push("Order,SoldBy,Date,Total,PrimaryShare,SecondaryShare");
  for (const r of report.rows) {
    lines.push(`${r.orderId},${r.soldBy},${r.createdAt},${r.total.toFixed(2)},${r.primaryShare.toFixed(2)},${r.secondaryShare.toFixed(2)}`);
  }
  lines.push("");
  lines.push(`Totals,,,${report.totals.total.toFixed(2)},${report.totals.primary.toFixed(2)},${report.totals.secondary.toFixed(2)}`);
  return lines.join("\n");
}
