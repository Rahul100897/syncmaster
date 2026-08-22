import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getAnalytics, analyticsToCsv } from "../lib/analytics.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days")) || 30;
  const analytics = await getAnalytics(session.shop, days);
  const csv = analyticsToCsv(analytics);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="syncmaster-analytics-${days}d.csv"`,
    },
  });
};
