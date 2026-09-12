/**
 * The local SQLite schema.
 *
 * This database is a disposable working copy of Supabase, not a second source
 * of truth. Products and users are overwritten on every pull. Sales are the one
 * thing created here first, and they are pushed up before anything is pulled
 * down.
 *
 * Because sales live here before they live anywhere else, the schema is versioned
 * as an ordered list of steps rather than one script. A terminal that has been
 * selling all day through a bad connection must come out of an app update with
 * every pending sale still on it, so no step may drop or rebuild a table that
 * holds one. Additive `ALTER TABLE ... ADD COLUMN` only.
 */

export interface Migration {
  version: number;
  /** Run as one statement batch inside a single transaction. */
  sql: string;
}

/**
 * v1 is the original schema, still written with IF NOT EXISTS so a device that
 * predates the version list lands on its feet.
 */
const V1_INITIAL = `
-- Mirrors Supabase. stock_quantity is the last synced value and is never
-- decremented locally; the cashier sees an estimate computed at read time.
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT,
  price REAL NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'cashier',
  pin_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT
);

-- Created here, pushed up. id is a UUID generated on this device.
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  total_amount REAL NOT NULL,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  device_id TEXT,
  created_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE
);

-- Single row.
--
-- Two timestamps, doing two different jobs:
--   last_synced_at   — when this device last finished a sync, for the
--                      "Last synced: X ago" indicator.
--   high_water_mark  — the newest updated_at the server has handed over, used
--                      to filter the next incremental pull. Server time, so a
--                      wrong device clock cannot make a pull skip rows.
CREATE TABLE IF NOT EXISTS sync_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_synced_at TEXT,
  high_water_mark TEXT,
  first_pull_done INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS sales_sync_status_idx ON sales (sync_status);
CREATE INDEX IF NOT EXISTS sales_created_at_idx ON sales (created_at DESC);
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_id_idx ON sale_items (product_id);
CREATE INDEX IF NOT EXISTS products_active_idx ON products (is_active);

INSERT OR IGNORE INTO sync_meta (id, last_synced_at, high_water_mark, first_pull_done)
VALUES (1, NULL, NULL, 0);
`;

/**
 * v2 mirrors the hardware-store columns Supabase gained: what a thing cost us,
 * what it is sold by, and what a line actually sold for against its list price.
 *
 * Every column is added with a default, so rows already on the device — pending
 * sales above all — keep their data and simply acquire a sensible value. The
 * defaults match the server's: an unsynced sale written before this upgrade
 * reports no discount and zero cost, and the `sale_items_backfill_prices`
 * trigger fills the real list price and cost in when it finally arrives.
 */
const V2_HARDWARE_COLUMNS = `
ALTER TABLE products ADD COLUMN cost_price REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN unit TEXT NOT NULL DEFAULT 'pc';
ALTER TABLE products ADD COLUMN barcode TEXT;
ALTER TABLE products ADD COLUMN reorder_point INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN bulk_price REAL;
ALTER TABLE products ADD COLUMN bulk_min_quantity INTEGER;
ALTER TABLE products ADD COLUMN category_id TEXT;

ALTER TABLE sale_items ADD COLUMN list_price REAL NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN unit_cost REAL NOT NULL DEFAULT 0;

ALTER TABLE sales ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode);
`;

/**
 * v3 gives the POS the category tree itself, rather than inferring it from the
 * flattened path text on each product. A product keeps its path text forever —
 * that is what a receipt printed months ago says — so deleting a category in
 * the office leaves that text behind on every product under it. Reading the
 * strip off those paths meant retired shelves never went away.
 *
 * The rows here are replaced whole on every pull, which is also how a deletion
 * reaches the device: an incremental query cannot return a row that is gone.
 */
const V3_CATEGORIES = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON categories (parent_id);
`;

/**
 * v4 carries the optional customer details a counter can attach to a sale.
 *
 * Nullable with no default, which is the point: a sale written before this
 * upgrade — including one still sitting here unpushed — reads back as a sale
 * nobody was asked about, which is exactly what it was.
 */
const V4_SALE_CUSTOMER = `
ALTER TABLE sales ADD COLUMN customer_name TEXT;
ALTER TABLE sales ADD COLUMN customer_address TEXT;
ALTER TABLE sales ADD COLUMN customer_contact TEXT;
`;

/**
 * v5 holds who the shop is, so the header carries the real name and logo rather
 * than a constant compiled into the app.
 *
 * Single row, like sync_meta, and seeded with the same default the server
 * migration uses — a terminal that has not pulled yet still has a header to
 * draw. Replaced whole on every pull; nothing on the device ever writes it.
 */
const V5_STORE_SETTINGS = `
CREATE TABLE IF NOT EXISTS store_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'DOUBLE A',
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  receipt_footer TEXT,
  updated_at TEXT
);

