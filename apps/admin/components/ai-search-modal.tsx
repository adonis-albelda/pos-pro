"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { ApiError } from "@double-a/api-client";
import { vectorSearchProducts } from "@double-a/api-client/queries";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { Dialog } from "@/components/overlay";
import { getBrowserApiClient } from "@/lib/api/browser-client";

type Phase = "input" | "processing" | "error";

/**
 * Meaning-based product search that filters the sale grid — mirrors the
 * mobile POS's smart search (apps/mobile/components/ai-search-modal.tsx),
 * unlike the pick-one variant (ai-search-dialog.tsx) used by ProductPicker
 * form fields elsewhere. Same `/products/vector-search` endpoint.
 */
export function AiSearchModal({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (productIds: string[], label: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("input");
  const [term, setTerm] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("input");
    setTerm("");
    setErrorMessage(null);
  }, [open]);

  async function submit() {
    const needle = term.trim();
    if (!needle) return;

    setPhase("processing");

    try {
      const results = await vectorSearchProducts(getBrowserApiClient(), needle);
      if (results.length === 0) {
        setPhase("error");
        setErrorMessage("Nothing matched that. Try different words.");
        return;
      }
      onResult(results.map((r) => r.id), needle);
      onClose();
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
      ) : (
        <div className="space-y-4">
          <Field label="What are you looking for?" required={false}>
            <Input
              icon={Search}
              autoFocus
              value={term}
              placeholder="e.g. “blue paint for wood”"
              autoComplete="off"
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
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
