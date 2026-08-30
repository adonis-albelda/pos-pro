"use client";

import { useState } from "react";
import { FolderTree } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { Sheet } from "@/components/overlay";
import { Pagination, RecordToolbar } from "@/components/record-list";
import type { CategoryOption } from "@/lib/category-options";
import { CategoriesTree } from "./categories-tree";
import { CategoryForm } from "./category-form";

export function CategoriesPanel({
  categories,
  allCategories,
  productCounts,
  query,
  page,
  pageCount,
  total,
  pageSize,
}: {
  /** Page slice shown in the table. */
  categories: CategoryOption[];
  /** Full tree for parent pickers and delete child counts. */
  allCategories: CategoryOption[];
  productCounts: Record<string, number>;
  query: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Card>
        <RecordToolbar
          searchPlaceholder="Search categories…"
          query={query}
          addLabel="Add category"
          onAdd={() => setCreating(true)}
          exportHref="/api/export/categories"
        />

        {total === 0 ? (
          <EmptyState
            icon={FolderTree}
            title={query ? "Nothing matches that search" : "No categories yet"}
            instruction={
              query
                ? "Try a different name or path."
                : "Add a top-level category like Plumbing, then nest Pipes underneath it."
            }
          />
        ) : (
          <CategoriesTree
            categories={categories}
            allCategories={allCategories}
            productCounts={productCounts}
          />
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          basePath="/categories"
          query={{ q: query || undefined }}
        />
      </Card>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Add a category"
        description="How the shop is laid out — Plumbing / Pipes / PVC."
        wide
      >
        <CategoryForm
          categories={allCategories}
          onDone={() => setCreating(false)}
        />
      </Sheet>
    </>
  );
}
