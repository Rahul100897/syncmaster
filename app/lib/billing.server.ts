import prisma from "../db.server";

/**
 * Whether the given shop is on the Pro plan.
 *
 * Placeholder implementation (fully wired to the Shopify Billing API in
 * Phase 4). For now it honours a dev override and otherwise reads the plan
 * from any StoreConnection where this shop is the primary (billing) store.
 */
export async function isPro(shopId: string): Promise<boolean> {
  if (process.env.SHOP_PLAN_OVERRIDE === "pro") return true;

  const connection = await prisma.storeConnection.findFirst({
    where: { primaryShopId: shopId, plan: "pro" },
    select: { id: true },
  });
  return connection !== null;
}
