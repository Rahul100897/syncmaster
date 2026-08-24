/**
 * Sync health monitor (Phase 3).
 * Computes per-connection health + alert conditions from job/event history and
 * session credential expiry. Alerts are surfaced in the UI; email delivery is
 * wired in Phase 4.
 */
import prisma from "../db.server";

export type CredentialStatus = "valid" | "expiring" | "expired" | "unknown";

export interface ConnectionHealth {
  connectionId: string;
  primaryShop: string;
  secondaryShop: string | null;
  status: string;
  lastSuccessAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  successRate7d: number;
  jobs7d: number;
  credentialPrimary: CredentialStatus;
  credentialSecondary: CredentialStatus;
  alerts: string[];
}

export interface WeeklySummary {
  jobs: number;
  completed: number;
  failed: number;
  anomalies: number;
  snapshots: number;
  successRate: number;
}

export interface HealthReport {
  connections: ConnectionHealth[];
  weekly: WeeklySummary;
}

const DAY = 24 * 60 * 60 * 1000;

async function credentialStatus(shop: string | null): Promise<CredentialStatus> {
  if (!shop) return "unknown";
  const session = await prisma.session.findFirst({ where: { shop } });
  if (!session) return "expired"; // no token stored → app not installed / uninstalled
  if (!session.expires) return "valid"; // offline tokens generally don't expire
  const ms = session.expires.getTime() - Date.now();
  if (ms <= 0) return "expired";
  if (ms < 3 * DAY) return "expiring";
  return "valid";
}

export async function getHealth(shop: string): Promise<HealthReport> {
  const since = new Date(Date.now() - 7 * DAY);
  const connections = await prisma.storeConnection.findMany({
    where: { OR: [{ primaryShopId: shop }, { secondaryShopId: shop }] },
    orderBy: { createdAt: "desc" },
  });

  const health: ConnectionHealth[] = [];
  for (const c of connections) {
    const [lastSuccess, lastFailedJob, jobs7d, completed7d, recentJobs, anomalies7d] =
      await Promise.all([
        prisma.syncJob.findFirst({
          where: { connectionId: c.id, status: "completed" },
          orderBy: { completedAt: "desc" },
        }),
        prisma.syncJob.findFirst({
          where: { connectionId: c.id, status: "failed" },
          orderBy: { completedAt: "desc" },
        }),
        prisma.syncJob.count({ where: { connectionId: c.id, startedAt: { gte: since } } }),
        prisma.syncJob.count({
          where: { connectionId: c.id, status: "completed", startedAt: { gte: since } },
        }),
        prisma.syncJob.findMany({
          where: { connectionId: c.id },
          orderBy: { startedAt: "desc" },
          take: 3,
          select: { status: true },
        }),
        prisma.syncEvent.count({
          where: { status: "anomaly", createdAt: { gte: since }, job: { connectionId: c.id } },
        }),
      ]);

    let lastError: string | null = null;
    if (lastFailedJob) {
      const errEvent = await prisma.syncEvent.findFirst({
        where: { jobId: lastFailedJob.id, status: "failed" },
        orderBy: { createdAt: "desc" },
      });
      lastError = errEvent?.error ?? null;
    }

    const [credentialPrimary, credentialSecondary] = await Promise.all([
      credentialStatus(c.primaryShopId),
      credentialStatus(c.secondaryShopId),
    ]);

    const alerts: string[] = [];
    if (recentJobs.length === 3 && recentJobs.every((j) => j.status === "failed"))
      alerts.push("Sync has failed 3 times in a row.");
    if (credentialPrimary === "expiring" || credentialSecondary === "expiring")
      alerts.push("Your store connection is expiring soon — reconnect to keep syncing.");
    if (credentialPrimary === "expired" || credentialSecondary === "expired")
      alerts.push("Your store connection has expired — reconnect to keep syncing.");
    if (anomalies7d > 0) alerts.push(`${anomalies7d} change(s) flagged for review this week.`);
    if (c.status !== "connected") alerts.push("Your stores aren't fully connected.");

    health.push({
      connectionId: c.id,
      primaryShop: c.primaryShopId,
      secondaryShop: c.secondaryShopId,
      status: c.status,
      lastSuccessAt: lastSuccess?.completedAt?.toISOString() ?? null,
      lastFailedAt: lastFailedJob?.completedAt?.toISOString() ?? null,
      lastError,
      successRate7d: jobs7d === 0 ? 100 : Math.round((completed7d / jobs7d) * 100),
      jobs7d,
      credentialPrimary,
      credentialSecondary,
      alerts,
    });
  }

  const connectionIds = connections.map((c) => c.id);
  const [jobs, completed, failed, anomalies, snapshots] = await Promise.all([
    prisma.syncJob.count({ where: { connectionId: { in: connectionIds }, startedAt: { gte: since } } }),
    prisma.syncJob.count({
      where: { connectionId: { in: connectionIds }, status: "completed", startedAt: { gte: since } },
    }),
    prisma.syncJob.count({
      where: { connectionId: { in: connectionIds }, status: "failed", startedAt: { gte: since } },
    }),
    prisma.syncEvent.count({
      where: { status: "anomaly", createdAt: { gte: since }, job: { connectionId: { in: connectionIds } } },
    }),
    prisma.snapshot.count({ where: { connectionId: { in: connectionIds }, createdAt: { gte: since } } }),
  ]);

  return {
    connections: health,
    weekly: {
      jobs,
      completed,
      failed,
      anomalies,
      snapshots,
      successRate: jobs === 0 ? 100 : Math.round((completed / jobs) * 100),
    },
  };
}
