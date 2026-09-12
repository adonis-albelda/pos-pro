# DOUBLE A — POS & Inventory

A Turborepo monorepo holding two apps over one Laravel API (the "Tally API",
`pos-inventory-laravel`, a separate repo):

- **`apps/admin`** — Next.js dashboard. Always online. Products, pricing, inventory, cashiers,
  sales history.
- **`apps/mobile`** — Expo POS. Works fully offline against local SQLite, synced manually with
  one button.

The Laravel API is the single source of truth. The mobile database is a disposable working copy.

## Getting started

```bash
pnpm install
```

Set up and run `pos-inventory-laravel` separately — see that repo's own README/CLAUDE.md for
migrations, seeding the first admin, and enrolling a terminal. Copy [.env.example](.env.example)
into `apps/admin/.env.local` and `apps/mobile/.env.local`, pointing `NEXT_PUBLIC_TALLY_API_URL` /
`EXPO_PUBLIC_API_URL` at that API.

```bash
pnpm dev                  # both apps
pnpm --filter admin dev   # dashboard on http://localhost:3000
pnpm --filter mobile start # Expo dev client
pnpm lint
pnpm type-check
pnpm build                # admin only; mobile ships through EAS
```

## Layout

```
apps/admin                Next.js dashboard
apps/mobile               Expo POS
packages/shared-types     Domain types, money maths, validation, sync copy
packages/api-client       Typed HTTP client for the Tally API + JSON:API mappers
packages/ui               Design tokens from design-system.md
packages/config-*         Shared ESLint and TypeScript config
```

Schema, migrations, and business-logic side effects (stock movements, observers,
authorization) live in `pos-inventory-laravel`, not here.

## How sync works

One button, two steps, in this order, only ever on a tap:

1. **Push** — local sales with `sync_status = 'pending'` go up. If this fails, sync stops here.
2. **Pull** — products and cashiers whose `updated_at` is past the stored high water mark come
   down and overwrite local rows.

Nothing syncs on reconnect, on a timer, or in the background. There are no realtime
subscriptions on mobile.

Two details worth knowing before changing that code:

- The push is idempotent — a retried push must not double-apply a sale's stock movement.
- The pull's high water mark is a **server** timestamp, kept separately from the
  "last synced" time shown to the cashier. A device clock that runs fast would otherwise skip
  rows.

## Inventory

`products.stock_quantity` is only ever written through `inventory_movements`, so it always
equals the sum of a product's movements. Sales log a negative movement server-side; restocks
and adjustments go through the same movement path from the dashboard (CLAUDE.md rule 8 — this
is a Laravel Observer, not a DB trigger).

Stock is allowed to go negative. That is what an oversell looks like when two offline
terminals both sell the last unit, and it is flagged in the dashboard for manual correction
rather than prevented.

The cashier sees an estimate, computed at read time and never stored:

```
estimated stock = last synced stock - pending local sales
```

## Auth

- **Dashboard** — email and password against the Tally API. The account must have an
  `admin` role.
- **Terminal** — enrolled once during setup with an account whose role is `admin` or `device`,
  since every POS write accepts both. A shop with one admin login needs no extra account; a
  dedicated `device` account is for keeping terminals off the admin password. That session
  persists on device so later syncs need no login. Sales are attributed by the device's own id,
  not by the enrolling account.
- **Cashier** — picks their name and enters a PIN; a live server call checks it. Admins may
  also hold a PIN, set on the same Users form as their password, so an owner can ring up a sale
  without a second account.
  Needs a connection to unlock. After unlock, selling uses local SQLite. The PIN is a
  shift lock, not a data boundary: the terminal's own session is what authorizes POS writes.

## Receipt printing

Shop printer is a **PT-210** (58mm / 32 columns). Admin **Receipt layout** toggles which
blocks print; terminals pull that row on sync. Each terminal pairs its own Bluetooth
printer in POS Settings (`rn-bluetooth-classic-printer` + raw ESC/POS).

`printing/escpos.ts` builds the bytes; `printing/transport.ts` sends them over Bluetooth
Classic or optional LAN TCP. Native modules need an **Expo dev client, not Expo Go**.
With no printer configured, receipts render to the log so the sale flow stays testable.

Printing is fired from the local sale row and never awaited by the sale itself. A printer that
is switched off cannot fail a completed sale.

## Pinned versions in the mobile app

`react-native-reanimated` and `react-native-worklets` are pinned exactly, in
`apps/mobile/package.json` and again in the root `pnpm.overrides`. They are not ours to choose:
their JavaScript talks to a native library compiled into whichever runtime loads the bundle, and
a version gap between the two is a `SIGSEGV` inside `libworklets.so` on the first bundle
evaluation — no red screen, no JavaScript error, the app just closes.

Expo Go 57.0.2 was built against reanimated 4.5.0 and worklets 0.10.0, while `expo@57.0.9`
pins 4.5.1 and 0.10.1. Neither package is imported by our code — `expo-router` pulls in
reanimated, `@expo/ui` pulls in worklets — so nothing in the app warns you.

Consequences worth knowing:

- `expo install --check` will report these as outdated. It compares against the installed
  `expo` package, not against the Expo Go on the device. Do not "fix" it.
- Repin to match whenever the Expo Go version on the emulator changes:
  `curl -s https://unpkg.com/expo@<expo-go-version>/bundledNativeModules.json`.
- Running on a dev client instead makes this moot, since the native side is then built from
  these same versions. A dev client is needed for printing anyway.
