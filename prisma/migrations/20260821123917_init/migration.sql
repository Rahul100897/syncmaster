-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConnection" (
    "id" TEXT NOT NULL,
    "primaryShopId" TEXT NOT NULL,
    "secondaryShopId" TEXT,
    "linkCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRule" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'primary_to_secondary',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priceMarkup" DOUBLE PRECISION,
    "bufferPercent" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "successItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreConnection_linkCode_key" ON "StoreConnection"("linkCode");

-- CreateIndex
CREATE INDEX "StoreConnection_primaryShopId_idx" ON "StoreConnection"("primaryShopId");

-- CreateIndex
CREATE INDEX "StoreConnection_secondaryShopId_idx" ON "StoreConnection"("secondaryShopId");

-- CreateIndex
CREATE INDEX "SyncRule_connectionId_idx" ON "SyncRule"("connectionId");

-- CreateIndex
CREATE INDEX "SyncJob_connectionId_idx" ON "SyncJob"("connectionId");

-- CreateIndex
CREATE INDEX "SyncJob_status_idx" ON "SyncJob"("status");

-- CreateIndex
CREATE INDEX "SyncEvent_jobId_idx" ON "SyncEvent"("jobId");

-- CreateIndex
CREATE INDEX "SyncEvent_status_idx" ON "SyncEvent"("status");

-- CreateIndex
CREATE INDEX "Snapshot_connectionId_idx" ON "Snapshot"("connectionId");

-- CreateIndex
CREATE INDEX "ActivityLog_shopId_idx" ON "ActivityLog"("shopId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- AddForeignKey
ALTER TABLE "SyncRule" ADD CONSTRAINT "SyncRule_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SyncJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
