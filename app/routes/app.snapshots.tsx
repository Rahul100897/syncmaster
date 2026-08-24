import { Suspense, useEffect, useState } from "react";
import { defer } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  useFetcher,
  useLoaderData,
  useNavigate,
  useOutletContext,
} from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Modal,
  ProgressBar,
  Text,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { formatDistanceToNow } from "date-fns";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createSnapshot, restorePreview, restoreSnapshot, type RestoreDiff } from "../lib/snapshot.server";
import { isPro } from "../lib/billing.server";
import AppLayout from "../components/AppLayout";
import ProLock from "../components/ProLock";
import { SkeletonBlock, SkeletonTable } from "../components/Skeleton";
import type { AppOutletContext } from "./app";

async function connectionFor(shop: string) {
  return prisma.storeConnection.findFirst({
    where: { status: "connected", OR: [{ primaryShopId: shop }, { secondaryShopId: shop }] },
    orderBy: { connectedAt: "desc" },
  });
}

interface SnapshotItem {
  id: string;
  status: string;
  itemCount: number;
  sizeBytes: number;
  hasFile: boolean;
  createdAt: string;
  expiresAt: string;
}

type SnapshotsData =
  | { locked: true; connected: false; snapshots: SnapshotItem[] }
  | { locked: false; connected: boolean; snapshots: SnapshotItem[] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const data: Promise<SnapshotsData> = (async () => {
    const pro = await isPro(session.shop);
    if (!pro) return { locked: true as const, connected: false as const, snapshots: [] };
    const connection = await connectionFor(session.shop);
    const snapshots = connection
      ? await prisma.snapshot.findMany({
          where: { connectionId: connection.id },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];
    const now = Date.now();
    return {
      locked: false as const,
      connected: Boolean(connection),
      snapshots: snapshots.map((s) => ({
        id: s.id,
        status: s.expiresAt.getTime() < now ? "expired" : s.status,
        itemCount: s.itemCount,
        sizeBytes: s.sizeBytes,
        hasFile: Boolean(s.fileUrl || s.data),
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    };
  })();

  return defer({ data });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const connection = await connectionFor(session.shop);
  if (!connection) return { ok: false as const, error: "No connected store pair." };
  if (!(await isPro(session.shop)))
    return { ok: false as const, error: "Backups are a Pro feature — upgrade to continue." };

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "create") {
      const snap = await createSnapshot(connection.id);
      return { ok: true as const, intent, message: `Backup created (${snap.itemCount} items).` };
    }
    if (intent === "preview") {
      const diff = await restorePreview(String(form.get("snapshotId")));
      return { ok: true as const, intent, diff };
    }
    if (intent === "restore") {
      await restoreSnapshot(String(form.get("snapshotId")));
      return { ok: true as const, intent, message: "Restore complete." };
    }
  } catch (error) {
    // Surface the ACTUAL error (design rule 9).
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
  return { ok: false as const, error: "Unknown action." };
};

function humanSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "ready":
      return <Badge tone="success">Ready</Badge>;
    case "failed":
      return <Badge tone="critical">Failed</Badge>;
    case "expired":
      return <Badge>Expired</Badge>;
    default:
      return <Badge tone="attention">Pending</Badge>;
  }
}


function SnapshotsBody({
  data,
  shop,
  plan,
}: {
  data: SnapshotsData;
  shop: string;
  plan: "free" | "pro";
}) {
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const createFetcher = useFetcher<typeof action>();
  const previewFetcher = useFetcher<typeof action>();
  const restoreFetcher = useFetcher<typeof action>();

  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const creating = createFetcher.state !== "idle";
  const restoring = restoreFetcher.state !== "idle";

  // Download inside the embedded iframe: App Bridge patches window.fetch to add
  // the session token, so this stays authenticated (no new-tab login screen).
  const downloadSnapshot = async (id: string) => {
    setDownloadingId(id);
    try {
      const res = await fetch(`/app/snapshots/${id}/download`);
      if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `snapshot-${id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      shopify.toast.show("Backup downloaded");
    } catch (e) {
      shopify.toast.show(e instanceof Error ? e.message : "Download failed", {
        isError: true,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  // Toast on create/restore results.
  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data) {
      const d = createFetcher.data;
      if (d.ok && "message" in d) shopify.toast.show(d.message);
      else if (!d.ok) shopify.toast.show(d.error, { isError: true });
    }
  }, [createFetcher.state, createFetcher.data, shopify]);

  useEffect(() => {
    if (restoreFetcher.state === "idle" && restoreFetcher.data) {
      const d = restoreFetcher.data;
      if (d.ok && "message" in d) {
        shopify.toast.show(d.message);
        setRestoreId(null);
      } else if (!d.ok) shopify.toast.show(d.error, { isError: true });
    }
  }, [restoreFetcher.state, restoreFetcher.data, shopify]);

  // Simulated progress bar while the (blocking) restore runs.
  useEffect(() => {
    if (!restoring) {
      setProgress(0);
      return;
    }
    const id = setInterval(() => setProgress((p) => Math.min(p + 7, 92)), 400);
    return () => clearInterval(id);
  }, [restoring]);

  const openRestore = (id: string) => {
    setRestoreId(id);
    previewFetcher.submit({ intent: "preview", snapshotId: id }, { method: "post" });
  };

  const diff: RestoreDiff | null =
    previewFetcher.data?.ok && "diff" in previewFetcher.data ? previewFetcher.data.diff : null;

  if (data.locked) {
    return (
      <BlockStack gap="500">
        <Text as="h1" variant="headingXl" fontWeight="bold">Backups</Text>
        <ProLock feature="Backups & restore" />
      </BlockStack>
    );
  }

  const { connected, snapshots } = data;

  return (
    <>
      <BlockStack gap="500">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl" fontWeight="bold">
              Backups
            </Text>
            <Text as="p" tone="subdued">
              Backups of both stores. Restore any backup in one click.
            </Text>
          </BlockStack>
          <createFetcher.Form method="post">
            <input type="hidden" name="intent" value="create" />
            <Button variant="primary" submit loading={creating} disabled={!connected}>
              Create backup now
            </Button>
          </createFetcher.Form>
        </InlineStack>

        <Card padding="0">
          {snapshots.length === 0 ? (
            <Box padding="800">
              <BlockStack gap="400" inlineAlign="center">
                <svg width="120" height="90" viewBox="0 0 120 90" fill="none" aria-hidden="true">
                  <rect x="20" y="14" width="80" height="56" rx="8" fill="#EEF2FF" />
                  <rect x="30" y="26" width="60" height="7" rx="3" fill="#C7D2FE" />
                  <rect x="30" y="40" width="44" height="6" rx="3" fill="#DBE1FF" />
                  <circle cx="90" cy="62" r="14" fill="#6366F1" />
                  <path d="M90 56v12M84 62h12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <BlockStack gap="100" inlineAlign="center">
                  <Text as="h3" variant="headingMd">
                    No backups yet
                  </Text>
                  <Text as="p" tone="subdued" alignment="center">
                    {connected
                      ? "Create a backup of both stores before you sync."
                      : "Connect your stores first, then create your first backup."}
                  </Text>
                </BlockStack>
                {!connected ? (
                  <Button variant="primary" onClick={() => navigate("/app/connect")}>
                    Connect stores
                  </Button>
                ) : null}
              </BlockStack>
            </Box>
          ) : (
            <BlockStack>
              <Box padding="300" paddingInlineStart="400" paddingInlineEnd="400" background="bg-surface-secondary">
                <InlineStack gap="400" wrap={false}>
                  <Box minWidth="180px"><Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">Date</Text></Box>
                  <Box minWidth="80px"><Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">Items</Text></Box>
                  <Box minWidth="80px"><Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">Size</Text></Box>
                  <Box minWidth="90px"><Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">Status</Text></Box>
                </InlineStack>
              </Box>
              <Divider />
              {snapshots.map((s, i) => (
                <div key={s.id} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F8F9FF" }}>
                  <Box padding="300" paddingInlineStart="400" paddingInlineEnd="400">
                    <InlineStack gap="400" blockAlign="center" wrap={false}>
                      <Box minWidth="180px">
                        <Text as="span" variant="bodyMd">
                          {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                        </Text>
                      </Box>
                      <Box minWidth="80px"><Text as="span" variant="bodyMd">{s.itemCount}</Text></Box>
                      <Box minWidth="80px"><Text as="span" variant="bodyMd">{humanSize(s.sizeBytes)}</Text></Box>
                      <Box minWidth="90px"><StatusBadge status={s.status} /></Box>
                      <InlineStack gap="200" align="end" blockAlign="center">
                        <Button
                          variant="plain"
                          onClick={() => downloadSnapshot(s.id)}
                          loading={downloadingId === s.id}
                          disabled={!s.hasFile || s.status === "expired"}
                        >
                          Download
                        </Button>
                        <Button
                          onClick={() => openRestore(s.id)}
                          disabled={!s.hasFile || s.status === "expired"}
                        >
                          Restore
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </Box>
                </div>
              ))}
            </BlockStack>
          )}
        </Card>
      </BlockStack>

      {/* Restore confirmation modal with diff preview (design rule 7). */}
      <Modal
        open={restoreId !== null}
        onClose={() => (restoring ? undefined : setRestoreId(null))}
        title="Restore this backup"
        primaryAction={{
          content: "Restore now",
          destructive: true,
          loading: restoring,
          disabled: previewFetcher.state !== "idle",
          onAction: () =>
            restoreId &&
            restoreFetcher.submit({ intent: "restore", snapshotId: restoreId }, { method: "post" }),
        }}
        secondaryActions={[{ content: "Cancel", disabled: restoring, onAction: () => setRestoreId(null) }]}
      >
        <Modal.Section>
          {previewFetcher.state !== "idle" ? (
            <Text as="p" tone="subdued">
              Calculating what will change…
            </Text>
          ) : diff ? (
            <BlockStack gap="300">
              <Text as="p">
                This will write <b>{diff.toRestore}</b> product(s) and{" "}
                <b>{diff.inventoryLevels}</b> inventory level(s) back onto the
                second store from this backup.
              </Text>
              <BlockStack gap="100">
                <Text as="p" tone="subdued">
                  • {diff.changedSince} item(s) changed since the backup — will be reverted
                </Text>
                <Text as="p" tone="subdued">
                  • {diff.unchanged} item(s) unchanged — will be skipped
                </Text>
              </BlockStack>
              <Text as="p" tone="caution">
                SyncMaster never deletes — items are only created or updated. This
                cannot be undone except by restoring another backup.
              </Text>
              {restoring ? <ProgressBar progress={progress} tone="primary" size="small" /> : null}
            </BlockStack>
          ) : previewFetcher.data && !previewFetcher.data.ok ? (
            <Text as="p" tone="critical">
              {previewFetcher.data.error}
            </Text>
          ) : null}
        </Modal.Section>
      </Modal>
    </>
  );
}

function SnapshotsSkeleton() {
  return (
    <BlockStack gap="500">
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <SkeletonBlock width={160} height={24} />
          <SkeletonBlock width={400} height={14} />
        </BlockStack>
        <SkeletonBlock width={170} height={40} radius={8} />
      </InlineStack>
      <SkeletonTable rows={5} columns={5} />
    </BlockStack>
  );
}

export default function Snapshots() {
  const { data } = useLoaderData<typeof loader>();
  const { shop, plan } = useOutletContext<AppOutletContext>();
  return (
    <AppLayout shop={shop} plan={plan}>
      <Suspense fallback={<SnapshotsSkeleton />}>
        <Await resolve={data}>
          {(resolved) => <SnapshotsBody data={resolved} shop={shop} plan={plan} />}
        </Await>
      </Suspense>
    </AppLayout>
  );
}
