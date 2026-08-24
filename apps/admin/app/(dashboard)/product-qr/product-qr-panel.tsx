"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Printer,
  QrCode,
  Search,
  Square,
  X,
} from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
} from "@/components/ui";

export type QrProduct = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  categoryId: string | null;
};

type PaperSize = "a4" | "legal";

const PAPER: Record<
  PaperSize,
  { label: string; widthMm: number; heightMm: number; css: string }
> = {
  a4: { label: "A4 (210 × 297 mm)", widthMm: 210, heightMm: 297, css: "A4" },
  legal: {
    label: "Legal (8.5 × 14 in)",
    widthMm: 216,
    heightMm: 356,
    css: "legal",
  },
};

/** One page holds this many labels; extra copies past it are dropped with a warning. */
const MAX_LABELS = 48;

type SizeMode = "auto" | "sm" | "md" | "lg";

/**
 * Fixed label sizes hold the same physical cell no matter how many print —
 * 5 codes come out the same size as 40. `auto` keeps the old fit-to-page
 * behaviour. `cellAspect` is width / height of one cell.
 */
const LABEL_SIZE: Record<
  Exclude<SizeMode, "auto">,
  { label: string; cols: number; qrWidth: number; skuPx: number; cellAspect: number }
> = {
  sm: { label: "Small", cols: 6, qrWidth: 160, skuPx: 9, cellAspect: 0.82 },
  md: { label: "Medium", cols: 4, qrWidth: 224, skuPx: 11, cellAspect: 0.85 },
  lg: { label: "Large", cols: 3, qrWidth: 288, skuPx: 13, cellAspect: 0.88 },
};

/** Columns that fit cleanly on band/label paper for the chosen count. */
function gridFor(count: number): { cols: number; rows: number } {
  if (count <= 8) return { cols: 2, rows: Math.ceil(count / 2) };
  if (count <= 12) return { cols: 3, rows: Math.ceil(count / 3) };
  if (count <= 20) return { cols: 4, rows: Math.ceil(count / 4) };
  if (count <= 30) return { cols: 5, rows: Math.ceil(count / 5) };
  return { cols: 6, rows: Math.ceil(count / 6) };
}

/**
 * Cell type and QR share shrink as more labels crowd the page, and again
 * when the longest SKU on the sheet is long — full string stays readable,
 * never truncated.
 */
function cellScale(count: number, maxSkuLen: number): {
  skuPx: number;
  qrMax: string;
  qrWidth: number;
} {
  let skuPx: number;
  let qrMax: string;
  let qrWidth: number;

  if (count <= 4) {
    skuPx = 15;
    qrMax = "74%";
    qrWidth = 320;
  } else if (count <= 8) {
    skuPx = 13;
    qrMax = "70%";
    qrWidth = 288;
  } else if (count <= 12) {
    skuPx = 12;
    qrMax = "66%";
    qrWidth = 256;
  } else if (count <= 20) {
    skuPx = 11;
    qrMax = "62%";
    qrWidth = 224;
  } else if (count <= 30) {
    skuPx = 10;
    qrMax = "58%";
    qrWidth = 192;
  } else {
    skuPx = 9;
    qrMax = "54%";
    qrWidth = 160;
  }

  if (maxSkuLen > 28) skuPx = Math.max(7, skuPx - 3);
  else if (maxSkuLen > 20) skuPx = Math.max(7, skuPx - 2);
  else if (maxSkuLen > 14) skuPx = Math.max(8, skuPx - 1);

  return { skuPx, qrMax, qrWidth };
}

const MAX_COPIES = 48;

type CodeType = "qr" | "barcode";

