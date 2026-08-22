/**
 * Billing (Phase 4). One Pro subscription on the primary (billing) store
 * covers ALL connected stores. isPro reads the active subscription from
 * Shopify, with a dev override and secondary-store coverage.
 */
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
export { PRO_PLAN } from "../shopify.server";

const ACTIVE_SUBS_QUERY = `#graphql
  query SmActiveSubs {
    currentAppInstallation {
      activeSubscriptions { name status }
    }
  }
`;

interface ActiveSubsResp {
  data?: {
    currentAppInstallation: {
      activeSubscriptions: Array<{ name: string; status: string }>;
    };
  };
}

/** Whether a shop has an ACTIVE Shopify app subscription (it is a billing store). */
async function hasActiveShopifySub(shop: string): Promise<boolean> {
  try {
    const { admin } = await unauthenticated.admin(shop);
    const res = await admin.graphql(ACTIVE_SUBS_QUERY);
    const json = (await res.json()) as ActiveSubsResp;
    const subs = json.data?.currentAppInstallation.activeSubscriptions ?? [];
    return subs.some((s) => s.status === "ACTIVE");
  } catch (error) {
    // Log with context; treat unknown as not-pro rather than throwing.
    console.error(`[billing] could not read subscription for ${shop}:`, error);
    return false;
  }
}

/**
 * Whether the given shop is on Pro. Checks (in order):
 * 1. SHOP_PLAN_OVERRIDE=pro dev fallback
 * 2. an active Shopify subscription on this shop (it is the billing store)
 * 3. coverage: this shop is a secondary whose primary has an active subscription
 */
export async function isPro(shopId: string): Promise<boolean> {
  if (process.env.SHOP_PLAN_OVERRIDE === "pro") return true;
  if (await hasActiveShopifySub(shopId)) return true;

  const asSecondary = await prisma.storeConnection.findFirst({
    where: { secondaryShopId: shopId, status: "connected" },
    select: { primaryShopId: true },
  });
  if (asSecondary && (await hasActiveShopifySub(asSecondary.primaryShopId))) {
    return true;
  }
  return false;
}

/** Persist the plan onto a shop's connections (so DB-based checks stay in sync). */
export async function setPlanForShop(shop: string, plan: "free" | "pro"): Promise<void> {
  await prisma.storeConnection.updateMany({
    where: { OR: [{ primaryShopId: shop }, { secondaryShopId: shop }] },
    data: { plan },
  });
}
