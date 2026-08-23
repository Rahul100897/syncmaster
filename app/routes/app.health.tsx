import { Suspense } from "react";
import { defer } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { Await, useLoaderData, useNavigate, useOutletContext, useRevalidator } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { formatDistanceToNow } from "date-fns";

import { authenticate } from "../shopify.server";
import {
  getHealth,
  type CredentialStatus,
  type ConnectionHealth,
  type WeeklySummary,
} from "../lib/health.server";
import { isPro } from "../lib/billing.server";
import AppLayout from "../components/AppLayout";
import ProLock from "../components/ProLock";
import { SkeletonBlock, SkeletonTwoColumn } from "../components/Skeleton";
import type { AppOutletContext } from "./app";

type HealthData =
  | { locked: true; connections: ConnectionHealth[]; weekly: null }
  | { locked: false; connections: ConnectionHealth[]; weekly: WeeklySummary };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const data: Promise<HealthData> = (async () => {
    if (!(await isPro(shop)))
      return { locked: true as const, connections: [], weekly: null };
    const report = await getHealth(shop);
    return { locked: false as const, ...report };
  })();

  return defer({ data });
};

function CredBadge({ status }: { status: CredentialStatus }) {
  switch (status) {
    case "valid":
      return <Badge tone="success">Valid</Badge>;
    case "expiring":
      return <Badge tone="warning">Expiring</Badge>;
    case "expired":
      return <Badge tone="critical">Expired</Badge>;
    default:
      return <Badge>Unknown</Badge>;
  }
}

function rateTone(rate: number): "success" | "warning" | "critical" {
  if (rate >= 95) return "success";
  if (rate >= 80) return "warning";
  return "critical";
}

function HealthSkeleton() {
  return (
    <BlockStack gap="500">
      <BlockStack gap="100">
        <SkeletonBlock width={160} height={24} />
        <SkeletonBlock width={340} height={14} />
      </BlockStack>
      <Card>
        <BlockStack gap="300">
          <SkeletonBlock width={120} height={16} />
          <SkeletonBlock height={40} radius={8} />
        </BlockStack>
      </Card>
      <SkeletonTwoColumn leftLines={4} rightLines={4} withButton={false} />
    </BlockStack>
  );
}

function HealthBody({ data, shop, plan }: { data: HealthData; shop: string; plan: "free" | "pro" }) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  if (data.locked || !data.weekly) {
    return (
      <BlockStack gap="500">
        <Text as="h1" variant="headingXl" fontWeight="bold">Sync Health</Text>
        <ProLock feature="Sync health monitor" />
      </BlockStack>
    );
  }

  const { connections, weekly } = data;

  return (
    <BlockStack gap="500">
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <Text as="h1" variant="headingXl" fontWeight="bold">
            Sync Health
          </Text>
          <Text as="p" tone="subdued">
            Live status per connection, with proactive alerts.
          </Text>
        </BlockStack>
        <Button onClick={() => revalidator.revalidate()} loading={revalidator.state !== "idle"}>
          Refresh
        </Button>
      </InlineStack>

      {/* Weekly health report summary */}
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            This week
          </Text>
          <InlineGrid columns={{ xs: 2, sm: 5 }} gap="300">
            {[
              { label: "Jobs", value: String(weekly.jobs) },
              { label: "Completed", value: String(weekly.completed) },
              { label: "Failed", value: String(weekly.failed) },
              { label: "Anomalies", value: String(weekly.anomalies) },
              { label: "Success rate", value: `${weekly.successRate}%` },
            ].map((m) => (
              <BlockStack key={m.label} gap="050">
                <Text as="span" variant="bodySm" tone="subdued">
                  {m.label}
                </Text>
                <Text as="p" variant="headingLg" fontWeight="bold">
                  {m.value}
                </Text>
              </BlockStack>
            ))}
          </InlineGrid>
        </BlockStack>
      </Card>

      {connections.length === 0 ? (
        <Card>
          <BlockStack gap="300" inlineAlign="center">
            <Text as="p" tone="subdued">
              No connections yet. Connect a store pair to start monitoring.
            </Text>
            <Button variant="primary" onClick={() => navigate("/app/connect")}>
              Connect stores
            </Button>
          </BlockStack>
        </Card>
      ) : (
        connections.map((c) => (
          <Card key={c.connectionId}>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  {c.primaryShop} → {c.secondaryShop ?? "—"}
                </Text>
                <Badge tone={c.status === "connected" ? "success" : "critical"}>
                  {c.status}
                </Badge>
              </InlineStack>

              {c.alerts.length > 0 ? (
                <Banner tone="warning" title="Alerts">
                  <BlockStack gap="100">
                    {c.alerts.map((a, i) => (
                      <Text as="p" key={i}>
                        {a}
                      </Text>
                    ))}
                  </BlockStack>
                </Banner>
              ) : null}

              <Divider />
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Last successful sync</Text>
                    <Text as="span" fontWeight="medium">
                      {c.lastSuccessAt
                        ? formatDistanceToNow(new Date(c.lastSuccessAt), { addSuffix: true })
                        : "Never"}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Last failed sync</Text>
                    <Text as="span" fontWeight="medium">
                      {c.lastFailedAt
                        ? formatDistanceToNow(new Date(c.lastFailedAt), { addSuffix: true })
                        : "None"}
                    </Text>
                  </InlineStack>
                  {c.lastError ? (
                    <Text as="p" tone="critical" variant="bodySm">
                      {c.lastError}
                    </Text>
                  ) : null}
                </BlockStack>

                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="span" tone="subdued">Success rate (7d)</Text>
                    <Badge tone={rateTone(c.successRate7d)}>{`${c.successRate7d}% · ${c.jobs7d} jobs`}</Badge>
                  </InlineStack>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="span" tone="subdued">Primary credentials</Text>
                    <CredBadge status={c.credentialPrimary} />
                  </InlineStack>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="span" tone="subdued">Secondary credentials</Text>
                    <CredBadge status={c.credentialSecondary} />
                  </InlineStack>
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Card>
        ))
      )}
    </BlockStack>
  );
}

export default function Health() {
  const { data } = useLoaderData<typeof loader>();
  const { shop, plan } = useOutletContext<AppOutletContext>();
  return (
    <AppLayout shop={shop} plan={plan}>
      <Suspense fallback={<HealthSkeleton />}>
        <Await resolve={data}>{(resolved) => <HealthBody data={resolved} shop={shop} plan={plan} />}</Await>
      </Suspense>
    </AppLayout>
  );
}