export function ProductQrPanel({
  products,
  categories,
  query,
  onQueryChange,
  categoryId,
  onCategoryChange,
  page,
  pageCount,
  total,
  onPageChange,
  pageLoading,
}: {
  products: QrProduct[];
  categories: { id: string; label: string }[];
  query: string;
  onQueryChange: (query: string) => void;
  categoryId: string;
  onCategoryChange: (categoryId: string) => void;
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
  pageLoading: boolean;
}) {
  const [codeType, setCodeType] = useState<CodeType>("qr");
  const [paper, setPaper] = useState<PaperSize>("a4");
  const [sizeMode, setSizeMode] = useState<SizeMode>("md");
  // id -> sku + number of copies. Captured at selection time rather than
  // joined back against `products` — that's only the current page, and a
  // selection made on an earlier page must survive paging forward.
  const [selected, setSelected] = useState<Record<string, { sku: string; copies: number }>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const selectedIds = useMemo(() => Object.keys(selected), [selected]);

  /** Flatten each selected product into its copies, in selection order. */
  const labels = useMemo(() => {
    const out: { key: string; id: string; sku: string }[] = [];
    for (const [id, entry] of Object.entries(selected)) {
      const copies = Math.max(1, entry.copies);
      for (let i = 0; i < copies; i += 1) {
        out.push({ key: `${id}#${i}`, id, sku: entry.sku });
      }
    }
    return out;
  }, [selected]);

  const overflow = labels.length > MAX_LABELS;
  const pageLabels = overflow ? labels.slice(0, MAX_LABELS) : labels;

  const paperSpec = PAPER[paper];
  const fixed = sizeMode === "auto" ? null : LABEL_SIZE[sizeMode];
  const maxSkuLen = useMemo(
    () => pageLabels.reduce((max, label) => Math.max(max, label.sku.length), 0),
    [pageLabels],
  );

  const autoGrid = gridFor(pageLabels.length);
  const autoScale = cellScale(pageLabels.length || 1, maxSkuLen);

  const cols = fixed ? fixed.cols : autoGrid.cols;
  const rows = Math.max(1, Math.ceil(pageLabels.length / cols));
  // Long SKUs still shrink type in fixed mode so nothing truncates.
  const skuShrink = maxSkuLen > 28 ? 3 : maxSkuLen > 20 ? 2 : maxSkuLen > 14 ? 1 : 0;
  const scale = fixed
    ? {
        skuPx: Math.max(7, fixed.skuPx - skuShrink),
        qrMax: "82%",
        qrWidth: fixed.qrWidth,
      }
    : autoScale;

  useEffect(() => {
    let cancelled = false;

    async function build() {
      setBusy(true);
      const next: Record<string, string> = {};
      const entries = Object.entries(selected);
      // One code per distinct product; copies reuse the same image.
      if (codeType === "qr") {
        await Promise.all(
          entries.map(async ([id, entry]) => {
            next[id] = await QRCode.toDataURL(entry.sku, {
              errorCorrectionLevel: "M",
              // 4-module quiet zone (the spec minimum) — at margin:1 the
              // code printed almost edge-to-edge and a camera scanner
              // (MLKit) couldn't lock onto it reliably; a barcode's own
              // margin:4 quiet zone right below is why that one scans fine.
              margin: 4,
              width: scale.qrWidth,
              color: { dark: "#1a1a1a", light: "#ffffff" },
            });
          }),
        );
      } else {
        // CODE128, not EAN/UPC — a SKU is an arbitrary alphanumeric string,
        // not a fixed-length numeric retail code. Text is rendered
        // separately below the image already, so displayValue stays off.
        for (const [id, entry] of entries) {
          const canvas = document.createElement("canvas");
          try {
            JsBarcode(canvas, entry.sku, {
              format: "CODE128",
              width: 2,
              height: scale.qrWidth * 0.45,
              margin: 4,
              displayValue: false,
              background: "#ffffff",
              lineColor: "#1a1a1a",
            });
            next[id] = canvas.toDataURL();
          } catch {
            // A SKU with characters CODE128 can't encode — skip it rather
            // than crash the whole sheet; the cell shows "…" instead.
          }
        }
      }
      if (!cancelled) {
        setCodes(next);
        setBusy(false);
      }
    }

    void build();
    return () => {
      cancelled = true;
    };
  }, [selected, scale.qrWidth, codeType]);

  function toggle(product: QrProduct) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[product.id] !== undefined) delete next[product.id];
      else next[product.id] = { sku: product.sku, copies: 1 };
      return next;
    });
  }

  function setCopies(id: string, value: number) {
    const copies = Math.min(MAX_COPIES, Math.max(1, value || 1));
    setSelected((prev) => {
      const entry = prev[id];
      if (!entry) return prev;
      return { ...prev, [id]: { ...entry, copies } };
    });
  }

  function selectAllOnPage() {
    setSelected((prev) => {
      const next = { ...prev };
      for (const product of products) {
        if (next[product.id] === undefined) {
          next[product.id] = { sku: product.sku, copies: 1 };
        }
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected({});
  }

  function printSheet() {
    window.print();
  }

  const selectedCount = selectedIds.length;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * { visibility: hidden !important; }
              #product-qr-print, #product-qr-print * { visibility: visible !important; }
              #product-qr-print {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                height: auto !important;
                margin: 0 !important;
                padding: 8mm !important;
                background: white !important;
                box-shadow: none !important;
                border: none !important;
                aspect-ratio: auto !important;
              }
              @page { size: ${paperSpec.css}; margin: 8mm; }
            }
          `,
        }}
      />

      <Card>
        <CardHeader
          icon={QrCode}
          title="Pick products"
          description="Search by name or SKU, filter by category, then choose how many labels of each."
        />
        <div className="grid gap-4 px-4 py-5 sm:grid-cols-2 lg:grid-cols-5 sm:px-6">
          <Field label="Code type" hint="What gets printed on each label.">
            <Select
              value={codeType}
              onChange={(event) => setCodeType(event.target.value as CodeType)}
            >
              <option value="qr">QR code</option>
              <option value="barcode">Barcode (CODE128)</option>
            </Select>
          </Field>
          <Field label="Search" hint="Matches product name or SKU.">
            <Input
              icon={Search}
              type="search"
              placeholder="Name or SKU…"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </Field>
          <Field label="Category" hint="Filter to one batch, or all.">
            <Select
              value={categoryId}
              onChange={(event) => onCategoryChange(event.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Label size" hint="Fixed = same size at any count.">
            <Select
              value={sizeMode}
              onChange={(event) => setSizeMode(event.target.value as SizeMode)}
            >
              <option value="sm">{LABEL_SIZE.sm.label}</option>
              <option value="md">{LABEL_SIZE.md.label}</option>
              <option value="lg">{LABEL_SIZE.lg.label}</option>
              <option value="auto">Auto (fit page)</option>
            </Select>
          </Field>
          <Field label="Paper size">
            <Select
              value={paper}
              onChange={(event) => setPaper(event.target.value as PaperSize)}
            >
              <option value="a4">{PAPER.a4.label}</option>
              <option value="legal">{PAPER.legal.label}</option>
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            icon={CheckSquare}
            onClick={selectAllOnPage}
            disabled={products.length === 0}
          >
            Select all on page ({products.length})
          </Button>
          <Button
            type="button"
            variant="ghost"
            icon={X}
            onClick={clearSelection}
            disabled={selectedCount === 0}
          >
            Clear
          </Button>
          <span className="ml-auto text-caption text-ink-muted">
            {selectedCount} selected · {labels.length} labels
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto border-t border-border">
          {products.length === 0 ? (
            <div className="px-4 py-8 sm:px-6">
              <EmptyState
                icon={Search}
                title="No products match"
                instruction="Clear the search or pick another category."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {products.map((product) => {
                const isSelected = selected[product.id] !== undefined;
                return (
                  <li
                    key={product.id}
                    className="flex items-center gap-3 px-4 py-2.5 sm:px-6"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(product)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      {isSelected ? (
                        <CheckSquare size={18} className="shrink-0 text-primary" />
                      ) : (
                        <Square size={18} className="shrink-0 text-ink-muted" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium">
                          {product.name}
                        </span>
                        <span className="num block truncate text-caption text-ink-muted">
                          {product.sku}
                          {product.category ? ` · ${product.category}` : ""}
                        </span>
                      </span>
                    </button>
                    {isSelected ? (
                      <label className="flex shrink-0 items-center gap-1.5 text-caption text-ink-muted">
                        copies
                        <Input
                          type="number"
                          min={1}
                          max={MAX_COPIES}
                          value={selected[product.id]?.copies ?? 1}
                          onChange={(event) =>
                            setCopies(product.id, Number(event.target.value))
                          }
                          className="num h-9 w-16"
                        />
                      </label>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {pageCount > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={ChevronLeft}
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || pageLoading}
            >
              Previous
            </Button>
            <span className="text-caption text-ink-muted">
              Page {page} of {pageCount} · {total} products
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={ChevronRight}
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount || pageLoading}
            >
              Next
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-4 sm:px-6">
          <Button
            type="button"
            icon={Printer}
            onClick={printSheet}
            disabled={pageLabels.length === 0 || busy}
          >
            Print sheet ({pageLabels.length})
          </Button>
          <p className="text-caption text-ink-muted">
            Grid {cols}×{rows}
            {busy ? " · generating QR…" : ""}.
            {overflow
              ? ` One page holds ${MAX_LABELS} — printing the first ${MAX_LABELS} of ${labels.length}.`
              : ""}
          </p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={Printer}
          title="Band paper preview"
          description={`${paperSpec.label} — what comes out of the printer.`}
        />
        <div className="flex justify-center bg-paper/80 px-4 py-6 sm:px-6">
          {pageLabels.length === 0 ? (
            <EmptyState
              icon={QrCode}
              title="Nothing to print"
              instruction="Select at least one product above."
            />
          ) : (
            <div
              className="origin-top shadow-md"
              style={{
                // Scale the physical page into the viewport while keeping mm proportions.
                width: "min(100%, 420px)",
              }}
            >
              <div
                id="product-qr-print"
                className="box-border bg-white text-ink"
                style={{
                  aspectRatio: `${paperSpec.widthMm} / ${paperSpec.heightMm}`,
                  width: "100%",
                  padding: "3%",
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  // Fixed sizes flow from the top with same-size cells; auto fills the page.
                  ...(fixed
                    ? { gridAutoRows: "min-content", alignContent: "start" }
                    : { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }),
                  gap: "1.5%",
                  border: "1px dashed #c4c0b5",
                }}
              >
                {pageLabels.map((label) => (
                  <div
                    key={label.key}
                    className="flex min-h-0 flex-col items-center justify-center gap-1 overflow-hidden border border-border/70 px-1 py-1 text-center"
                    style={fixed ? { aspectRatio: fixed.cellAspect } : undefined}
                  >
                    {codes[label.id] ? (
                      <img
                        src={codes[label.id]}
                        alt={`${codeType === "qr" ? "QR code" : "Barcode"} for ${label.sku}`}
                        className="h-auto w-[78%] object-contain"
                        style={{ maxHeight: scale.qrMax }}
                      />
                    ) : (
                      <div
                        className="flex aspect-square w-[78%] items-center justify-center bg-paper text-[10px] text-ink-muted"
                        style={{ maxHeight: scale.qrMax }}
                      >
                        …
                      </div>
                    )}
                    <span
                      className="num w-full px-0.5 font-semibold leading-tight"
                      style={{
                        fontSize: `${scale.skuPx}px`,
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      {label.sku}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-center text-caption text-ink-muted">
                {paperSpec.widthMm} × {paperSpec.heightMm} mm preview
              </p>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
