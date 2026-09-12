# Design System — DOUBLE A POS & Inventory System

This defines the visual language and interaction rules for both `apps/admin` (Next.js) and
`apps/mobile` (React Native). Follow these tokens and patterns instead of defaulting to
generic component-library styling. Read `CLAUDE.md` first for the business/architecture
context this design system supports.

---

## Design concept

The subject here is a **ledger** — a business's record of every transaction, honest and
exact down to the peso. The signature motif across both apps is **the ledger line**: a thin,
dashed divider (recalling a receipt's tear-perforation) used specifically at real boundaries
in the data — between synced and unsynced items, between a cart's line items and its total,
between today's sales and history. It marks an actual boundary in the information, not
decoration layered on top.

Numbers are treated as first-class content, not incidental labels — prices and quantities
use tabular (monospaced-width) figures everywhere so columns of pesos align cleanly, the way
they would on a printed receipt.

---

## Color tokens

| Token | Hex | Use |
|---|---|---|
| `color-primary` | `#0F5C52` (deep teal) | Primary actions, active nav state, brand presence |
| `color-primary-dark` | `#0A3E38` | Pressed/hover state for primary |
| `color-accent` | `#E8A33D` (warm amber) | Secondary CTAs, highlights, the "sync" action specifically |
| `color-success` | `#3FA34D` (leaf green) | Completed sale, synced state, stock healthy |
| `color-danger` | `#C1443C` (terracotta-red) | Errors, void/delete actions, out-of-stock |
| `color-warning` | `#D9A441` | Low stock, pending sync, unsaved changes |
| `color-ink` | `#1B1F1D` (warm near-black) | Primary text |
| `color-ink-muted` | `#5B655F` | Secondary text, timestamps, helper text |
| `color-paper` | `#F5F5F3` (near-white) | App background — soft off-white, not pure white |
| `color-surface` | `#FFFFFF` | Cards, panels, modals |
| `color-border` | `#E4E0D8` | Dividers, input borders |

Each colour also has a tinted fill and, where the base is too light to read as text, a legible
ink: `primary-soft` `#E7EFED` / `primary-tint` `#F1F6F4` / `on-primary` `#FFFFFF`,
`accent-soft` `#FBF1DC` / `accent-ink` `#8A6516`, `success-soft` `#E7F3E9` /
`success-ink` `#256B31`, `warning-soft` `#FBF1DC` / `warning-ink` `#8A6516`,
`danger-soft` `#F7E3E1` / `danger-ink` `#9C332C`, plus `surface-pressed` `#F1EFEA` and
`border-soft` `#EFEBE4`. Use these rather than writing a one-off hex: a tinted fill is how
colour reaches a surface (badge, chip, icon well, status band) while text and icons stay at
contrast.

One exception to the flat off-white field: the POS splash and login sit on a sage gradient,
`sage-light` `#E9F1EC` to `sage` `#C6DACF` to `sage-deep` `#9DBCAC`. It is chrome for the two
screens with no data on them and never runs behind products, a cart, or a report. The ramp stays
light so every label on it is still `color-ink`; going darker would force white text and make
those screens read as a different product.

Do not substitute a generic Tailwind default palette (`slate`, `zinc`, `blue-500`, etc.)
for these — the warm-neutral base (`color-paper`, `color-ink`) is deliberate and should
carry through every screen, not just marketing surfaces.

---

## Typography

| Role | Typeface | Notes |
|---|---|---|
| Display / headings | **Manrope** (or General Sans as alt) | Geometric, confident, used for page titles and section headers only — not body copy |
| Body / UI | **Inter** | Highly legible at small sizes, used for all interface text, labels, buttons |
| Numeric / tabular | **IBM Plex Mono** (tabular figures) | Prices, quantities, totals, receipt/order numbers — anywhere numbers need to align in a column or be scanned at a glance |

**Type scale** (rem, base 16px):
`caption: 0.75` · `body: 0.875` · `body-lg: 1` · `heading-sm: 1.25` · `heading-md: 1.5` ·
`heading-lg: 2` · `display: 2.5`

Numbers in totals/receipts on mobile should render at minimum `1.25rem` — cashiers glance at
these quickly, under variable lighting; err large.

---

## Spacing & shape

- Spacing scale: `4, 8, 12, 16, 24, 32, 48, 64` (px) — no arbitrary one-off values.
- Border radius: one scale for both apps — `radius-sm: 6px` (inputs, small buttons, badges),
  `radius-md: 12px` (cards, tiles), `radius-lg: 20px` (modals, sheets). Mobile used to square
  every corner to 0; it read as unfinished beside admin, so the POS shares these values.
- Shadows: keep flat/minimal on mobile (performance + battery), slightly more elevation on
  admin cards to establish hierarchy in a denser dashboard layout.

---

## Platform-specific rules

### `apps/admin` (Next.js — web dashboard)
- Can be denser: multi-column tables, hover states, inline editing.
- Left sidebar navigation, card-based dashboard modules.
- Real-time-feeling updates are fine here (it's always online) — e.g., a stock count can
  visibly update without a manual refresh.
- Data tables (sales history, inventory) use tabular numeric alignment and sortable columns.
- Empty states should explain what to do next in plain terms — e.g., "No products yet. Add
  your first product to start selling." — not just "No data."

### `apps/mobile` (React Native — POS)
- **Large tap targets** — minimum 48x48dp, bigger for primary actions (checkout, add-to-cart).
  Cashiers move fast, sometimes one-handed, sometimes distracted by a customer.
- **High contrast** — assume variable shop lighting (bright sun near a window, dim evening
  shop). Don't rely on subtle color differences alone to convey state; pair color with an
  icon or label.
- **Optimistic UI, always** — tapping "Complete Sale" must feel instant. Never show a
  loading spinner blocking the sale flow for a network call; local-first means local-first
  everywhere, not just in the data layer.
- **Persistent sync status** — "Last synced: X ago" visible at all times, not buried in a
  settings screen. Use `color-warning` styling when it's been a long time since last sync
  (threshold configurable, e.g., > 4 hours), so cashiers develop a habit of syncing.
- **The ledger line** — use the dashed divider between cart items and the total, and between
  synced/pending sales in history — this is the one signature visual element carried from
  the design concept into the actual functional UI.
- **Minimal confirmation on speed-critical actions** (add to cart, adjust quantity) —
  **deliberate confirmation on destructive/irreversible actions** (void a completed sale,
  delete a product locally before it's synced).
- **One breakpoint: 720dp** — read it from `useLayout()` in `apps/mobile/lib/layout.ts`, never
  by comparing `useWindowDimensions().width` inline, so every screen sizes the same way. The
  hook also carries a comfort tier at 1024dp (`expanded`) which only buys padding, and width
  caps so a large tablet gains air rather than stretched content: the product grid caps at
  1120dp and centres, the cart takes a fixed 320–460dp column instead of a flex ratio, and
  forms, receipts and the price sheet cap at a readable column width. The POS runs on both
  tablets and phones, so no screen may assume a side-by-side layout:
  - Sell screen — tablet shows the product grid and cart side by side; compact shows the grid
    full width with a bottom summary bar (item count + total) that opens the cart as a
    full-screen sheet. Checkout stays inside the cart, never on the bar.
  - Product grid columns scale with width: 2 under 480dp, 3 under 900dp, 4 above.
  - Category strip above the grid: horizontally scrollable chips, `All` first, then top-level
    categories alphabetically, then `Browse` last — and only when the tree actually nests, since
    a flat list already has a chip per category and a second route to the same names reads as a
    duplicate. `Browse`, not "All categories": two chips opening with the same word are read as
    one thing twice. The chips come from the local
    `categories` table, pulled whole from the Tally API on every pull, and filtering matches on
    category ids. Never build the strip from the `category` path text on a product: that text
    is a snapshot kept for receipts and reports and survives the category being deleted, so a
    strip built from it shows shelves the office retired months ago. Only top-level names get a chip —
    a strip of leaf names ("PVC", "Copper") says nothing about where the cashier is. The last
    chip opens a dialog holding the whole tree, two columns of groups above 900dp, where a
    specific shelf can be picked. Search overrides the filter and hides the strip: someone
    typing a name wants the product, not a lesson in where it is filed.
  - Customer details on a sale are optional and must look optional. One quiet row in the cart
    between the payment picker and `Complete sale`, reading `Add customer details` with
    "Optional — for a delivery or an account" underneath; it fills with a tinted summary and an
    `X` to clear once something is typed. Never a required field, never a dialog that opens on
    its way to the total, and cleared after every sale so a stranger's name cannot land on the
    next receipt. The sheet mirrors the price sheet (bottom sheet, capped at 560dp) with three
    fields: name, contact number, address. Receipt and sale detail print the block only when it
    holds something.
  - In compact, drop decoration before content: the product tile's icon goes, the cashier's
    name in the tab bar goes, `Refresh` in the sync bar becomes icon-only. Names, prices, and
    the `Sync` label never shrink to fit.
  - Never let a label truncate into nonsense ("GCas h", "Bottl ed"). Use `numberOfLines` with
    a shorter string instead.
- **Counter pricing** — the shelf price is the default, never the only number. An attendant
  can type a lower selling price on any cart line. Show the list price struck through, the
  amount taken off, and the margin against supplier cost while they type. Warn when the
  typed price is below cost; never block. Bulk tiers apply automatically once quantity
  crosses the product's bulk minimum, but a manually typed price always wins.

---

## Icons

**Lucide** is the only icon set: `lucide-react` in admin, `lucide-react-native` in mobile.
Do not mix in a second family — the uniform stroke weight is what keeps a dense dashboard
readable.

- Sizes: `13–14px` inside badges and captions, `16px` in buttons and table cells, `18–20px`
  in nav, card headers and mobile controls, `20–24px` in page headers and empty states.
- Stroke width `2` normally, `2.5` for small icons that need to hold up at 13px, `1.75` for
  large decorative marks in empty states.
- An icon paired with a label is the default. Icon-only controls (table row actions, mobile
  steppers) must carry a `title`/`aria-label` on web and `accessibilityLabel` on mobile.
- Meaning is fixed across both apps: sync/upload `CloudUpload`, refresh `RefreshCw`, sale
  `Receipt`, product `Package`, stock `Boxes`, cashier `UserRound`, terminal `Smartphone`,
  void `Ban`, warning `TriangleAlert`.
- Icons never carry state on their own — they sit alongside the colour and the label, per
  the high-contrast rule above.

---

## Component patterns

- **Buttons**: one primary style (`color-primary` fill), one secondary (outline, `color-ink`
  border), one accent (`color-accent` fill, reserved specifically for the Sync action so it's
  always visually distinct from regular workflow buttons).
- **Cards**: `radius-md`, `color-surface` background, `color-border` 1px border, no heavy
  shadow — let spacing do the separation work, not drop-shadows stacked on every element.
- **Status badges** (synced/pending/failed, in-stock/low/out): small pill shape, `radius-sm`,
  paired icon + label, never color alone.
- **Empty states**: always an instruction, never just "Nothing here." Written in the
  interface's voice, telling the person what to do next.
- **Errors**: state plainly what happened and how to fix it — no vague "Something went
  wrong," no apologetic tone. E.g., "Sync failed — check your connection and try again,"
  not "Oops! We couldn't sync your data right now."

---

## Copy voice

- Active voice, plain verbs: "Complete sale," not "Submit order."
- Name things by what the person controls: "Products," "Sales," "Sync" — not "Inventory
  Management Module" or system-internal terms.
- Keep the same word for the same action through an entire flow — if a button says "Void
  Sale," the confirmation and resulting state should also say "Voided," not "Cancelled."
- Sentence case for all UI text (buttons, headers, labels) — not Title Case, not ALL CAPS
  except where a genuine visual convention calls for it (e.g., a receipt-style total line).

---

## Motion

- Keep it minimal and functional: a subtle fade/slide when a sale is added to cart, a
  checkmark animation on successful sync — nothing decorative or ambient.
- Respect reduced-motion settings on both platforms.
- No animation should ever be load-bearing for understanding state — sync status must be
  legible from static text/color alone, animation is a bonus reinforcement only.
- Admin route changes: the page fades and lifts 6px over 180ms
  (`motion-safe:animate-page-enter`, restarted by `app/(dashboard)/template.tsx`). The sidebar
  is in the layout, so it never animates or loses scroll. Because admin pages render on the
  server, the animation only plays once the data is there — the wait itself is covered by a
  spinner on the clicked nav item (`useLinkStatus`), not by animating an empty page.