INSERT OR IGNORE INTO store_settings (id) VALUES (1);
`;

/**
 * v6: reusable customers, paid/fulfillment flags on sales, category markup.
 *
 * Customers are client-UUID rows (like sales) so an offline terminal can create
 * and link one without waiting on the server. Flag changes after a sale has
 * already synced use `flags_pending` — the insert upsert ignores duplicates,
 * so paid/delivery updates go through a separate patch on push.
 */
const V6_CUSTOMERS_PAID_DELIVERY = `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  contact TEXT,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced'
);

CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (name);
CREATE INDEX IF NOT EXISTS customers_sync_status_idx ON customers (sync_status);

ALTER TABLE sales ADD COLUMN customer_id TEXT;
ALTER TABLE sales ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sales ADD COLUMN fulfillment TEXT NOT NULL DEFAULT 'pickup';
ALTER TABLE sales ADD COLUMN delivery_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN flags_pending INTEGER NOT NULL DEFAULT 0;

ALTER TABLE categories ADD COLUMN markup_percent REAL NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN markup_applied INTEGER NOT NULL DEFAULT 0;
`;

/** Floor staff may unlock with sales disabled; POS blocks completeSale. */
const V7_USER_CAN_SELL = `
ALTER TABLE users ADD COLUMN can_sell INTEGER NOT NULL DEFAULT 1;
`;

/**
 * v9: decimal quantities. A product sold by weight or length carries fractions,
 * so the flag comes down with every pull. The quantity columns themselves
 * (products.stock_quantity, sale_items.quantity) keep their INTEGER affinity —
 * SQLite stores a real value like 2.5 in an INTEGER-affinity column untouched,
 * since the conversion would lose the fraction. Defaults to 0 (whole numbers)
 * so a pending sale written before this upgrade is unaffected.
 */
const V9_ALLOW_DECIMAL = `
ALTER TABLE products ADD COLUMN allow_decimal INTEGER NOT NULL DEFAULT 0;
`;

const V10_COMPANY_ID = `
ALTER TABLE sales ADD COLUMN company_id TEXT;
ALTER TABLE customers ADD COLUMN company_id TEXT;
`;

/**
 * v11: what a superadmin has turned on/off for this shop — replaced whole on
 * every pull, same as categories/store_settings. Absent key = enabled: a
 * terminal that has never synced (or a key added to the catalog after this
 * device's last pull) must not silently hide something on its own.
 */
const V11_FEATURE_FLAGS = `
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
`;

/**
 * v8: receipt layout from admin. One row, pulled whole every sync. Bluetooth
 * pairing stays in AsyncStorage on this device — never this table.
 */
const V8_RECEIPT_LAYOUT = `
CREATE TABLE IF NOT EXISTS receipt_layout (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  show_shop_name INTEGER NOT NULL DEFAULT 1,
  show_address INTEGER NOT NULL DEFAULT 1,
  show_phone INTEGER NOT NULL DEFAULT 1,
  show_logo_line INTEGER NOT NULL DEFAULT 0,
  show_cashier INTEGER NOT NULL DEFAULT 1,
  show_terminal INTEGER NOT NULL DEFAULT 1,
  show_customer INTEGER NOT NULL DEFAULT 1,
  show_discounts INTEGER NOT NULL DEFAULT 1,
  show_payment INTEGER NOT NULL DEFAULT 1,
  show_footer INTEGER NOT NULL DEFAULT 1,
  paper_width_mm INTEGER NOT NULL DEFAULT 58,
  columns INTEGER NOT NULL DEFAULT 32,
  printer_model TEXT NOT NULL DEFAULT 'PT-210',
  updated_at TEXT
);

