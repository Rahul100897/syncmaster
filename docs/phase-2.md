# Phase 2 — Store Connection + Core Sync Engine

## Goal
Build the store connection flow (link code generation + entry),
implement the core real-time sync engine, and build the
Safe Sync dry-run + conflict scanner features.

## Tasks in order

### Task 1 — Link code generation (primary store)
In app/routes/app.connect.tsx:
- "Generate Code" button creates a StoreConnection record
  with a random 6-digit code and status="pending"
- Display code in large copyable UI element
- Auto-refresh every 5 seconds checking if secondary store connected
- On connection: show success state with connected store domain

### Task 2 — Link code entry (secondary store)
- Input field for 6-digit code
- On submit: find matching StoreConnection, validate it's pending,
  update with secondaryShopId and status="connected"
- Show connected state with primary store domain

### Task 3 — Pre-sync conflict scanner
In app/lib/conflict.server.ts:
- scanConflicts(primaryShop, secondaryShop): Promise<ConflictReport>
- Check: handle conflicts, duplicate SKUs, barcode mismatches,
  variant structure differences
- Return: { conflicts: [], warnings: [], safe: boolean }
- Show results in clear UI before any sync starts

### Task 4 — Safe Sync dry-run
In app/lib/sync.server.ts:
- dryRun(connectionId, options): Promise<DryRunResult>
- Fetch products from both stores
- Classify each product as:
  "will_create" | "will_update" | "will_skip" | "conflict"
- Return counts + detailed item list
- Never write anything during dry-run

### Task 5 — Dry-run UI
Create app/routes/app.sync.preview.tsx:
- Summary: X will create, Y will update, Z will skip, W conflicts
- Expandable detail table per category
- "Proceed with sync" button + "Cancel" button
- Conflicts section: show exactly what conflicts and why

### Task 6 — Real-time inventory sync (webhook-based)
In app/lib/webhook.server.ts:
- Register webhooks on both stores:
  INVENTORY_LEVELS_UPDATE, PRODUCTS_UPDATE,
  PRODUCTS_CREATE, PRODUCTS_DELETE
- On webhook: verify HMAC, check SyncRule, run anomaly check,
  push to syncQueue
- Create app/jobs/syncInventory.job.ts:
  BullMQ worker that processes inventory updates

### Task 7 — Anomaly detection
In app/lib/anomaly.server.ts:
- checkAnomaly(field, oldValue, newValue): AnomalyResult
- Rule: inventory changes > 10x current value → flag
- Rule: price changes > 50% → flag
- On anomaly: pause sync event, log it, send alert
- Show anomalies in dashboard with Approve / Reject actions

### Task 8 — Sync jobs page
Create app/routes/app.jobs.tsx:
- Table: Type | Status | Items | Triggered by | Started | Duration
- Status badges: pending / running (amber pulse) / completed /
  failed / anomaly flagged
- Auto-refresh every 10s if any job is running
- Click job to see SyncEvent details

## Verification checklist
- Two dev stores can connect via 6-digit code
- Conflict scanner runs before sync starts
- Dry-run shows preview without writing any data
- Inventory webhook triggers sync between stores
- Anomaly detection pauses suspicious changes
- npx tsc --noEmit passes
- npm run build passes
- Committed and pushed to feature/phase-2-sync branch
