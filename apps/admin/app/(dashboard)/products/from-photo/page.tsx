"use client";

import Link from "next/link";
import { ArrowLeft, Camera } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { toCategoryOptions } from "@/lib/category-options";
import { useCategories } from "@/lib/query/categories";
import { FromPhotoPanel } from "./from-photo-panel";

export default function FromPhotoPage() {
  const categoriesQuery = useCategories({ includeInactive: true });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Camera}
        title="From photo"
        description="Snap a notebook list or delivery note — AI reads each line. Known SKUs restock automatically."
      />

      <Link
        href="/products"
        className="inline-flex items-center gap-1 text-body font-medium text-primary hover:underline"
      >
        <ArrowLeft size={14} />
        Back to products
      </Link>

      {categoriesQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : (
        <FromPhotoPanel categories={toCategoryOptions(categoriesQuery.data ?? [])} />
      )}
    </div>
  );
}
