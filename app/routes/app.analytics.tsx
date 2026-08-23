import { defer } from "@remix-run/node";
import { Suspense } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  useAsyncValue,
  useLoaderData,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Text,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { getAnalytics, type Analytics } from "../lib/analytics.server";
import { isPro } from "../lib/billing.server";
import AppLayout from "../components/AppLayout";
import ProLock from "../components/ProLock";
import { SkeletonBlock, SkeletonCard, SkeletonTable } from "../components/Skeleton";
import type { AppOutletContext } from "./app";

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days")) || 30;
  if (!(await isPro(session.shop))) return defer({ locked: true as const, days });
  return defer({ locked: false as const, days, analytics: getAnalytics(session.shop, days) });
};

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function Bar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <BlockStack gap="100">
      <InlineStack align="space-between">
        <Text as="span" variant="bodySm">{label}</Text>
        <Text as="span" variant="bodySm" fontWeight="medium">
          {suffix === "$" ? money(value) : `${value}${suffix ?? ""}`}
        </Text>
      </InlineStack>
      <div style={{ background: "#EEF2FF", borderRadius: 6, height: 10, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, background: "#6366F1", height: "100%" }} />
      </div>
    </BlockStack>
  );
}

function AnalyticsBody() {
  const a = useAsyncValue() as Analytics;
  const maxRevenue = Math.max(1, ...a.stores.map((s) => s.revenue));
  const maxStock = Math.max(1, ...a.stores.map((s) => s.stockUnits));
  const maxProduct = Math.max(1, ...a.topProducts.map((p) => p.revenue));

  return (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
        <Card>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">Total revenue (all stores)</Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">{money(a.totalRevenue)}</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">Total orders</Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">{a.totalOrders}</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">Stores</Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">{a.stores.length}</Text>
          </BlockStack>
        </Card>
      </InlineGrid>

      {a.truncated ? (
        <Text as="p" tone="subdued" variant="bodySm">
          Note: order volume exceeded the fetch limit — figures show the most recent orders.
        </Text>
      ) : null}

      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Revenue by store</Text>
            {a.stores.length === 0 ? (
              <Text as="p" tone="subdued">No stores connected.</Text>
            ) : (
              a.stores.map((s) => (
                <Bar key={s.shop} label={`${s.shop} (${s.role})`} value={s.revenue} max={maxRevenue} suffix="$" />
              ))
            )}
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Stock levels by store</Text>
            {a.stores.map((s) => (
              <Bar key={s.shop} label={s.shop} value={s.stockUnits} max={maxStock} suffix=" units" />
            ))}
          </BlockStack>
        </Card>
      </InlineGrid>

      <Card padding="0">
        <Box padding="400">
          <Text as="h2" variant="headingMd">Top 10 products by revenue</Text>
        </Box>
        <Divider />
        {a.topProducts.length === 0 ? (
          <Box padding="400"><Text as="p" tone="subdued">No orders in this period.</Text></Box>
        ) : (
          <BlockStack>
            {a.topProducts.map((p, i) => (
              <div key={p.title} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F8F9FF" }}>
                <Box padding="300" paddingInlineStart="400" paddingInlineEnd="400">
                  <BlockStack gap="100">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" variant="bodyMd" fontWeight="medium">{p.title}</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodySm" tone="subdued">{p.units} sold</Text>
                        <Badge>{`Top: ${p.topStore}`}</Badge>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">{money(p.revenue)}</Text>
                      </InlineStack>
                    </InlineStack>
                    <div style={{ background: "#EEF2FF", borderRadius: 4, height: 6 }}>
                      <div style={{ width: `${Math.max(2, Math.round((p.revenue / maxProduct) * 100))}%`, background: "#22C55E", height: "100%", borderRadius: 4 }} />
                    </div>
                  </BlockStack>
                </Box>
              </div>
            ))}
          </BlockStack>
        )}
      </Card>
    </BlockStack>
  );
}

function AnalyticsSkeleton() {
  return (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </InlineGrid>
      <Card>
        <BlockStack gap="300">
          <SkeletonBlock width={160} height={16} />
          <SkeletonBlock height={400} radius={8} />
        </BlockStack>
      </Card>
      <SkeletonTable rows={6} columns={4} />
    </BlockStack>
  );
}

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>();
  const { shop, plan } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  if (data.locked) {
    return (
      <AppLayout shop={shop} plan={plan}>
        <BlockStack gap="500">
          <Text as="h1" variant="headingXl" fontWeight="bold">Analytics</Text>
          <ProLock feature="Cross-store analytics" />
        </BlockStack>
      </AppLayout>
    );
  }

  const { days, analytics } = data;

  return (
    <AppLayout shop={shop} plan={plan}>
      <BlockStack gap="500">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl" fontWeight="bold">Analytics</Text>
            <Text as="p" tone="subdued">Unified revenue and stock across every connected store.</Text>
          </BlockStack>
          <InlineStack gap="300" blockAlign="center">
            <ButtonGroup variant="segmented">
              {RANGES.map((r) => (
                <Button
                  key={r.days}
                  pressed={days === r.days}
                  onClick={() => setSearchParams({ days: String(r.days) })}
                >
                  {r.label}
                </Button>
              ))}
            </ButtonGroup>
            <Button url={`/app/analytics/export?days=${days}`} target="_blank" variant="primary">
              Export CSV
            </Button>
          </InlineStack>
        </InlineStack>

        <Suspense fallback={<AnalyticsSkeleton />} key={days}>
          <Await resolve={analytics}>
            <AnalyticsBody />
          </Await>
        </Suspense>
      </BlockStack>
    </AppLayout>
  );
}
