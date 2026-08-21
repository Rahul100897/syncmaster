# Phase 1 — Foundation

## Goal
Scaffold the Shopify app, set up all infrastructure,
create database schema, build the custom sidebar UI shell,
and get the app running on a dev store.

## Tasks in order

### Task 1 — Shopify CLI scaffold
Run: shopify app create --name syncmaster
Choose: Node.js, Remix, TypeScript
After scaffold install additional packages:
  prisma @prisma/client
  bullmq ioredis
  @aws-sdk/client-s3
  date-fns

### Task 2 — Prisma schema
Create prisma/schema.prisma with these models:
- Session (keep Shopify default)
- StoreConnection { id String @id @default(cuid()), primaryShopId String, secondaryShopId String?, linkCode String @unique, status String @default("pending"), plan String @default("free"), connectedAt DateTime?, createdAt DateTime @default(now()) }
- SyncRule { id String @id @default(cuid()), connectionId String, connection StoreConnection @relation(fields:[connectionId], references:[id]), field String, direction String @default("primary_to_secondary"), enabled Boolean @default(true), priceMarkup Float?, bufferPercent Int?, createdAt DateTime @default(now()) }
- SyncJob { id String @id @default(cuid()), connectionId String, connection StoreConnection @relation(fields:[connectionId], references:[id]), type String, status String @default("pending"), totalItems Int @default(0), successItems Int @default(0), failedItems Int @default(0), triggeredBy String, startedAt DateTime @default(now()), completedAt DateTime? }
- SyncEvent { id String @id @default(cuid()), jobId String, job SyncJob @relation(fields:[jobId], references:[id]), resourceType String, resourceId String, field String?, oldValue String?, newValue String?, status String, error String?, createdAt DateTime @default(now()) }
- Snapshot { id String @id @default(cuid()), connectionId String, connection StoreConnection @relation(fields:[connectionId], references:[id]), fileUrl String, itemCount Int, createdAt DateTime @default(now()), expiresAt DateTime }
- ActivityLog { id String @id @default(cuid()), shopId String, action String, resourceType String, itemCount Int @default(0), createdAt DateTime @default(now()) }

Run: npx prisma migrate dev --name init

### Task 3 — Environment setup
Create .env.example with:
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SCOPES=read_products,write_products,read_inventory,write_inventory,read_metafields,write_metafields,read_metaobjects,write_metaobjects,read_orders,write_orders
HOST=
DATABASE_URL=
REDIS_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
SESSION_SECRET=

### Task 4 — Server utilities
Create these typed placeholder files:
- app/lib/shopify.server.ts
- app/lib/queue.server.ts — BullMQ queues (syncQueue, snapshotQueue)
- app/lib/r2.server.ts — upload() and getSignedUrl() functions
- app/lib/billing.server.ts — isPro(shopId): Promise<boolean>
- app/lib/sync.server.ts — placeholder for sync logic
- app/lib/snapshot.server.ts — placeholder for snapshot logic
- app/lib/conflict.server.ts — placeholder for conflict scanner
- app/lib/anomaly.server.ts — placeholder for anomaly detection
- app/lib/webhook.server.ts — verifyWebhook(request): Promise<boolean>

### Task 5 — GDPR webhooks
Create:
- app/routes/webhooks.customers.redact.tsx → return 200
- app/routes/webhooks.shop.redact.tsx → return 200
- app/routes/webhooks.customers.data_request.tsx → return 200

### Task 6 — Custom sidebar layout
Create app/components/AppLayout.tsx:
- Left sidebar 240px, background #0A0F1E
- Top: SyncMaster logo (S icon in indigo square + white text)
- Below logo: plan badge (FREE or PRO pill)
- Nav links: Dashboard, Connect Stores, Sync Rules,
  Jobs, Snapshots, Analytics, Activity Log, Settings
- Active link: 3px #6366F1 left border + light indigo background
- Inactive: white text 70% opacity
- Bottom: shop domain + avatar circle with initials
- Content area: white background, padding 32px

### Task 7 — Dashboard home page
Create app/routes/app._index.tsx:
- 4 metric cards: Connected Stores, Products Synced,
  Jobs Today, Last Snapshot
- Cards: colored top border, icon right, large bold value
- Recent Activity table (last 10 ActivityLog entries)
- Right panel: Quick Actions + Your Plan with upgrade CTA
- Empty state: SVG illustration + message

### Task 8 — Connect Stores page (UI skeleton only)
Create app/routes/app.connect.tsx:
- Two panels: Generate Link Code (primary) and
  Enter Link Code (secondary)
- UI only — no functionality yet

### Task 9 — GitHub push
git add .
git commit -m "feat: Phase 1 — Foundation scaffold with sidebar and dashboard"
git push origin main

## Verification checklist
- npx tsc --noEmit passes
- npm run build passes
- App loads via shopify app dev
- All nav items visible in sidebar
- Dashboard shows 4 metric cards
- GDPR webhooks return 200
- Pushed to GitHub main
