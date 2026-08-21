import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { enqueueInventoryWebhook } from "../lib/webhook.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} for ${shop}`);
  try {
    await enqueueInventoryWebhook(shop, payload as Record<string, unknown>);
  } catch (error) {
    // Log with context, then 200 so Shopify doesn't spam-retry (job is durable in DB).
    console.error(`inventory_levels/update enqueue failed for ${shop}:`, error);
  }
  return new Response(null, { status: 200 });
};
