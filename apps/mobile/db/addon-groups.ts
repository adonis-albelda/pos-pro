import type { AddonGroup, AddonGroupItemChoice } from "@double-a/shared-types";
import { getDb } from "./index";

interface AddonGroupRow {
  id: string;
  name: string;
  selection_type: string;
  is_required: number;
  items: string;
}

function parseItems(json: string): AddonGroupItemChoice[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as AddonGroupItemChoice[]) : [];
  } catch {
    return [];
  }
}

function toAddonGroup(row: AddonGroupRow): AddonGroup {
  return {
    id: row.id,
    name: row.name,
    selectionType: row.selection_type === "single" ? "single" : "multiple",
    isRequired: row.is_required === 1,
    items: parseItems(row.items),
  };
}

/** Every group attached to a product — Product.addonGroupIds resolved against the whole table. */
export async function listLocalAddonGroups(groupIds: string[]): Promise<AddonGroup[]> {
  const ids = [...new Set(groupIds)];
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const rows = await getDb().getAllAsync<AddonGroupRow>(
    `SELECT id, name, selection_type, is_required, items FROM addon_groups WHERE id IN (${placeholders})`,
    ...ids,
  );
  return rows.map(toAddonGroup);
}

/**
 * Whole-replace every pull, same reasoning as categories: a handful of
 * rows, and an incremental filter can't surface a deletion.
 */
export async function replaceAddonGroups(groups: AddonGroup[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM addon_groups;");
    for (const group of groups) {
      await db.runAsync(
        `INSERT INTO addon_groups (id, name, selection_type, is_required, items) VALUES (?, ?, ?, ?, ?)`,
        group.id,
        group.name,
        group.selectionType,
        group.isRequired ? 1 : 0,
        JSON.stringify(group.items),
      );
    }
  });
}
