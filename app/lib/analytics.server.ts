/**
 * Cross-store analytics (Phase 3). Aggregates orders + stock across every
 * store in a merchant's connections for a date range. Read-only.
 */
import prisma from "../db.server";
import { fetchOrders, fetchProducts } from "./graphql.server";

export interface StoreStat {
  shop: string;
  role: "primary" | "secondary";
  orders: number;
  revenue: number;
  stockUnits: number;
}

export interface ProductStat {
  title: string;
  revenue: number;
  units: number;
  byStore: Record<string, number>;
  topStore: string;
}

export interface Analytics {
  days: number;
  fromISO: string;
  stores: StoreStat[];
  totalRevenue: number;
  totalOrders: number;
  topProducts: ProductStat[];
  truncated: boolean;
}

/** Distinct shops across a merchant's connected pairs, with their role. */
async function shopsFor(shop: string): Promise<Array<{ shop: string; role: "primary" | "secondary" }>> {
  const connections = await prisma.storeConnection.findMany({
    where: { status: "connected", OR: [{ primaryShopId: shop }, { secondaryShopId: shop }] },
  });
  const map = new Map<string, "primary" | "secondary">();
  for (const c of connections) {
    map.set(c.primaryShopId, "primary");
    if (c.secondaryShopId) map.set(c.secondaryShopId, map.get(c.secondaryShopId) ?? "secondary");
  }
  return Array.from(map.entries()).map(([s, role]) => ({ shop: s, role }));
}

export async function getAnalytics(shop: string, days: number): Promise<Analytics> {
  const fromISO = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const stores = await shopsFor(shop);

  const productAgg = new Map<string, { revenue: number; units: number; byStore: Record<string, number> }>();
  const storeStats: StoreStat[] = [];
  let totalRevenue = 0;
  let totalOrders = 0;
  let truncated = false;

  for (const s of stores) {
    const [orderRes, productRes] = await Promise.all([
      fetchOrders(s.shop, fromISO),
      fetchProducts(s.shop),
    ]);
    if (orderRes.truncated) truncated = true;

    let revenue = 0;
    for (const o of orderRes.orders) {
      revenue += o.total;
      for (const li of o.lineItems) {
        const agg = productAgg.get(li.title) ?? { revenue: 0, units: 0, byStore: {} };
        agg.revenue += li.revenue;
        agg.units += li.quantity;
        agg.byStore[s.shop] = (agg.byStore[s.shop] ?? 0) + li.revenue;
        productAgg.set(li.title, agg);
      }
    }
    const stockUnits = productRes.products.reduce(
      (sum, p) => sum + p.variants.reduce((vs, v) => vs + (v.inventoryQuantity ?? 0), 0),
      0,
    );

    storeStats.push({
      shop: s.shop,
      role: s.role,
      orders: orderRes.orders.length,
      revenue,
      stockUnits,
    });
    totalRevenue += revenue;
    totalOrders += orderRes.orders.length;
  }

  const topProducts: ProductStat[] = Array.from(productAgg.entries())
    .map(([title, agg]) => {
      const topStore =
        Object.entries(agg.byStore).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      return { title, revenue: agg.revenue, units: agg.units, byStore: agg.byStore, topStore };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return { days, fromISO, stores: storeStats, totalRevenue, totalOrders, topProducts, truncated };
}

/** Build a CSV export of the analytics for a date range. */
export function analyticsToCsv(a: Analytics): string {
  const lines: string[] = [];
  lines.push(`SyncMaster analytics — last ${a.days} days`);
  lines.push("");
  lines.push("Store,Role,Orders,Revenue,StockUnits");
  for (const s of a.stores) {
    lines.push(`${s.shop},${s.role},${s.orders},${s.revenue.toFixed(2)},${s.stockUnits}`);
  }
  lines.push("");
  lines.push("Top products,Revenue,Units,Top store");
  for (const p of a.topProducts) {
    lines.push(`${JSON.stringify(p.title)},${p.revenue.toFixed(2)},${p.units},${p.topStore}`);
  }
  return lines.join("\n");
}
