# Project Context — DOUBLE A POS & Inventory System

Read this file fully before making changes. It defines the architecture, business rules,
and conventions this project must follow. If a change conflicts with something here,
flag it explicitly rather than silently deviating.

---

## What this project is

A POS and inventory system made of two apps in one Turborepo monorepo, sharing one
Supabase (Postgres) backend:

- **`apps/admin`** — Next.js web dashboard. Always-online. Used by the business owner/managers
  to manage products, prices, inventory, users, and view sales history/reports.
- **`apps/mobile`** — React Native (Expo) POS app. Used by cashiers on the shop floor.
  Designed to work fully offline, with a local SQLite database, synced to Supabase
  **manually** via a button — never automatically.

**Golden rule: Supabase is the single source of truth for everything** — products, prices,
inventory levels, sales history, users. The mobile app's local SQLite database is a
disposable working copy, not a second source of truth.

---

## Monorepo structure

```
apps/
  admin/     Next.js — online-only dashboard
  mobile/    React Native (Expo) — offline-capable POS
packages/
  supabase/         Shared Supabase client + generated DB types
  shared-types/      Shared TS interfaces (Product, Sale, SaleItem, InventoryMovement, User)
  ui/                Shared UI primitives where feasible (design tokens, cross-platform where possible)
  config-eslint/
  config-typescript/
```

**Rules for where code goes:**
- If it's a TypeScript type, a Supabase query, or a business-logic function with no
  platform dependency → belongs in `packages/`, imported by both apps.
- If it's Next.js-specific (server components, API routes, `app/` router conventions) →
  stays in `apps/admin`.
- If it's React Native/Expo-specific (native modules, `expo-sqlite`, printer integration) →
  stays in `apps/mobile`.
- Never duplicate a type or a Supabase query definition across both apps — that's what
  `packages/shared-types` and `packages/supabase` are for. Type drift between the two apps
  is the #1 risk in this project, since mobile writes the same tables admin reads.

**Package manager:** pnpm workspaces. Use `pnpm --filter <app> <command>` to run a command
scoped to one app (e.g., `pnpm --filter mobile start`).

