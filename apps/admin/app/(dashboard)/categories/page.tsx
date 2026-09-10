"use client";

import { useSearchParams } from "next/navigation";
import { FolderTree } from "lucide-react";
import type { Category } from "@double-a/shared-types";
import { rollupProductCounts, toCategoryOptions } from "@/lib/category-options";
import { matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import { Card, PageHeader, TableSkeleton } from "@/components/ui";
import { CategoriesPanel } from "./categories-panel";
import { useCategories, useCategoryProductCounts } from "@/lib/query/categories";

export default function CategoriesPage() {
  const searchParams = useSearchParams();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });

  const categoriesQuery = useCategories({ includeInactive: true });
  const countsQuery = useCategoryProductCounts({ includeInactive: true });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FolderTree}
        title="Categories"
        description="How the shop is laid out — Plumbing / Pipes / PVC. Products carry the full path, so a rename reaches every one of them."
      />

      {categoriesQuery.isPending || countsQuery.isPending ? (
        <TableSkeleton columns={["w-48", "w-12", ""]} rows={8} />
      ) : categoriesQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {categoriesQuery.error instanceof Error
            ? categoriesQuery.error.message
            : "Could not load categories."}
        </Card>
      ) : (
        <CategoriesBody
          categories={categoriesQuery.data ?? []}
          productCounts={countsQuery.data ?? {}}
          q={q}
          page={page}
        />
      )}
    </div>
  );
}

function CategoriesBody({
  categories,
  productCounts: ownCounts,
  q,
  page,
}: {
  categories: Category[];
  productCounts: Record<string, number>;
  q: string;
  page: number;
}) {
  const options = toCategoryOptions(categories);
  const productCounts = rollupProductCounts(options, ownCounts);

  const filtered = options.filter((category) => matchesQuery([category.name, category.path], q));
  const { pageItems, page: safePage, pageCount, total, pageSize } = paginateItems(filtered, page);

  return (
    <CategoriesPanel
      categories={pageItems}
      allCategories={options}
      productCounts={productCounts}
      query={q}
      page={safePage}
      pageCount={pageCount}
      total={total}
      pageSize={pageSize}
    />
  );
}
