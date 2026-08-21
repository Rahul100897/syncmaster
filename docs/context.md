# SyncMaster — Master Context Document

## What we are building
A Shopify embedded app called SyncMaster that lets merchants
sync products, inventory, collections, metafields, metaobjects,
orders, and content between multiple Shopify stores in real-time.

Unique angle: the ONLY sync app with snapshot + rollback,
anomaly detection, and full metaobject sync.
Marketing message: "The only Shopify sync app that won't 
destroy your store data."

## Key differentiators vs competitors
1. Safe Sync dry-run — preview all changes before writing
2. Snapshot + one-click rollback — revert any sync instantly
3. Pre-sync conflict scanner — finds handle/SKU mismatches first
4. Anomaly detection — flags suspicious inventory changes
5. Unlimited metafield sync — competitors cap at 50
6. Metaobject sync — no competitor has this at all
7. Field-level sync control — choose what syncs to which store
8. Sync health monitor — proactive alerts not reactive support
9. Cross-store analytics — unified revenue dashboard
10. One subscription covers all stores — no double billing

## How store connection works
- Merchant installs SyncMaster on Store A (primary) — pays here
- Merchant installs SyncMaster on Store B (secondary) — free agent
- Store A generates a 6-digit link code
- Store B enters the code → connected in under 60 seconds
- Billing only happens on primary store

## Competitors we beat
- Multi-Store Sync Power (EGNITION) — no rollback, no metaobjects
- Syncio — caps metafields at 50, 60min lag, complex billing
- Tipo — no metafields at all, no price rules
- Easify — no rollback, no anomaly detection, no metaobjects

## Tech stack
Remix + TypeScript, Shopify Polaris, PostgreSQL + Prisma,
BullMQ + Redis, Cloudflare R2, Railway hosting,
Shopify GraphQL Admin API 2025-07

## Pricing
Free: 2 stores, 25 products, migration only
Pro ($29/mo): up to 5 stores, unlimited, all features
One billing charge on primary store covers all connected stores.
