import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { isPro } from "../lib/billing.server";
import type { Plan } from "../components/AppLayout";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export interface AppOutletContext {
  shop: string;
  plan: Plan;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const plan: Plan = (await isPro(session.shop)) ? "pro" : "free";

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    plan,
  };
};

export default function App() {
  const { apiKey, shop, plan } = useLoaderData<typeof loader>();
  const context: AppOutletContext = { shop, plan };

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {/* Shopify Admin native nav (App Bridge) — mirrors the in-app sidebar. */}
      <NavMenu>
        <Link to="/app" rel="home">
          Dashboard
        </Link>
        <Link to="/app/connect">Connect Stores</Link>
        <Link to="/app/rules">What to Sync</Link>
        <Link to="/app/jobs">Sync Activity</Link>
        <Link to="/app/snapshots">Backups</Link>
        <Link to="/app/analytics">Analytics</Link>
        <Link to="/app/activity">Activity Log</Link>
        <Link to="/app/settings">Settings</Link>
      </NavMenu>
      <Outlet context={context} />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
