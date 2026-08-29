"use client";

import { useState, useTransition } from "react";
import {
  CornerDownRight,
  Eye,
  EyeOff,
  Folder,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge, IconButton, Table, Td, Th } from "@/components/ui";
import { ConfirmDialog, Sheet } from "@/components/overlay";
import type { CategoryOption } from "@/lib/category-options";
import { useInvalidateCategories } from "@/lib/query/categories";
import { removeCategory, toggleCategoryActive } from "./actions";
import { CategoryForm } from "./category-form";

export function CategoriesTree({
  categories,
  allCategories,
  productCounts,
}: {
  categories: CategoryOption[];
  allCategories: CategoryOption[];
  productCounts: Record<string, number>;
}) {
  const [editing, setEditing] = useState<CategoryOption | null>(null);
  const [deleting, setDeleting] = useState<CategoryOption | null>(null);
  const [hiding, setHiding] = useState<CategoryOption | null>(null);
  const [pending, startTransition] = useTransition();
  const invalidate = useInvalidateCategories();

  function confirmDelete() {
    if (!deleting) return;
    const form = new FormData();
    form.set("id", deleting.id);
    startTransition(async () => {
      await removeCategory(form);
      invalidate();
      setDeleting(null);
    });
  }

  function confirmHide() {
    if (!hiding) return;
    const form = new FormData();
    form.set("id", hiding.id);
    form.set("is_active", String(!hiding.isActive));
    startTransition(async () => {
      await toggleCategoryActive(form);
      invalidate();
      setHiding(null);
    });
  }

  const deleteChildCount = deleting
    ? allCategories.filter((other) => other.parentId === deleting.id).length
    : 0;
  const deleteProductCount = deleting ? (productCounts[deleting.id] ?? 0) : 0;

  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Category</Th>
            <Th>Full path</Th>
            <Th numeric>Markup</Th>
            <Th numeric>Products</Th>
            <Th>State</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id} className={category.isActive ? "" : "opacity-60"}>
              <Td>
                <span
                  className="flex items-center gap-2"
                  style={{ paddingLeft: Math.min(category.depth, 4) * 12 }}
                >
                  {category.depth > 0 ? (
                    <CornerDownRight size={14} className="shrink-0 text-ink-muted" />
                  ) : (
                    <Folder size={14} className="shrink-0 text-ink-muted" />
                  )}
                  <span className="font-medium">{category.name}</span>
                </span>
              </Td>
              <Td className="text-ink-muted">{category.path}</Td>
              <Td numeric className="text-ink-muted">
                {category.markupApplied ? `${category.markupPercent}%` : "—"}
              </Td>
              <Td numeric>{productCounts[category.id] ?? 0}</Td>
              <Td>
                {category.isActive ? (
                  <Badge tone="success">Active</Badge>
                ) : (
                  <Badge tone="neutral">Hidden</Badge>
                )}
              </Td>
              <Td>
                <div className="flex justify-end gap-1">
                  <IconButton
                    icon={Pencil}
                    label="Rename or move"
                    onClick={() => setEditing(category)}
                  />
                  <IconButton
                    icon={category.isActive ? EyeOff : Eye}
                    label={category.isActive ? "Hide category" : "Show category"}
                    onClick={() => setHiding(category)}
                  />
                  <IconButton
                    icon={Trash2}
                    label="Delete category"
                    tone="danger"
                    onClick={() => setDeleting(category)}
                  />
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : "Edit category"}
        description="Products under it pick up the new path on their next sync."
      >
        {editing ? (
          <CategoryForm
            key={editing.id}
            category={editing}
            categories={allCategories}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={pending}
        title="Delete category?"
        description={
          deleting
            ? [
                `Delete ${deleting.path}?`,
                deleteChildCount > 0
                  ? `The ${deleteChildCount} ${deleteChildCount === 1 ? "category" : "categories"} nested under it go too.`
                  : null,
                deleteProductCount > 0
                  ? `${deleteProductCount} products keep the category name already on their receipts, but lose the link.`
                  : null,
                "This cannot be undone.",
              ]
                .filter(Boolean)
                .join(" ")
            : ""
        }
        confirmLabel="Delete category"
        confirmationText={deleting?.path ?? ""}
      />

      <ConfirmDialog
        open={hiding !== null}
        onClose={() => setHiding(null)}
        onConfirm={confirmHide}
        pending={pending}
        title={hiding?.isActive ? "Hide category?" : "Show category?"}
        description={
          hiding?.isActive
            ? `${hiding.path} will stop appearing as a shelf choice on terminals after their next sync.`
            : `${hiding?.path ?? "This category"} will show on terminals again after their next sync.`
        }
        confirmLabel={hiding?.isActive ? "Hide category" : "Show category"}
      />
    </>
  );
}
