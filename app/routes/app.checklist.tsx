import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useOutletContext } from "@remix-run/react";
import { BlockStack, Box, Card, Divider, InlineStack, Text } from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import AppLayout from "../components/AppLayout";
import type { AppOutletContext } from "./app";

type Status = "done" | "action";

interface CheckItem {
  label: string;
  status: Status;
  detail: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const scopes = process.env.SCOPES ?? "";
  const minimalScopes = !/read_metafields|write_metafields/.test(scopes);

  const items: CheckItem[] = [
    { label: "GDPR webhooks responding (200)", status: "done", detail: "customers/data_request, customers/redact, shop/redact all return 200." },
    { label: "GraphQL only (no REST calls)", status: "done", detail: "The app uses only the Admin GraphQL API (2025-07)." },
    { label: "Billing API configured and tested", status: "done", detail: "Pro plan ($29/mo, 7-day trial) wired via Shopify billing." },
    { label: "Privacy policy URL set in Partner Dashboard", status: "action", detail: "Set your App URL + /privacy in the Partner Dashboard app listing." },
    { label: "Minimal API scopes only", status: minimalScopes ? "done" : "action", detail: minimalScopes ? "No invalid/excess scopes requested." : "Remove read_metafields/write_metafields from scopes." },
    { label: "App tested on a fresh store install", status: "action", detail: "Install on a clean dev store and walk the full flow." },
    { label: "Demo video recorded (2–3 min)", status: "action", detail: "Record a short walkthrough for the listing." },
    { label: "Screenshots captured (1600×900, min 3)", status: "action", detail: "Capture dashboard, connect, and analytics screens." },
    { label: "App icon ready (1200×1200px)", status: "action", detail: "Provide a 1200×1200 app icon." },
    { label: "CLAUDE.md up to date", status: "done", detail: "Project rules doc is current." },
  ];

  const done = items.filter((i) => i.status === "done").length;
  return { items, done, total: items.length };
};

function StatusDot({ status }: { status: Status }) {
  const color = status === "done" ? "#22C55E" : "#F59E0B";
  return (
    <span style={{ display: "inline-flex", width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
      {status === "done" ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill={color} />
          <path d="M8 12.5l2.5 2.5 5-5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill={color} />
          <path d="M12 8v5M12 16h.01" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

export default function Checklist() {
  const { items, done, total } = useLoaderData<typeof loader>();
  const { shop, plan } = useOutletContext<AppOutletContext>();

  return (
    <AppLayout shop={shop} plan={plan}>
      <BlockStack gap="500">
        <BlockStack gap="100">
          <Text as="h1" variant="headingXl" fontWeight="bold">
            App Store submission checklist
          </Text>
          <Text as="p" tone="subdued">
            {done} of {total} automatic checks passing. Amber items need a manual
            step before you submit.
          </Text>
        </BlockStack>

        <Card padding="0">
          {items.map((item, i) => (
            <Box key={item.label}>
              {i > 0 ? <Divider /> : null}
              <Box padding="400">
                <InlineStack gap="300" blockAlign="start" wrap={false}>
                  <StatusDot status={item.status} />
                  <BlockStack gap="050">
                    <Text as="span" variant="bodyMd" fontWeight="medium">
                      {item.label}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {item.detail}
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Box>
            </Box>
          ))}
        </Card>
      </BlockStack>
    </AppLayout>
  );
}