INSERT OR IGNORE INTO receipt_layout (id) VALUES (1);
`;

/**
 * v12: server-assigned sequential invoice numbers. Null on a pending sale
 * until push assigns one and writes it back — the receipt prints a
 * "prefix-pending" placeholder in the meantime (see printing/receipt.ts).
 * store_settings columns are replaced whole on every pull, like the rest of
 * that row.
 */
const V12_INVOICE_NUMBERS = `
ALTER TABLE sales ADD COLUMN invoice_number TEXT;
ALTER TABLE store_settings ADD COLUMN invoice_prefix TEXT;
ALTER TABLE store_settings ADD COLUMN invoice_digits INTEGER NOT NULL DEFAULT 6;
ALTER TABLE store_settings ADD COLUMN invoice_next_number INTEGER NOT NULL DEFAULT 1;
`;

/**
 * v13: branch that rang the sale. Device terminals stamp enrolled location;
 * admin tablets stamp the active location from the header switcher. Push
 * sends it so admin actors can attribute stock to the right branch.
 */
const V13_SALE_LOCATION = `
ALTER TABLE sales ADD COLUMN location_id TEXT;
`;

const V14_PRODUCT_NOTES = `
ALTER TABLE products ADD COLUMN description TEXT;
ALTER TABLE products ADD COLUMN replenish_quantity INTEGER NOT NULL DEFAULT 0;
`;

/**
 * v15: shop AI opt-in snapshot — replaced on every pull, same pattern as
 * store_settings. POS only needs platform_available + enabled for the search
 * bar icon; quotas stay server-side.
 */
const V15_AI_SETTINGS = `
CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  platform_available INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO ai_settings (id) VALUES (1);
`;

/** v16: public URL of a resized WebP, same one admin uploaded. Null = no photo. */
const V16_PRODUCT_PHOTO = `
ALTER TABLE products ADD COLUMN photo_url TEXT;
`;

/**
 * v17: flattened, comma-joined names of every supplier linked to a product —
 * same "server pre-joins it, device just stores the string" spirit as
 * `category`. A product can carry more than one supplier_products link
 * server-side; this column is always the joined, read-only display text.
 */
const V17_PRODUCT_SUPPLIER_NAMES = `
ALTER TABLE products ADD COLUMN supplier_names TEXT;
`;

/**
 * v18: a bundle is otherwise a normal product row here too — its own price
 * and stock_quantity. This flag only drives the "Bundle" badge on the tile;
 * the recipe itself (bundle_items) is admin-only and never synced to POS.
 */
const V18_PRODUCT_IS_BUNDLE = `
ALTER TABLE products ADD COLUMN is_bundle INTEGER NOT NULL DEFAULT 0;
`;

/**
 * v19: product → variant → attribute + add-on groups (Phase 3).
 *
 * product_variants and addon_groups are real tables, replaced whole on every
 * pull (same reasoning as categories — an incremental `updated_at >` filter
 * can't surface a deletion, and both are small). Their nested arrays
 * (attribute_values, an addon group's items) are stored as JSON text: they
 * are only ever displayed, never filtered/joined on in SQL, unlike
 * product_id below which needs a real indexed column for the variant picker
 * to look up "this product's variants."
 *
 * sale_items.variant_id and .addons follow a pending sale from creation
 * through push — addons as JSON text for the same reason (a handful of
 * picks per line, read back only to build the push payload and the
 * receipt), not a second relational table.
 */
const V19_VARIANTS_AND_ADDONS = `
CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  sku TEXT,
  price REAL NOT NULL,
  cost_price REAL NOT NULL DEFAULT 0,
  stock_quantity REAL NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  attribute_values TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON product_variants (product_id);

CREATE TABLE IF NOT EXISTS addon_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  selection_type TEXT NOT NULL DEFAULT 'multiple',
  is_required INTEGER NOT NULL DEFAULT 0,
  items TEXT NOT NULL DEFAULT '[]'
);

ALTER TABLE products ADD COLUMN addon_group_ids TEXT NOT NULL DEFAULT '[]';

ALTER TABLE sale_items ADD COLUMN variant_id TEXT;
ALTER TABLE sale_items ADD COLUMN addons TEXT NOT NULL DEFAULT '[]';
`;

/**
 * v20: minutes of no touch activity before the POS forces a cashier back to
 * PIN-unlock. 0 disables auto-lock. Replaced whole on every pull, like the
 * rest of this row.
 */
const V20_IDLE_TIMEOUT = `
ALTER TABLE store_settings ADD COLUMN idle_timeout_minutes INTEGER NOT NULL DEFAULT 5;
`;

/**
 * v21: company tax settings + simple/complex discount rules (whole-replace
 * on pull) and sale_discounts audit rows pushed with the sale.
 */
const V21_DISCOUNTS_AND_TAX = `
CREATE TABLE IF NOT EXISTS tax_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_vat_registered INTEGER NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 12,
  auto_apply_complex_discounts INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO tax_settings (id, is_vat_registered, vat_rate, auto_apply_complex_discounts)
VALUES (1, 0, 12, 1);

