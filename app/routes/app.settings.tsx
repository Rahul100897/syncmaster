import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useOutletContext, useNavigate } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Modal,
  RadioButton,
  Text,
  TextField,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import AppLayout from "../components/AppLayout";
import type { AppOutletContext } from "./app";

interface NotificationPrefs {
  syncFailed: boolean;
  anomaly: boolean;
  credExpiring: boolean;
  disconnected: boolean;
}
interface SettingsConfig {
  notifications: NotificationPrefs;
  schedule: "realtime" | "offpeak";
  offPeakStart: string;
  offPeakEnd: string;
}

const DEFAULT_SETTINGS: SettingsConfig = {
  notifications: { syncFailed: true, anomaly: true, credExpiring: true, disconnected: true },
  schedule: "realtime",
  offPeakStart: "01:00",
  offPeakEnd: "05:00",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const connections = await prisma.storeConnection.findMany({
    where: { OR: [{ primaryShopId: session.shop }, { secondaryShopId: session.shop }] },
    orderBy: { createdAt: "desc" },
  });
  const primary = connections.find((c) => c.primaryShopId === session.shop) ?? connections[0];
  const settings = (primary?.settingsConfig as SettingsConfig | null) ?? DEFAULT_SETTINGS;

  return {
    shop: session.shop,
    settings,
    connections: connections.map((c) => ({
      id: c.id,
      primaryShopId: c.primaryShopId,
      secondaryShopId: c.secondaryShopId,
      status: c.status,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const myConnections = await prisma.storeConnection.findMany({
    where: { OR: [{ primaryShopId: session.shop }, { secondaryShopId: session.shop }] },
  });
  const connectionIds = myConnections.map((c) => c.id);

  if (intent === "saveSettings") {
    const settings = JSON.parse(String(form.get("settings") ?? "{}")) as SettingsConfig;
    const primary = myConnections.find((c) => c.primaryShopId === session.shop) ?? myConnections[0];
    if (primary) {
      await prisma.storeConnection.update({
        where: { id: primary.id },
        data: { settingsConfig: settings as object },
      });
    }
    return { ok: true as const, message: "Settings saved." };
  }

  if (intent === "disconnect") {
    const id = String(form.get("connectionId"));
    await prisma.storeConnection.update({ where: { id }, data: { status: "disconnected" } });
    await prisma.activityLog.create({ data: { shopId: session.shop, action: "Disconnected store pair", resourceType: "connection" } });
    return { ok: true as const, message: "Store disconnected." };
  }

  if (intent === "reconnect") {
    const id = String(form.get("connectionId"));
    const conn = myConnections.find((c) => c.id === id);
    await prisma.storeConnection.update({
      where: { id },
      data: { status: conn?.secondaryShopId ? "connected" : "pending" },
    });
    return { ok: true as const, message: "Store reconnected." };
  }

  if (intent === "disconnectAll") {
    await prisma.storeConnection.updateMany({
      where: { id: { in: connectionIds } },
      data: { status: "disconnected" },
    });
    return { ok: true as const, message: "All stores disconnected." };
  }

  if (intent === "clearData") {
    // Deletes SyncMaster's own records only — never touches store data.
    await prisma.syncEvent.deleteMany({ where: { job: { connectionId: { in: connectionIds } } } });
    await prisma.syncJob.deleteMany({ where: { connectionId: { in: connectionIds } } });
    await prisma.snapshot.deleteMany({ where: { connectionId: { in: connectionIds } } });
    await prisma.activityLog.deleteMany({ where: { shopId: session.shop } });
    return { ok: true as const, message: "All sync data cleared." };
  }

  return { ok: false as const, error: "Unknown action." };
};

type ConfirmKind = "disconnectAll" | "clearData" | null;

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const { shop, plan } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const settingsFetcher = useFetcher<typeof action>();
  const connFetcher = useFetcher<typeof action>();
  const dangerFetcher = useFetcher<typeof action>();

  const [settings, setSettings] = useState<SettingsConfig>(data.settings);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);

  useEffect(() => {
    for (const f of [settingsFetcher, connFetcher, dangerFetcher]) {
      if (f.state === "idle" && f.data) {
        if (f.data.ok) shopify.toast.show(f.data.message);
        else shopify.toast.show(f.data.error, { isError: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsFetcher.data, connFetcher.data, dangerFetcher.data]);

  useEffect(() => {
    if (dangerFetcher.state === "idle" && dangerFetcher.data?.ok) setConfirm(null);
  }, [dangerFetcher.state, dangerFetcher.data]);

  const setNotif = (key: keyof NotificationPrefs, v: boolean) =>
    setSettings((s) => ({ ...s, notifications: { ...s.notifications, [key]: v } }));

  return (
    <AppLayout shop={shop} plan={plan}>
      <BlockStack gap="500">
        <Text as="h1" variant="headingXl" fontWeight="bold">
          Settings
        </Text>

        {/* Connections */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Store connections</Text>
            {data.connections.length === 0 ? (
              <InlineStack gap="300" blockAlign="center">
                <Text as="p" tone="subdued">No connections yet.</Text>
                <Button onClick={() => navigate("/app/connect")}>Connect stores</Button>
              </InlineStack>
            ) : (
              data.connections.map((c) => (
                <Box key={c.id}>
                  <Divider />
                  <Box paddingBlockStart="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="050">
                        <Text as="span" variant="bodyMd" fontWeight="medium">
                          {c.primaryShopId} → {c.secondaryShopId ?? "—"}
                        </Text>
                        <Badge tone={c.status === "connected" ? "success" : undefined}>{c.status}</Badge>
                      </BlockStack>
                      <connFetcher.Form method="post">
                        <input type="hidden" name="connectionId" value={c.id} />
                        <input type="hidden" name="intent" value={c.status === "connected" ? "disconnect" : "reconnect"} />
                        <Button submit tone={c.status === "connected" ? "critical" : undefined} variant="tertiary" loading={connFetcher.state !== "idle"}>
                          {c.status === "connected" ? "Disconnect" : "Reconnect"}
                        </Button>
                      </connFetcher.Form>
                    </InlineStack>
                  </Box>
                </Box>
              ))
            )}
          </BlockStack>
        </Card>

        {/* Notifications */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Email notifications</Text>
            <Checkbox label="Sync fails" checked={settings.notifications.syncFailed} onChange={(v) => setNotif("syncFailed", v)} />
            <Checkbox label="Anomaly detected" checked={settings.notifications.anomaly} onChange={(v) => setNotif("anomaly", v)} />
            <Checkbox label="Credentials expiring" checked={settings.notifications.credExpiring} onChange={(v) => setNotif("credExpiring", v)} />
            <Checkbox label="Store disconnected" checked={settings.notifications.disconnected} onChange={(v) => setNotif("disconnected", v)} />
          </BlockStack>
        </Card>

        {/* Schedule */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Sync schedule</Text>
            <RadioButton
              label="Real-time (sync as changes happen)"
              checked={settings.schedule === "realtime"}
              id="realtime"
              name="schedule"
              onChange={() => setSettings((s) => ({ ...s, schedule: "realtime" }))}
            />
            <RadioButton
              label="Off-peak window only"
              checked={settings.schedule === "offpeak"}
              id="offpeak"
              name="schedule"
              onChange={() => setSettings((s) => ({ ...s, schedule: "offpeak" }))}
            />
            {settings.schedule === "offpeak" ? (
              <InlineStack gap="300">
                <Box minWidth="140px">
                  <TextField label="Start" type="time" autoComplete="off" value={settings.offPeakStart} onChange={(v) => setSettings((s) => ({ ...s, offPeakStart: v }))} />
                </Box>
                <Box minWidth="140px">
                  <TextField label="End" type="time" autoComplete="off" value={settings.offPeakEnd} onChange={(v) => setSettings((s) => ({ ...s, offPeakEnd: v }))} />
                </Box>
              </InlineStack>
            ) : null}
          </BlockStack>
        </Card>

        <InlineStack align="end">
          <Button
            variant="primary"
            loading={settingsFetcher.state !== "idle"}
            onClick={() => settingsFetcher.submit({ intent: "saveSettings", settings: JSON.stringify(settings) }, { method: "post" })}
          >
            Save settings
          </Button>
        </InlineStack>

        {/* Danger zone */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd" tone="critical">Danger zone</Text>
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" tone="subdued">Disconnect all stores (data is preserved).</Text>
              <Button tone="critical" variant="secondary" onClick={() => setConfirm("disconnectAll")}>Disconnect all</Button>
            </InlineStack>
            <Divider />
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" tone="subdued">Clear all SyncMaster sync data (jobs, events, snapshots, logs). Store data is never touched.</Text>
              <Button tone="critical" variant="secondary" onClick={() => setConfirm("clearData")}>Clear sync data</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>

      {/* Confirmation modal (design rule 7) */}
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "clearData" ? "Clear all sync data?" : "Disconnect all stores?"}
        primaryAction={{
          content: confirm === "clearData" ? "Clear data" : "Disconnect all",
          destructive: true,
          loading: dangerFetcher.state !== "idle",
          onAction: () => dangerFetcher.submit({ intent: confirm ?? "" }, { method: "post" }),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setConfirm(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            {confirm === "clearData"
              ? "This permanently deletes SyncMaster's sync jobs, events, snapshots, and activity logs. Your Shopify store data is not affected. This cannot be undone."
              : "This disconnects every connected store. No data is deleted — you can reconnect later."}
          </Text>
        </Modal.Section>
      </Modal>
    </AppLayout>
  );
}
