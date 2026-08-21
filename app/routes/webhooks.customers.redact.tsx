import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * GDPR mandatory topic: customers/redact.
 * A request to delete a customer's data. SyncMaster stores no customer PII,
 * so there is nothing to redact — acknowledge with 200.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} (GDPR customer redact) webhook for ${shop}`);
  return new Response(null, { status: 200 });
};
