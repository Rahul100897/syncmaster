# SyncMaster — CLAUDE.md
# Claude Code reads this automatically every session.
# Follow every rule here before writing a single line of code.

## MANDATORY FIRST STEPS — do these before anything else
1. Run `git status` and `git log --oneline -5`
2. Run `ls app/routes/` — see what route files exist
3. Run `cat package.json` — check installed packages before adding new ones
4. Run `npx tsc --noEmit 2>&1 | head -30` — check for existing TypeScript errors
5. Only THEN start the task

Never skip these 4 checks. Never assume the file structure.
Always read before you write.

---

## PROJECT IDENTITY
- App: SyncMaster
- Purpose: Shopify-to-Shopify multi-store product and inventory sync
- Tagline: "Connect stores in 60 seconds. Undo anything in one click."
- Embedded app: lives inside Shopify Admin — NO external dashboard
- Two plans only: Free and Pro ($29/mo)
- Billing: one subscription on primary store covers ALL connected stores
- GitHub: https://github.com/Rahul100897/syncmaster

## PLANS
Free:
- Connect 2 stores
- Up to 25 products
- Migration mode only (one-time copy, then disconnect)
- Safe Sync dry-run preview
- Pre-sync conflict scanner

Pro ($29/mo, 7-day trial, covers ALL connected stores):
- Up to 5 stores
- Unlimited products
- Real-time ongoing sync (webhook-triggered)
- Full product, inventory, collection, blog, page, order sync
- Metafield sync (unlimited — competitors cap at 50)
- Metaobject sync (unique — no competitor has this)
- Safe Sync dry-run preview
- Snapshot + one-click rollback
- Anomaly detection on inventory changes
- Pre-sync conflict scanner
- Field-level sync control per store
- Advanced price rules per store
- Inventory buffer rules
- Selective sync by tag/collection/vendor
- Two-way sync with configurable source of truth
- Multi-location inventory sync
- Order + fulfilment sync
- Blog + page sync
- Sync health monitor + email alerts
- Cross-store analytics dashboard
- Full sync audit log
- Revenue sharing / payout splits
- Scheduled sync window

---

## TECH STACK — never change these
- Framework: Remix (Shopify CLI scaffold)
- Language: TypeScript — strict mode, no `any` types ever
- UI: Shopify Polaris ONLY — no Tailwind, no custom CSS frameworks
- ORM: Prisma with PostgreSQL
- Queue: BullMQ + Redis (for all async jobs)
- Storage: Cloudflare R2 (for snapshots, exports, logs)
- API: Shopify GraphQL Admin API ONLY — no REST ever
- Auth: @shopify/shopify-app-remix
- Hosting: Railway
- Node version: 18+

---

## DESIGN RULES — apply to every UI component
1. App is EMBEDDED inside Shopify Admin — use App Bridge, not external pages
2. Sidebar: navy #0A0F1E background, accent color #6366F1 indigo
3. Active nav item: #6366F1 left border (3px) + light indigo background
4. Tables: alternating rows #FFFFFF / #F8F9FF, hover row #EEF2FF, sticky header
5. Skeleton loaders while data loads — never a bare spinner alone
6. Toast notification for every action result (success/error/warning)
7. Confirmation modal for EVERY destructive action — no exceptions
8. Empty states: inline SVG illustration + helpful message + action button
9. Error states: show the ACTUAL error message — never "Something went wrong"
10. Loading states on all buttons during async operations

---

## FILE STRUCTURE — always write to correct location

---

## DATABASE SCHEMA (Prisma models needed)
- Session — Shopify OAuth (auto-managed)
- StoreConnection { id, primaryShopId, secondaryShopId, linkCode, status, connectedAt, plan }
- SyncRule { id, connectionId, field, direction, enabled, priceRule, bufferPercent }
- SyncJob { id, connectionId, type, status, totalItems, successItems, failedItems, triggeredBy, startedAt, completedAt }
- SyncEvent { id, jobId, resourceType, resourceId, field, oldValue, newValue, status, error, createdAt }
- Snapshot { id, connectionId, data, createdAt, expiresAt }
- ActivityLog { id, shopId, action, resourceType, itemCount, createdAt }

---

## SHOPIFY API RULES — follow exactly
- API version: always 2025-07
- GraphQL ONLY — never REST
- metafieldsSet: max 25 per request — always batch
- bulkOperationRunQuery: use for any export > 100 records
- Webhooks: always verify HMAC before processing
- Rate limits: exponential backoff on all mutations
- Required scopes: read_products, write_products, read_inventory,
  write_inventory, read_metafields, write_metafields,
  read_metaobjects, write_metaobjects, read_orders, write_orders,
  read_publications, write_publications

---

## SYNCMASTER-SPECIFIC RULES — critical
- NEVER write to destination store without dry-run check first
- ALWAYS take a snapshot before any bulk sync operation
- Anomaly rule: if inventory change is > 10x current value → pause + alert
- Source of truth: always respect SyncRule.direction per field
- Store connection: validate both stores connected before any sync
- NEVER delete data on destination store — only create or update
- Log EVERY sync event to SyncEvent table regardless of success or failure
- Free plan: block real-time sync, show upgrade modal
- Secondary store install: free agent, no billing on secondary store

---

## ERROR HANDLING RULES
- Never use empty catch blocks — always log with context
- Always log: which store, which product, which field, what error
- User-facing errors: show actual Shopify API error message
- Failed sync jobs: mark as failed in DB, log reason, send alert
- TypeScript: fix all errors immediately — never use @ts-ignore
- Build: must pass before committing — never push broken build

---

## DEBUGGING PROTOCOL — when something breaks
1. Read the FULL error — do not guess
2. Run `npx tsc --noEmit` — TypeScript errors first
3. Run `cat [file with error]` — read the actual file
4. Run `grep -r "[missing import]" app/` — check if import exists
5. Make a TARGETED fix — change only the broken lines
6. Run `npm run build` — confirm it passes
7. Commit: "fix: [what broke and why]"

Never rewrite a whole file to fix one error.
Never add packages without checking if existing ones cover the need.

---

## GIT RULES
- Repo: https://github.com/Rahul100897/syncmaster
- main = production, feature/* = active work
- Commit after every working feature
- Format: "feat: [what]" / "fix: [what]" / "refactor: [what]"
- Never commit: .env, node_modules, .shopify
- Always run `npm run build` before merging to main
- Push to GitHub after every phase completes

---

## WHAT TO DO WHEN STUCK
1. Read the full error message
2. Check Shopify API docs for the exact mutation/query
3. Check existing working code in the repo for the same pattern
4. Try the fix on one case first — not a bulk change
5. After 3 failed attempts: stop and report exactly what you tried
Never silently change approach. Never delete working code to fix something else.
