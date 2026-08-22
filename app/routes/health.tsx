import { json } from "@remix-run/node";

/** Public health check for Railway (no authentication). */
export const loader = () => {
  return json({ status: "ok", timestamp: Date.now() });
};
