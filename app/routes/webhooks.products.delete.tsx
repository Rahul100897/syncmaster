import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { recordProductDeletion } from "../lib/webhook.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} for ${shop}`);
  // SyncMaster never deletes on the destination — record only.
  try {
    await recordProductDeletion(shop, payload as Record<string, unknown>);
  } catch (error) {
    console.error(`products/delete record failed for ${shop}:`, error);
  }
  return new Response(null, { status: 200 });
};
