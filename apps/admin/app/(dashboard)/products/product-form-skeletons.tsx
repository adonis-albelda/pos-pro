import { Card, Skeleton } from "@/components/ui";

/** One FormSection-shaped block — title + two-column field placeholders. */
export function ProductSectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4 sm:p-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact block for a gated field cluster (photos, stock table, suppliers). */
export function ProductBlockSkeleton({ className }: { className?: string }) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-3 w-48 max-w-full" />
    </div>
  );
}

/** Tab panel body while that tab's queries resolve. */
export function ProductTabSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
      </div>
      {Array.from({ length: sections }).map((_, index) => (
        <ProductSectionSkeleton key={index} rows={index === 0 ? 4 : 2} />
      ))}
    </div>
  );
}

/** Full edit/new product page shell before product/categories arrive. */
export function ProductPageSkeleton({ withStats = false }: { withStats?: boolean }) {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-48 max-w-full" />
      </header>

      {withStats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="space-y-3 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-32" />
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-border px-2 pt-1">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="m-1 h-9 w-20" />
          ))}
        </div>
        <div className="grid items-start gap-6 p-4 sm:p-6 lg:grid-cols-2">
          <div className="space-y-6">
            <ProductSectionSkeleton rows={3} />
            <ProductSectionSkeleton rows={2} />
          </div>
          <div className="space-y-6">
            <ProductSectionSkeleton rows={4} />
            <ProductSectionSkeleton rows={2} />
          </div>
        </div>
      </Card>
    </div>
  );
}

/** List/table rows for inventory-style tabs. */
export function ProductRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-4 py-4 sm:px-6">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
