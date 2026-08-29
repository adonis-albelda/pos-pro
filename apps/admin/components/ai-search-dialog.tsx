"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { ApiError } from "@double-a/api-client";
import { listProductsByIds, vectorSearchProducts } from "@double-a/api-client/queries";
import type { Product } from "@double-a/shared-types";
import { formatQuantity } from "@double-a/shared-types";
import { Button, ErrorNote, Field, Money, Textarea } from "@/components/ui";
import { Dialog } from "@/components/overlay";
import { getBrowserApiClient } from "@/lib/api/browser-client";

type Phase = "input" | "processing" | "results" | "error";

/**
 * Meaning-based product search — types a query, the server embeds it
 * (Laravel AI / OpenAI) and ranks the company's catalogue by similarity.
 * Mirrors the mobile POS's smart search (same `/products/vector-search`
 * endpoint); this picks one product for a sale line rather than filtering a
 * grid, since that's what a form field needs.
 */
export function AiSearchDialog({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
}) {
  const [phase, setPhase] = useState<Phase>("input");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("input");
    setTerm("");
    setResults([]);
    setErrorMessage(null);
  }, [open]);

  async function submit() {
    const needle = term.trim();
    if (!needle) return;

    setPhase("processing");

    try {
      const client = getBrowserApiClient();
      const ranked = await vectorSearchProducts(client, needle);
      if (ranked.length === 0) {
        setPhase("error");
        setErrorMessage("Nothing matched that. Try different words.");
        return;
      }

      const products = await listProductsByIds(
        client,
        ranked.map((r) => r.id),
      );
      const byId = new Map(products.map((p) => [p.id, p]));
      const ordered = ranked
        .map((r) => byId.get(r.id))
        .filter((p): p is Product => p !== undefined);

      setResults(ordered);
      setPhase("results");
    } catch (cause) {
      setPhase("error");
      setErrorMessage(
        cause instanceof ApiError
          ? cause.message
          : "Could not reach the server. Check the connection and try again.",
      );
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Smart search"
      description="Describe what you're looking for — brand, use, or a rough name."
    >
      {phase === "processing" ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 size={32} className="animate-spin text-primary" strokeWidth={2} />
          <p className="text-body-lg font-semibold text-ink">AI is processing the request</p>
          <p className="text-body text-ink-muted">Matching &ldquo;{term.trim()}&rdquo; against the catalogue…</p>
        </div>
      ) : phase === "error" ? (
        <div className="space-y-4">
          <ErrorNote>{errorMessage}</ErrorNote>
          <div className="flex gap-2">
            <Button type="button" onClick={() => setPhase("input")} className="flex-1">
              Try again
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      ) : phase === "results" ? (
        <div className="space-y-3">
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(product);
                    onClose();
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 text-left transition-colors hover:bg-paper"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body font-medium">{product.name}</span>
                    <span className="block truncate text-caption text-ink-muted">
                      {product.sku ? <span className="num">{product.sku}</span> : "No SKU"}
                      {product.category ? ` · ${product.category}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <Money value={product.price} className="text-body font-medium" />
                    <span className="num text-caption text-ink-muted">
                      {formatQuantity(product.stockQuantity)} {product.unit}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="secondary" onClick={() => setPhase("input")} className="w-full">
            Search again
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="What are you looking for?" required={false}>
            <Textarea
              autoFocus
              rows={4}
              value={term}
              placeholder="e.g. “blue paint for wood”"
              autoComplete="off"
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
          </Field>
          <Button
            type="button"
            icon={Sparkles}
            disabled={!term.trim()}
            onClick={() => void submit()}
            className="w-full"
          >
            Search
          </Button>
        </div>
      )}
    </Dialog>
  );
}
