/**
 * Convenience re-export of the app's Shopify configuration.
 * The canonical config lives in app/shopify.server.ts (created by the Shopify
 * CLI scaffold). Import from here inside app/lib/* modules for a stable path.
 */
export {
  default as shopify,
  apiVersion,
  authenticate,
  unauthenticated,
  login,
  registerWebhooks,
  sessionStorage,
  addDocumentResponseHeaders,
} from "../shopify.server";