CREATE TABLE IF NOT EXISTS discount_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  value REAL NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'total',
  requires_id_number INTEGER NOT NULL DEFAULT 0,
  is_vat_exempt INTEGER NOT NULL DEFAULT 0,
  is_system_protected INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  scopes_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS complex_discount_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  reward_value REAL,
  reward_free_variant_id TEXT,
  condition_logic TEXT NOT NULL DEFAULT 'all',
  is_active INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT,
  ends_at TEXT,
  conditions_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS sale_discounts (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  discount_rule_id TEXT,
  complex_discount_rule_id TEXT,
  name TEXT,
  id_number TEXT,
  id_holder_name TEXT,
  discount_amount REAL NOT NULL,
  vat_removed REAL,
  is_vat_exempt INTEGER NOT NULL DEFAULT 0,
  applied_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sale_discounts_sale_id_idx ON sale_discounts (sale_id);
`;

/**
 * v22: product_variants was missing two columns the server (and
 * packages/api-client's toProductVariant) already sends — barcode and
 * is_bundle — so a variant's own barcode never reached the device (scanning
 * one fell through to the parent product's) and ProductVariant.isBundle had
 * no local column to read back at all. Additive with defaults, same as
 * every other step here: a device mid-shift keeps whatever it already has.
 */
const V22_VARIANT_BARCODE_AND_BUNDLE = `
ALTER TABLE product_variants ADD COLUMN barcode TEXT;
ALTER TABLE product_variants ADD COLUMN is_bundle INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS product_variants_barcode_idx ON product_variants (barcode);
`;

/**
 * v23: Loyalty — rewards are pulled whole each sync (same as discount_rules,
 * v21) since a deactivated/deleted reward must leave the device, not linger.
 * customers.loyalty_points_balance is the same "last synced" cached balance
 * as the server's own column (loyalty_program migration) — the POS reads it
 * to show eligibility, never writes it directly; the real deduction happens
 * server-side when a redemption's sale_discounts row pushes (see
 * queries/pos.ts's toPushSalePayload comment). sale_discounts.loyalty_reward_id
 * just tags which applied discount (if any) was a reward redemption, so it
 * can travel with the sale on push.
 */
const V23_LOYALTY = `
CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  points_required INTEGER NOT NULL,
  simple_discount_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE customers ADD COLUMN loyalty_points_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sale_discounts ADD COLUMN loyalty_reward_id TEXT;
`;

/**
 * v24: optional e-wallet payment proof. payment_proof_local_uri is a file
 * this device saved (never uploaded anywhere on its own); it clears to NULL
 * once the best-effort background upload after a push writes back the
 * server's payment_proof_url. Cash/card/credit sales never touch either.
 */
const V24_PAYMENT_PROOF = `
ALTER TABLE sales ADD COLUMN payment_proof_local_uri TEXT;
ALTER TABLE sales ADD COLUMN payment_proof_url TEXT;
`;

/**
 * v25: loyalty settings (points-per-currency rate, needed on-device to show
 * how many points a sale earns before it ever syncs) plus work schedules and
 * schedule assignments — whole-replace on pull, same as discount_rules/
 * loyalty_rewards (a handful of rows, and a deleted schedule/assignment must
 * leave the device). Realtime-patched too, see sync/realtime.ts.
 */
const V25_LOYALTY_SETTINGS_AND_SCHEDULES = `
CREATE TABLE IF NOT EXISTS loyalty_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  loyalty_enabled INTEGER NOT NULL DEFAULT 0,
  loyalty_points_per_currency REAL NOT NULL DEFAULT 1,
  loyalty_program_name TEXT
);
INSERT OR IGNORE INTO loyalty_settings (id, loyalty_enabled, loyalty_points_per_currency, loyalty_program_name)
VALUES (1, 0, 1, NULL);

CREATE TABLE IF NOT EXISTS work_schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  crosses_midnight INTEGER NOT NULL DEFAULT 0,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS schedule_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  work_schedule_id TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT
);

