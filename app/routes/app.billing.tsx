import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useOutletContext, useFetcher } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  List,
  Text,
} from "@shopify/polaris";
import { format } from "date-fns";

import { authenticate, PRO_PLAN } from "../shopify.server";
import { isPro, setPlanForShop } from "../lib/billing.server";
import AppLayout from "../components/AppLayout";
import { SkeletonBlock, SkeletonTwoColumn, useRouteLoading } from "../components/Skeleton";
import type { AppOutletContext } from "./app";

const isTest = process.env.NODE_ENV !== "production";

const SUB_DETAILS = `#graphql
  query SmSubDetails {
    currentAppInstallation {
      activeSubscriptions { id name status currentPeriodEnd }
    }
  }
`;

interface SubResp {
  data?: {
    currentAppInstallation: {
      activeSubscriptions: Array<{ id: string; name: string; status: string; currentPeriodEnd: string }>;
    };
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const pro = await isPro(session.shop);
  await setPlanForShop(session.shop, pro ? "pro" : "free");

  let renewsAt: string | null = null;
  let subscriptionId: string | null = null;
  if (pro) {
    try {
      const res = await admin.graphql(SUB_DETAILS);
      const json = (await res.json()) as SubResp;
      const sub = json.data?.currentAppInstallation.activeSubscriptions.find(
        (s) => s.status === "ACTIVE",
      );
      renewsAt = sub?.currentPeriodEnd ?? null;
      subscriptionId = sub?.id ?? null;
    } catch (error) {
      console.error(`[billing] sub details failed for ${session.shop}:`, error);
    }
  }

  return { pro, renewsAt, subscriptionId };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const appUrl = process.env.SHOPIFY_APP_URL || "";

  if (intent === "upgrade") {
    // Redirects to the Shopify approval URL; on approval Shopify returns to returnUrl.
    return billing.request({
      plan: PRO_PLAN,
      isTest,
      returnUrl: `${appUrl}/app/billing`,
    });
  }

  if (intent === "cancel") {
    const subscriptionId = String(form.get("subscriptionId") ?? "");
    if (subscriptionId) {
      await billing.cancel({ subscriptionId, isTest, prorate: true });
      await setPlanForShop(session.shop, "free");
    }
    return { ok: true as const };
  }

  return { ok: false as const };
};

const PRO_FEATURES = [
  "Up to 5 stores, unlimited products",
  "Real-time ongoing sync (webhooks)",
  "Snapshot + one-click rollback",
  "Anomaly detection",
  "Cross-store analytics + payouts",
  "Sync health monitor + alerts",
  "Metafield + metaobject sync",
];

const FREE_FEATURES = [
  "Connect 2 stores",
  "Up to 25 products",
  "Migration mode only",
  "Safe Sync dry-run preview",
  "Pre-sync conflict scanner",
];

export default function Billing() {
  const { pro, renewsAt, subscriptionId } = useLoaderData<typeof loader>();
  const { shop, plan } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const upgradeFetcher = useFetcher<typeof action>();
  const cancelFetcher = useFetcher<typeof action>();
  const routeLoading = useRouteLoading();

  if (routeLoading) {
    return (
      <AppLayout shop={shop} plan={plan}>
        <BlockStack gap="500">
          <BlockStack gap="100">
            <SkeletonBlock width={120} height={24} />
            <SkeletonBlock width={420} height={14} />
          </BlockStack>
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <SkeletonBlock width={160} height={16} />
                <SkeletonBlock width={220} height={12} />
              </BlockStack>
              <SkeletonBlock width={140} height={16} />
            </InlineStack>
          </Card>
          <SkeletonTwoColumn leftLines={5} rightLines={5} />
        </BlockStack>
      </AppLayout>
    );
  }

  return (
    <AppLayout shop={shop} plan={plan}>
      <BlockStack gap="500">
        <BlockStack gap="100">
          <Text as="h1" variant="headingXl" fontWeight="bold">
            Billing
          </Text>
          <Text as="p" tone="subdued">
            One subscription on your primary store covers every connected store.
          </Text>
        </BlockStack>

        {/* Current plan */}
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Current plan
                </Text>
                <Badge tone={pro ? "success" : undefined}>{pro ? "PRO" : "FREE"}</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                {pro
                  ? renewsAt
                    ? `Renews ${format(new Date(renewsAt), "MMM d, yyyy")}`
                    : "Active subscription"
                  : "You're on the Free plan."}
              </Text>
            </BlockStack>
            {pro && subscriptionId ? (
              <cancelFetcher.Form method="post">
                <input type="hidden" name="intent" value="cancel" />
                <input type="hidden" name="subscriptionId" value={subscriptionId} />
                <Button variant="plain" tone="critical" submit loading={cancelFetcher.state !== "idle"}>
                  Cancel subscription
                </Button>
              </cancelFetcher.Form>
            ) : null}
          </InlineStack>
        </Card>

        {/* Plan comparison */}
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Free</Text>
                <Text as="p" variant="headingLg" fontWeight="bold">$0</Text>
              </InlineStack>
              <Divider />
              <List>
                {FREE_FEATURES.map((f) => (
                  <List.Item key={f}>{f}</List.Item>
                ))}
              </List>
            </BlockStack>
          </Card>

          <Card background={pro ? undefined : "bg-surface-selected"}>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Pro</Text>
                <Text as="p" variant="headingLg" fontWeight="bold">$29/mo</Text>
              </InlineStack>
              <Text as="p" tone="subdued">7-day free trial</Text>
              <Divider />
              <List>
                {PRO_FEATURES.map((f) => (
                  <List.Item key={f}>{f}</List.Item>
                ))}
              </List>
              {pro ? (
                <Button disabled fullWidth>
                  Your current plan
                </Button>
              ) : (
                <upgradeFetcher.Form method="post">
                  <input type="hidden" name="intent" value="upgrade" />
                  <Button variant="primary" fullWidth submit loading={upgradeFetcher.state !== "idle"}>
                    Upgrade to Pro — start 7-day trial
                  </Button>
                </upgradeFetcher.Form>
              )}
            </BlockStack>
          </Card>
        </InlineGrid>

        <Button variant="plain" onClick={() => navigate("/app")}>
          ← Back to dashboard
        </Button>
      </BlockStack>
    </AppLayout>
  );
}
