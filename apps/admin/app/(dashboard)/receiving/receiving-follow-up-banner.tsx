"use client";

import Link from "next/link";
import type { Route } from "next";
import { ExternalLink, PackagePlus, X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import type { ReceivingFollowUp } from "./receiving-follow-up";

export function ReceivingFollowUpBanner({
  followUp,
  onDismiss,
}: {
  followUp: ReceivingFollowUp;
  onDismiss: () => void;
}) {
  const hasCatalog = followUp.catalogProducts.length > 0;
  const hasUncatalogued = followUp.uncataloguedItems.length > 0;
  if (!hasCatalog && !hasUncatalogued) return null;

  return (
    <Card className="border-primary/30 bg-primary/5 px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-body font-medium text-ink">Receipt saved</p>
            <p className="mt-0.5 text-caption text-ink-muted">
              Review or finish setting up these products — each link opens in a new tab.
            </p>
          </div>

          {hasCatalog ? (
            <div>
              <p className="text-caption font-medium text-ink-muted">Existing products restocked</p>
              <ul className="mt-1.5 space-y-1">
                {followUp.catalogProducts.map((product) => (
                  <li key={product.id}>
                    <Link
                      href={`/products/${product.id}` as Route}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-body text-primary hover:underline"
                    >
                      {product.name}
                      <ExternalLink size={14} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasUncatalogued ? (
            <div>
              <p className="text-caption font-medium text-ink-muted">New products to set up</p>
              <ul className="mt-1.5 space-y-1">
                {followUp.uncataloguedItems.map((item, index) => (
                  <li key={`${item.name}-${item.sku ?? ""}-${index}`}>
                    <Link
                      href={"/products/new" as Route}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-body text-primary hover:underline"
                    >
                      <PackagePlus size={14} className="shrink-0" />
                      Add {item.name}
                      {item.sku ? ` (${item.sku})` : ""}
                      <ExternalLink size={14} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <Button type="button" variant="ghost" size="sm" icon={X} onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