**Known gotcha:** Metro (React Native's bundler) does not resolve monorepo packages by
default. `apps/mobile/metro.config.js` must be configured to watch the workspace root and
resolve `node_modules` from the repo root, not just its own folder.

---

## Business logic rules (do not "fix" these — they are intentional)

### 1. Sync is manual, one button, two steps, in order
The mobile app has exactly one sync action:
1. **Push** — upload pending local `customers`, then `sales`/`sale_items` where
   `sync_status = 'pending'`, then patch `is_paid` / `delivery_completed` for sales
   with `flags_pending`. If this fails, stop — do not proceed to pull.
2. **Pull** — fetch products/users/inventory from Supabase where `updated_at > last_synced_at`,
   overwrite local rows, update `last_synced_at`. Categories, customers, and store settings
   are fetched whole every pull.

There is no auto-sync on reconnect, no background pull, no real-time subscriptions on mobile —
pull only ever happens because someone pressed Sync or Refresh. The one exception: after each
sale completes, `runAutoPush()` (`sync/index.ts`) silently fires the push step alone if the
device happens to be online — best-effort, no phase/message shown, never blocking the sale or
its receipt (rule 4). No pull runs there, so it never touches `last_synced_at` or claims the
terminal is "synced" — it only shortens how long a sale sits pending. The manual Sync button
is unchanged and still the only thing that also pulls, and still the fallback for whatever
auto-push missed (offline, dropped connection mid-push).
The UI must always show a "Last synced: X ago" indicator.

Alongside it there is a second, pull-only **Refresh** action (`runPullOnly`), for taking a
price or product change mid-shift without sending sales. It skips the push step deliberately;
pending sales stay pending and still go out on the next Sync (or the next auto-push). Sync
remains the only *manual* way sales leave the device. Both live in the `SyncBar`, which sits
on the **Sync tab**, and Refresh is repeated on the unlock screen so a locked terminal can pull
catalog before the shift starts.

**Login is always live.** Admin email/password, terminal enrollment, and cashier PIN unlock
all call Supabase — never local SQLite. `verify_pin()` checks the PIN server-side. Local
SQLite exists for POS work *after* the cashier unlocks (products, cart, pending sales).

The *state* is not on a tab. `StoreHeader` is one chrome row on every POS screen: logo
(opens the account drawer), shop name, tabs, and the sync chip ("Last synced: X ago",
pending count, teal/amber/terracotta). A cashier must never have to go looking to find out
this terminal is behind. The chip navigates and does not itself sync: there is still exactly
one button that sends sales. End shift lives in the logo drawer.

A pull always finishes with `StoreHeader` and the Sync tab still mounted and focused. Writing to
SQLite is therefore only half the job: any component holding master data in state must re-read
it. `useSync()` exposes `dataVersion`, bumped after every successful pull — put it in the
dependency list beside the load function. `useFocusEffect` alone is not enough, since focus
never changes.

One exception to "only what changed since `last_synced_at`": the category tree is fetched whole
every pull and replaces the local `categories` table outright. A `updated_at >` query cannot
return a row that was deleted, so incremental pulls would leave retired categories on the device
forever. The table is a few dozen rows; correctness is worth the round trip.

### 2. Inventory is event-sourced, not directly edited
The mobile app never writes stock balances. Offline sales are recorded as individual events
(`sale_items` rows with client-generated UUIDs). Stock is **per location**
(`location_inventories.quantity`); the POS only ever sees the enrolled branch's quantity.
The **local, on-device "available stock"** shown to the cashier is a computed estimate:

```
estimated_stock = last_synced_branch_stock - sum(pending local sales for that product)
```

This is a display estimate only, not a value ever written back to the server. Actual
inventory decrements happen server-side when sale data is pushed (movement at
`sale.location_id`). Oversell (two offline devices at the same branch selling the last unit)
is an accepted, known tradeoff — handled by post-sync flagging, not prevented.

### 3. IDs are client-generated UUIDs for anything created offline
`sales` and related records generate their `id` on-device (UUID) at creation time, not via
Supabase's `gen_random_uuid()` default. This is required so offline-created records never
collide with each other or the server on sync, and so a sale is fully valid before it's ever
synced.

### 4. Nothing about completing a sale or printing a receipt should ever wait on network state
Both must work identically offline and online, with zero perceptible difference to the cashier.

### 5. Admin app has no offline mode
`apps/admin` assumes constant connectivity. Do not add offline handling, local caching, or
sync logic there — that complexity belongs only to `apps/mobile`.

### 6. Supplier cost is snapshotted on every sale line
`products.cost_price` is what the supplier charges today. Every `sale_items` row carries its
own `unit_cost`, written at the moment of sale. Reporting always reads `sale_items.unit_cost`,
never joins back to the product — a supplier raising their price must not rewrite last
quarter's profit. Cost is pulled to the POS so the attendant can see the floor before
discounting; it is never written from the device.

### 7. Counter discounts are free, logged, and reportable
An attendant may override the selling price of any cart line to any amount, including below
cost. There is no PIN gate and no hard cap. Every override is recorded as the gap between
`sale_items.list_price` (the shelf price) and `sale_items.unit_price` (what was charged), and
surfaces in the discount audit report. Selling below cost is called out as a warning on the
POS and as a flag on the report — never blocked.

### 8. Stock only ever moves through `inventory_movements`
`location_inventories.quantity` has exactly one writer: `InventoryMovementObserver` (Laravel).
CSV import, product forms, and the POS never write balances. Opening stock, restocks,
adjustments, sale decrements, voids, and transfer in/out all insert a movement row with a
`location_id`. Inter-location moves use `stock_transfers` — stock changes only when a
transfer is marked `received` (`transfer_out` + `transfer_in`).

### 9. Categories are a tree; `products.category` is a derived path
The real link is `products.category_id`. A Postgres trigger keeps `products.category` filled
with the flattened path (e.g. `Plumbing / Pipes`) so receipts, CSV exports, and the POS never
have to walk the tree. Apps write `category_id` only.

### 10. Who the shop is lives in `store_settings` — one row per branch
Name, logo, address, phone, receipt footer, and invoice counters are keyed on
`location_id` (branch only — warehouses skip). Edited under admin Settings (default branch)
or per location. The POS pulls the enrolled branch's settings whole on every sync and never
writes them. Nothing on a device may hardcode the shop name: read it through
`useStoreSettings()`, which falls back to `DEFAULT_STORE_SETTINGS` before the first pull.
The logo is a public URL, so a terminal that has never been online shows the initial instead —
a header must not wait on a fetch. Filtering by category is done on ids — the path text on a
product survives the category being deleted.

### 11. Customers are reusable records; sales still snapshot the text
`customers` is a real table (id, name, address, contact). Devices create rows offline with client
UUIDs — same rule as sales — and push them before sale headers (FK). Sales carry `customer_id`
plus snapshotted `customer_name` / `address` / `contact` so a receipt still reads after a rename.
Walk-ins stay null on every customer field. The POS pulls customers whole each sync (like
categories) and never treats SQLite as the source of truth after a pull lands. Admin lists
customers and filters sales by `customer_id`.

### 12. Paid and fulfillment live on the sale
`sales.is_paid` defaults from payment method: cash → paid; GCash / card / other → unpaid until
the cashier (or admin) marks paid. `sales.fulfillment` is `pickup` | `delivery` (default pickup).
`delivery_completed` is only meaningful for deliveries. Flag changes after a sale has already
synced go through `patch_sale_flags` on the next Sync — insert upserts use `ignoreDuplicates` and
cannot rewrite those columns. The POS Delivery tab lists open deliveries on that terminal.

### 13. Category markup can fill shelf price from cost
`categories.markup_percent` + `markup_applied`. When applied, the admin product form fills
shelf price as `cost × (1 + percent/100)`. Owner can still override. Reporting never uses this —
sale lines keep snapshotted prices.

### 14. Operating expenses are admin-only and subtract from revenue
The owner logs rent, utilities, wages and similar outlays in admin (`expenses` table). Not
COGS — that stays on `sale_items.unit_cost`. Never written from the POS and never synced to
SQLite. Dashboard and reports **Net** = revenue − sum of expenses whose `expense_date` falls
in the same shop-day range. Gross profit (revenue − supplier cost) stays a separate figure.

### 15. Company is the isolation key (multi-tenant); locations split stock
Every business row carries `company_id`. Under a company, `locations` (`branch` | `warehouse`)
hold stock. Catalog/prices stay company-scoped; stock, sales, invoice counters, and terminal
enrollment are location-scoped. The first company is the pre-existing shop — tenancy
migrations never delete business rows. Existing companies get a backfilled `Main Branch`.

`superadmin` is platform-only (`company_id` null). They create companies, assign shop
admins, enable/disable a company (disabled blocks shop API), reset any shop user's Auth
password or PIN, and may **Open company** (JWT `acting_company_id`) to use that shop's
dashboard. Impersonation is not a second login.

Shop writes never cross `company_id`. Mobile binds to the enrolled user's `company_id` **and**
`location_id` (branch only) and only pulls that company's catalog with that branch's stock.
Superadmin never enrolls a terminal.

---

## Commands

```
pnpm install                    # install all workspace dependencies
pnpm dev                        # run all apps in dev mode (turbo)
pnpm --filter admin dev         # run only the Next.js admin app
pnpm --filter mobile start      # run only the Expo mobile app
pnpm build                      # build all apps (turbo)
pnpm lint                       # lint all packages/apps
pnpm type-check                 # type-check all packages/apps
```

---

## Design & UX

See `design-system.md` for full visual/interaction guidelines. In short:
- Admin (web) can be denser, richer in hover/interaction states.
- Mobile (POS) needs large tap targets, high contrast for shop-floor lighting, and an
  optimistic/instant feel — never block the UI on a network call.
- Follow the token system in `design-system.md` exactly rather than defaulting to generic
  component-library styling.
