import { CATEGORY_PATH_SEPARATOR, type Category } from "@double-a/shared-types";
import { getDb } from "./index";

/**
 * A category as the POS renders it: the row from Supabase, with its ancestry
 * resolved into a path and its subtree flattened into ids.
 *
 * Filtering is done on ids, never on the path text a product carries. Product
 * paths are a snapshot — the office deleting a category leaves its path on
 * every product that was under it — so an id is the only thing that says a
 * shelf still exists.
 */
export interface LocalCategory {
  id: string;
  name: string;
  parentId: string | null;
  /** Full path, e.g. "Plumbing / Pipes / PVC". */
  path: string;
  /** 1 for a top-level category. */
  depth: number;
  /** The top-level category this one sits under — itself, if it is one. */
  rootId: string;
  rootName: string;
  /** This category and everything below it, for matching a product. */
  subtreeIds: string[];
  /** Products filed here or anywhere below, active only. */
  productCount: number;
}

interface CategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
}

const ROWS_SQL = `
SELECT c.id,
       c.name,
       c.parent_id
  FROM categories c
 WHERE c.is_active = 1
`;

const COUNTS_SQL = `
SELECT category_id AS id, COUNT(*) AS product_count
  FROM products
 WHERE is_active = 1
   AND category_id IS NOT NULL
 GROUP BY category_id
`;

/**
 * The tree this device last pulled, alphabetical at every level, parents before
 * their children.
 *
 * A category whose parent is inactive is promoted to the top rather than
 * dropped — losing it would hide its products behind no tab at all.
 */
export async function listLocalCategories(): Promise<LocalCategory[]> {
  const db = getDb();
  const [rows, counts] = await Promise.all([
    db.getAllAsync<CategoryRow>(ROWS_SQL),
    db.getAllAsync<{ id: string; product_count: number }>(COUNTS_SQL),
  ]);

  const ownCounts = new Map(counts.map((row) => [row.id, row.product_count]));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const childrenOf = new Map<string | null, CategoryRow[]>();

  for (const row of rows) {
    // Promotion: a parent that is not in the active set is treated as no parent.
    const parent = row.parent_id && byId.has(row.parent_id) ? row.parent_id : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), row]);
  }

  for (const siblings of childrenOf.values()) {
    siblings.sort((a, b) => a.name.localeCompare(b.name));
  }

  const categories: LocalCategory[] = [];

  const walk = (
    row: CategoryRow,
    depth: number,
    prefix: string,
    root: CategoryRow,
  ): string[] => {
    const path = prefix ? `${prefix}${CATEGORY_PATH_SEPARATOR}${row.name}` : row.name;
    const entry: LocalCategory = {
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      path,
      depth,
      rootId: root.id,
      rootName: root.name,
      subtreeIds: [row.id],
      productCount: ownCounts.get(row.id) ?? 0,
    };
    categories.push(entry);

    for (const child of childrenOf.get(row.id) ?? []) {
      // A depth cap is not needed here: the parent chain came from Postgres,
      // where the tree is acyclic, and `childrenOf` is keyed by a parent id
      // that each row has exactly one of.
      const ids = walk(child, depth + 1, path, root);
      entry.subtreeIds.push(...ids);
    }

    entry.productCount = entry.subtreeIds.reduce(
      (sum, id) => sum + (ownCounts.get(id) ?? 0),
      0,
    );

    return entry.subtreeIds;
  };

  for (const root of childrenOf.get(null) ?? []) walk(root, 1, "", root);

  return categories;
}

/**
 * Replaces the local tree with what the pull returned, in one transaction.
 *
 * A wholesale replace, not an upsert: this is the only way a category deleted
 * or retired in the office disappears from the strip. Products are untouched —
 * their `category_id` is left dangling on purpose, so a sale mid-shift is never
 * interrupted by the office reorganising shelves.
 */
/**
 * Realtime counterpart to replaceCategories — a single row upsert from
 * CategoryUpdated (Laravel), fired on the admin creating or editing a
 * category (CLAUDE.md §9, sync/realtime.ts). Never touches the rest of the
 * table, unlike a pull's wholesale replace.
 */
export async function upsertLocalCategory(category: Category): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO categories (id, name, parent_id, is_active, updated_at, markup_percent, markup_applied)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       parent_id = excluded.parent_id,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at,
       markup_percent = excluded.markup_percent,
       markup_applied = excluded.markup_applied`,
    category.id,
    category.name,
    category.parentId,
    category.isActive ? 1 : 0,
    category.updatedAt,
    category.markupPercent,
    category.markupApplied ? 1 : 0,
  );
}

/** Realtime counterpart to a category's removal — see upsertLocalCategory's own comment. */
export async function deleteLocalCategory(id: string): Promise<void> {
  await getDb().runAsync("DELETE FROM categories WHERE id = ?", id);
}

export async function replaceCategories(categories: Category[]): Promise<void> {
  const db = getDb();

  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM categories;");

    for (const category of categories) {
      await db.runAsync(
        `INSERT INTO categories (id, name, parent_id, is_active, updated_at, markup_percent, markup_applied)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        category.id,
        category.name,
        category.parentId,
        category.isActive ? 1 : 0,
        category.updatedAt,
        category.markupPercent,
        category.markupApplied ? 1 : 0,
      );
    }
  });
}