CREATE INDEX IF NOT EXISTS schedule_assignments_user_id_idx ON schedule_assignments (user_id);
`;

/**
 * v26: cashier-picked e-wallet name (GCash/Maya/MariBank/GrabPay/ShopeePay,
 * or free text for "Other E-Wallet") — only meaningful for payment_method
 * 'ewallet'. Purely a display detail so the owner can match a sale against
 * their own bank/wallet records; never read by any business rule.
 */
const V26_EWALLET_PROVIDER = `
ALTER TABLE sales ADD COLUMN ewallet_provider TEXT;
`;

/**
 * v27: variant-level photo — ProductVariantResource already resolves this
 * server-side (a variant's own cover photo, or its parent product's photo
 * when it has none), so it's always the one photo to show; mobile just
 * never had a column to land it in.
 */
const V27_VARIANT_PHOTO = `
ALTER TABLE product_variants ADD COLUMN photo_url TEXT;
`;

/**
 * v28: v27 only adds the column — every variant already on-device keeps a
 * null photo_url until it's re-fetched, and an ordinary Sync/Refresh only
 * asks the server for rows updated since high_water_mark, which adding a
 * column server-side never bumps. Clearing high_water_mark (not
 * last_synced_at, which only drives the "X ago" display) makes the very
 * next pull unfiltered — see sync/pull.ts, `since = ... : meta.highWaterMark`
 * — so every device backfills variant photos once, automatically, with no
 * reinstall.
 */
const V28_REPULL_FOR_VARIANT_PHOTO = `
UPDATE sync_meta SET high_water_mark = NULL WHERE id = 1;
`;

/**
 * v29: a product/variant deleted (merged, duplicate cleanup, discontinued)
 * before PullController started reporting deleted_product_ids/
 * deleted_variant_ids has no way to be caught by that mechanism from here on
 * out — it only reports deletions *since* the pull's own `since` cursor, and
 * this device's ghost predates any cursor that could name it. Clearing
 * high_water_mark again forces one more unfiltered pull; PullController
 * responds to a request with no `since` by returning every currently
 * trashed id (not just recent ones) specifically so this one-time backfill
 * works, same idea as v28's photo backfill.
 */
const V29_REPULL_FOR_STALE_DELETES = `
UPDATE sync_meta SET high_water_mark = NULL WHERE id = 1;
`;

const V30_VARIANT_SUPPLIERS = `
ALTER TABLE product_variants ADD COLUMN suppliers TEXT;
`;

/**
 * v31: v30 only adds the column — every variant already on-device keeps it
 * null until its own next incremental update, same reasoning as v28 for
 * photo_url. Forces one more unfiltered pull so supplier SKU/price already
 * on file server-side shows up without waiting on an unrelated edit.
 */
const V31_REPULL_FOR_VARIANT_SUPPLIERS = `
UPDATE sync_meta SET high_water_mark = NULL WHERE id = 1;
`;

/** Ordered, append-only. Never edit a step that has shipped. */
export const MIGRATIONS: Migration[] = [
  { version: 1, sql: V1_INITIAL },
  { version: 2, sql: V2_HARDWARE_COLUMNS },
  { version: 3, sql: V3_CATEGORIES },
  { version: 4, sql: V4_SALE_CUSTOMER },
  { version: 5, sql: V5_STORE_SETTINGS },
  { version: 6, sql: V6_CUSTOMERS_PAID_DELIVERY },
  { version: 7, sql: V7_USER_CAN_SELL },
  { version: 8, sql: V8_RECEIPT_LAYOUT },
  { version: 9, sql: V9_ALLOW_DECIMAL },
  { version: 10, sql: V10_COMPANY_ID },
  { version: 11, sql: V11_FEATURE_FLAGS },
  { version: 12, sql: V12_INVOICE_NUMBERS },
  { version: 13, sql: V13_SALE_LOCATION },
  { version: 14, sql: V14_PRODUCT_NOTES },
  { version: 15, sql: V15_AI_SETTINGS },
  { version: 16, sql: V16_PRODUCT_PHOTO },
  { version: 17, sql: V17_PRODUCT_SUPPLIER_NAMES },
  { version: 18, sql: V18_PRODUCT_IS_BUNDLE },
  { version: 19, sql: V19_VARIANTS_AND_ADDONS },
  { version: 20, sql: V20_IDLE_TIMEOUT },
  { version: 21, sql: V21_DISCOUNTS_AND_TAX },
  { version: 22, sql: V22_VARIANT_BARCODE_AND_BUNDLE },
  { version: 23, sql: V23_LOYALTY },
  { version: 24, sql: V24_PAYMENT_PROOF },
  { version: 25, sql: V25_LOYALTY_SETTINGS_AND_SCHEDULES },
  { version: 26, sql: V26_EWALLET_PROVIDER },
  { version: 27, sql: V27_VARIANT_PHOTO },
  { version: 28, sql: V28_REPULL_FOR_VARIANT_PHOTO },
  { version: 29, sql: V29_REPULL_FOR_STALE_DELETES },
  { version: 30, sql: V30_VARIANT_SUPPLIERS },
  { version: 31, sql: V31_REPULL_FOR_VARIANT_SUPPLIERS },
];

export const SCHEMA_VERSION = MIGRATIONS.reduce(
  (highest, step) => Math.max(highest, step.version),
  0,
);
