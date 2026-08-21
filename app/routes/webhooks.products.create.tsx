import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { enqueueProductWebhook } from "../lib/webhook.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} for ${shop}`);
  try {
    await enqueueProductWebhook(shop, payload as Record<string, unknown>);
  } catch (error) {
    console.error(`products/create enqueue failed for ${shop}:`, error);
  }
  return new Response(null, { status: 200 });
};
