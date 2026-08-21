# Phase 3 — Snapshot + Rollback + Sync Rules + Analytics

## Goal
Build snapshot + rollback system, full sync rules configuration
per store, and the cross-store analytics dashboard.

## Tasks in order

### Task 1 — Snapshot system
In app/lib/snapshot.server.ts:
- createSnapshot(connectionId): Promise<Snapshot>
  * Fetch all products + inventory from both stores
  * Serialize to JSON, upload to R2
  * Store Snapshot record with fileUrl and expiry (30 days)
- Create app/jobs/createSnapshot.job.ts: BullMQ worker
- Auto-snapshot before every bulk sync operation

### Task 2 — Snapshot page
Create app/routes/app.snapshots.tsx:
- List: Date | Items | Size | Status | Actions
- "Create snapshot now" button
- Each row: Download + Restore buttons
- Empty state with SVG illustration

### Task 3 — Restore from snapshot
- Restore button opens diff preview:
  * Will restore X products, Y inventory levels
  * Items changed since snapshot (will be reverted)
  * Items unchanged (will be skipped)
- Confirmation modal with consequence text
- Execute restore: write back all values from snapshot
- Never delete — only restore/update existing records
- Progress bar during restore execution

### Task 4 — Sync rules page
Create app/routes/app.rules.tsx:
- Per-store sync rule configuration
- For each field: toggle (sync on/off) + direction (one-way/two-way)
- Fields: Title, Description, Images, Price, Compare-at Price,
  Inventory, Tags, Vendor, Type, Metafields, Metaobjects,
  Collections, SEO Title, SEO Description
- Price rule section: markup %, fixed override, rounding rule
- Buffer rule: inventory buffer % per destination store
- Selective sync: include/exclude by tag, collection, vendor
- Save rules to SyncRule table in DB

### Task 5 — Metafield + metaobject sync
In app/lib/sync.server.ts:
- syncMetafields(sourceShop, destShop, productId): Promise<void>
  * Fetch ALL metafields (no 50-item limit like competitors)
  * Batch in groups of 25 via metafieldsSet
  * Respect SyncRule for metafield sync toggle
- syncMetaobjects(sourceShop, destShop, type): Promise<void>
  * Fetch all metaobject entries
  * Create/update on destination store
  * Unique feature — no competitor does this

### Task 6 — Sync health monitor
Create app/routes/app.health.tsx:
- Real-time status per store connection:
  * Last successful sync (time ago)
  * Last failed sync with error message
  * Sync success rate last 7 days %
  * API credential status (valid/expiring/expired)
- Email alert when: sync fails 3x in a row, credentials
  expiring, anomaly detected, store disconnected
- Weekly health report summary card

### Task 7 — Cross-store analytics dashboard
Create app/routes/app.analytics.tsx:
- Unified view across all connected stores:
  * Total revenue all stores combined
  * Orders per store bar chart
  * Top 10 products by revenue across all stores
  * Stock levels comparison per store
  * Which store sells most of each product
- Date range filter: 7d / 30d / 90d / custom
- Export to CSV button

### Task 8 — Revenue sharing / payout splits
Create app/routes/app.payouts.tsx:
- For each order containing synced products:
  * Show which store sold it
  * Calculate split based on configured % per store
- Export payout report to CSV per date range

## Verification checklist
- Snapshot creates and uploads to R2 successfully
- Restore reverts data correctly (additive only, never deletes)
- Sync rules save and apply to all sync operations
- Metafield sync has no 50-item limit
- Metaobject sync works (unique feature)
- Health monitor shows real sync status
- Analytics shows cross-store revenue
- npx tsc --noEmit passes
- npm run build passes
- Committed and pushed to feature/phase-3-rules branch
