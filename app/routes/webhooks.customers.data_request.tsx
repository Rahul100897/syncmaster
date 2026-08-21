import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * GDPR mandatory topic: customers/data_request.
 * A store owner requests the data SyncMaster holds about a customer.
 * SyncMaster stores no customer PII, so we acknowledge with 200.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} (GDPR data request) webhook for ${shop}`);
  return new Response(null, { status: 200 });
};
