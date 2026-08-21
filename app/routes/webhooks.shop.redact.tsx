import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * GDPR mandatory topic: shop/redact.
 * Sent 48h after a shop uninstalls; delete all data for that shop.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} (GDPR shop redact) webhook for ${shop}`);

  // Remove any sessions and connections tied to this shop.
  await db.session.deleteMany({ where: { shop } });
  await db.storeConnection.deleteMany({
    where: {
      OR: [{ primaryShopId: shop }, { secondaryShopId: shop }],
    },
  });

  return new Response(null, { status: 200 });
};
