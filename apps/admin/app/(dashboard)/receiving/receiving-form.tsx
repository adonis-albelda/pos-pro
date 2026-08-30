"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Camera, Expand, Plus, Save, Settings, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { formatQuantity, roundMoney } from "@double-a/shared-types";
import type { Location, PurchaseOrder, PurchaseOrderItem, Supplier } from "@double-a/shared-types";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  CardHeader,
  Combobox,
  ErrorNote,
  Field,
  FileInput,
  IconButton,
  Input,
  MoneyInput,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { AiProcessingOverlay, ConfirmDialog, Dialog, Sheet } from "@/components/overlay";
import { useInvalidateGoodsReceipts } from "@/lib/query/goods-receipts";
import { useInventoryProducts } from "@/lib/query/inventory";
import { extractGoodsReceiptPhotoAction, createGoodsReceiptAction } from "./actions";

interface LineRow {
  key: string;
  name: string;
  sku: string;
  quantityReceived: string;
  unitCost: string;
  productId: string | null;
  matchedBy: "internal" | "supplier" | null;
  existingPrice: number | null;
  existingCostPrice: number | null;
  purchaseOrderItemId: string | null;
  quantityOrdered: number | null;
  appliedPrice: string;
  note: string;
}

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

/** Shrink a phone photo so the server action stays under the body limit. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1.2 * 1024 * 1024) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((next) => resolve(next), "image/jpeg", 0.82),
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

/** Preserves the peso margin: new selling price = new cost + (old price − old cost). */
function suggestPrice(newCost: number, existingPrice: number, existingCostPrice: number): number {
  return roundMoney(newCost + (existingPrice - existingCostPrice));
}

function lineIsFlagged(row: LineRow): boolean {
  if (!row.productId) return true;
  if (row.quantityOrdered !== null) {
    const received = Number(row.quantityReceived) || 0;
    if (Math.abs(received - row.quantityOrdered) > 0.001) return true;
  }
  return false;
}

export function ReceivingForm({
  suppliers,
  locations,
  openPurchaseOrders,
  purchaseOrderId,
  onSelectPurchaseOrder,
  linkedOrder,
  defaultLocationId,
}: {
  suppliers: Supplier[];
  locations: Location[];
  /** Ordered-status POs — the only ones with anything left to receive against. */
  openPurchaseOrders: PurchaseOrder[];
  purchaseOrderId: string;
  onSelectPurchaseOrder: (id: string) => void;
  linkedOrder: (PurchaseOrder & { items: PurchaseOrderItem[] }) | null;
  defaultLocationId: string | null;
}) {
  const router = useRouter();
  const invalidateGoodsReceipts = useInvalidateGoodsReceipts();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [extracting, startExtracting] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoRead, setPhotoRead] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);

  // Preview only, revoked whenever the photo changes or the form unmounts —
  // the file itself isn't sent anywhere until the user chooses to.
  useEffect(() => {
    if (!photo) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const [supplierId, setSupplierId] = useState(linkedOrder?.supplierId ?? "");
  const [supplierName, setSupplierName] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId ?? locations[0]?.id ?? "");
  const [referenceNo, setReferenceNo] = useState(linkedOrder?.referenceNo ?? "");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LineRow[]>([]);

  // Covers picking a PO from the dropdown mid-session, not just the
  // URL-preloaded case the initial useState above already handles.
  useEffect(() => {
    if (!linkedOrder) return;
    setSupplierId(linkedOrder.supplierId);
    setReferenceNo(linkedOrder.referenceNo ?? "");
  }, [linkedOrder]);

  // Full-catalogue walk (listProducts pages through everything) — only worth
  // paying for once there is something to match against: a photo on the way,
  // a supplier/PO picked, or a manual line already added.
  const productsQuery = useInventoryProducts({
    enabled: Boolean(photo) || Boolean(supplierId) || Boolean(linkedOrder) || rows.length > 0,
  });
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function addManualLine() {
    setRows((previous) => [
      ...previous,
      {
        key: newKey(),
        name: "",
        sku: "",
        quantityReceived: "1",
        unitCost: "",
        productId: null,
        matchedBy: null,
        existingPrice: null,
        existingCostPrice: null,
        purchaseOrderItemId: null,
        quantityOrdered: null,
        appliedPrice: "",
        note: "",
      },
    ]);
  }

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((previous) => previous.filter((row) => row.key !== key));
  }

  function pickProductForRow(key: string, productId: string) {
    const product = productsById.get(productId);
    if (!product) return;
    updateRow(key, {
      productId: product.id,
      name: product.name,
      sku: product.sku ?? "",
      matchedBy: "internal",
      existingPrice: product.price,
      existingCostPrice: product.costPrice,
    });
  }

  /** Only stages the file for preview — AI extraction is a separate, explicit step below. */
  function handlePhotoChange(file: File | null) {
    setPhoto(file);
    setPhotoRead(false);
    setError(null);
  }

  function removePhoto() {
    setPhoto(null);
    setPhotoRead(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function runExtraction() {
    if (!photo) return;

    setError(null);
    startExtracting(async () => {
      const compressed = await compressImage(photo);
      const formData = new FormData();
      formData.set("photo", compressed);
      if (linkedOrder) formData.set("purchase_order_id", linkedOrder.id);

      const result = await extractGoodsReceiptPhotoAction(formData);
      if (result.error) {
        if (result.quotaExceeded) {
          setQuotaMessage(result.error);
        } else {
          setError(result.error);
        }
        return;
      }

      const extractedRows: LineRow[] = result.lines.map((line) => {
        const unitCost = line.unitCost ?? 0;
        const appliedPrice =
          line.existingPrice !== null && line.existingCostPrice !== null
            ? suggestPrice(unitCost, line.existingPrice, line.existingCostPrice)
            : null;

        return {
          key: newKey(),
          name: line.name,
          sku: line.sku ?? "",
          quantityReceived: line.quantityReceived !== null ? String(line.quantityReceived) : "1",
          unitCost: line.unitCost !== null ? String(line.unitCost) : "",
          productId: line.productId,
          matchedBy: line.matchedBy,
          existingPrice: line.existingPrice,
          existingCostPrice: line.existingCostPrice,
          purchaseOrderItemId: line.purchaseOrderItemId,
          quantityOrdered: line.quantityOrdered,
          appliedPrice: appliedPrice !== null ? String(appliedPrice) : "",
          note: "",
        };
      });

      setPhotoRead(true);
      setRows((previous) => [...previous, ...extractedRows]);
    });
  }

  function requestSubmit() {
    setError(null);

    if (!locationId) {
      setError("Pick which branch this delivery landed at.");
      return;
    }
    if (!linkedOrder && !supplierId && !supplierName.trim()) {
      setError("Pick a supplier, or type one in for an ad-hoc delivery.");
      return;
    }
    if (rows.filter((row) => row.name.trim() && Number(row.quantityReceived) > 0).length === 0) {
      setError("Add at least one item — upload a photo or add a line manually.");
      return;
    }

    setConfirmOpen(true);
  }

  function submit() {
    const cleanRows = rows.filter((row) => row.name.trim() && Number(row.quantityReceived) > 0);
    if (cleanRows.length === 0) {
      setConfirmOpen(false);
      setError("Add at least one item — upload a photo or add a line manually.");
      return;
    }

    const items = cleanRows.map((row) => ({
      name: row.name.trim(),
      sku: row.sku.trim() || null,
      quantityReceived: Number(row.quantityReceived) || 0,
      unitCost: Number(row.unitCost) || 0,
      productId: row.productId,
      matchedBy: row.matchedBy,
      purchaseOrderItemId: row.purchaseOrderItemId,
      quantityOrdered: row.quantityOrdered,
      appliedPrice: row.appliedPrice.trim() ? Number(row.appliedPrice) : null,
      isFlagged: lineIsFlagged(row),
      note: row.note.trim() || null,
    }));

    const formData = new FormData();
    formData.set("location_id", locationId);
    if (linkedOrder) {
      formData.set("purchase_order_id", linkedOrder.id);
      formData.set("supplier_id", linkedOrder.supplierId);
    } else if (supplierId) {
      formData.set("supplier_id", supplierId);
    } else {
      formData.set("supplier_name", supplierName.trim());
    }
    if (referenceNo.trim()) formData.set("reference_no", referenceNo.trim());
    if (notes.trim()) formData.set("notes", notes.trim());
    if (photo) formData.set("photo", photo);
    formData.set("items_json", JSON.stringify(items));

    startSaving(async () => {
      const result = await createGoodsReceiptAction(formData);
      setConfirmOpen(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      invalidateGoodsReceipts();
      router.push(
        (linkedOrder ? `/purchase-orders/${linkedOrder.id}` : "/receiving") as Route,
      );
    });
  }

  return (
    <div className="space-y-6">
      <AiProcessingOverlay open={extracting} message="Reading the delivery receipt" />

      <Dialog
        open={quotaMessage !== null}
        onClose={() => setQuotaMessage(null)}
        title="Weekly AI reads used up"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 p-3">
            <Sparkles size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-warning-ink" />
            <p className="text-body text-ink">{quotaMessage}</p>
          </div>
          <div className="flex items-start gap-3 text-caption text-ink-muted">
            <Settings size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
            <p>
              Go to <span className="font-medium text-ink">Settings → AI</span> and turn it on to
              keep reading receipt photos at the per-request rate. You can still add lines
              manually below without it.
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setQuotaMessage(null)}>
              Add lines manually
            </Button>
            <Link href={"/settings" as Route} className={buttonClass("primary", "md")}>
              <Settings size={16} strokeWidth={2} />
              Open Settings
            </Link>
          </div>
        </div>
      </Dialog>

      <Sheet
        open={photoSheetOpen}
        onClose={() => setPhotoSheetOpen(false)}
        title="Delivery receipt photo"
        description="Uploaded, not yet saved — check it's legible before reading it with AI."
        wide
      >
        {photoPreviewUrl ? (
          <img
            src={photoPreviewUrl}
            alt="Delivery receipt, full size"
            className="w-full rounded-md border border-border object-contain"
          />
        ) : null}
      </Sheet>

      <div className="rounded-md border border-border bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="space-y-4 lg:basis-3/5">
            <div>
              <h3 className="text-heading-sm font-semibold">Delivery details</h3>
              <p className="mt-1 text-caption text-ink-muted">
                Who it&rsquo;s from, where it landed, and any reference.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {linkedOrder ? (
                <Field label="Supplier">
                  <Input
                    value={suppliers.find((s) => s.id === linkedOrder.supplierId)?.name ?? "—"}
                    disabled
                  />
                </Field>
              ) : (
                <Field label="Supplier" hint="Pick one, or type a name for an ad-hoc delivery.">
                  <Combobox
                    value={supplierId}
                    onChange={(value) => {
                      setSupplierId(value);
                      if (value) setSupplierName("");
                    }}
                    options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                    placeholder="Search suppliers…"
                  />
                </Field>
              )}
              {!linkedOrder ? (
                <Field label="Or supplier name" required={false} hint="Only if not in the list above.">
                  <Input
                    value={supplierName}
                    onChange={(event) => {
                      setSupplierName(event.target.value);
                      if (event.target.value) setSupplierId("");
                    }}
                    placeholder="Walk-in supplier"
                  />
                </Field>
              ) : null}
              <Field label="Received at" required>
                <Combobox
                  value={locationId}
                  onChange={setLocationId}
                  options={locations.map((l) => ({ value: l.id, label: l.name }))}
                  placeholder="Search branches…"
                />
              </Field>
              <Field
                label="Link to purchase order"
                required={false}
                hint="Only orders still marked “ordered” show up here."
              >
                <div className="flex gap-2 w-full">
                  <Combobox
                    className="w-full"
                    value={purchaseOrderId}
                    onChange={onSelectPurchaseOrder}
                    options={openPurchaseOrders.map((po) => ({
                      value: po.id,
                      label: po.referenceNo || `PO ${po.id.slice(0, 8)}`,
                      sublabel: po.orderDate,
                    }))}
                    placeholder="Search open purchase orders…"
                    emptyLabel="No purchase orders are in “ordered” status."
                  />
                  {purchaseOrderId ? (
                    <IconButton
                      icon={X}
                      label="Unlink purchase order"
                      onClick={() => {
                        onSelectPurchaseOrder("");
                        setSupplierId("");
                        setReferenceNo("");
                      }}
                    />
                  ) : null}
                </div>
              </Field>
              <Field
                label="Reference no."
                hint="Delivery/invoice number, optional — separate from a linked PO's own reference."
                required={false}
              >
                <Input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} />
              </Field>
            </div>
            <Field label="Notes" hint="Discrepancies, damage, anything worth flagging." required={false}>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
              />
            </Field>
          </div>

          <div className="hidden w-px shrink-0 bg-border lg:block" />

          <div className="space-y-4 lg:basis-2/5">
            <div>
              <h3 className="text-heading-sm font-semibold">Receipt photo</h3>
              <p className="mt-1 text-caption text-ink-muted">
                Optional — upload, review, then let AI read the line items.
              </p>
            </div>
            <Field label="Photo of the receipt / invoice" required={false}>
              <FileInput
                ref={fileInputRef}
                accept="image/*"
                capture="environment"
                onChange={(event) => handlePhotoChange(event.target.files?.[0] ?? null)}
              />
            </Field>

            {photoPreviewUrl ? (
              <div className="space-y-3 rounded-md border border-border bg-canvas p-3">
                <button
                  type="button"
                  onClick={() => setPhotoSheetOpen(true)}
                  className="group relative block w-full cursor-pointer"
                >
                  <img
                    src={photoPreviewUrl}
                    alt="Delivery receipt preview"
                    className="h-40 w-full rounded-sm border border-border object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center rounded-sm bg-ink/0 text-transparent transition-colors group-hover:bg-ink/40 group-hover:text-white">
                    <Expand size={18} strokeWidth={2} />
                  </span>
                </button>
                <p className="text-caption text-ink-muted">
                  {photoRead
                    ? "Read — lines added below. Adjust anything before saving."
                    : "Check this is the right photo, in focus and right-side up, before sending it to AI."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    icon={Sparkles}
                    loading={extracting}
                    onClick={runExtraction}
                  >
                    {extracting ? "Reading…" : photoRead ? "Read again" : "Read with AI"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Expand}
                    onClick={() => setPhotoSheetOpen(true)}
                  >
                    View full size
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={X}
                    onClick={removePhoto}
                    disabled={extracting}
                  >
                    Remove photo
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 text-caption text-ink-muted">
                <Camera size={13} />
                Upload a photo, review it, then send it to AI to read the line items.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className={linkedOrder ? "grid gap-6 lg:grid-cols-2" : ""}>
        {linkedOrder ? (
          <Card>
            <CardHeader title="Purchase order" description="What was ordered." />
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th numeric>Ordered</Th>
                  <Th numeric>Received so far</Th>
                </tr>
              </thead>
              <tbody>
                {linkedOrder.items.map((item) => (
                  <tr key={item.id}>
                    <Td className="font-medium">{item.productName}</Td>
                    <Td numeric>{formatQuantity(item.quantityOrdered)}</Td>
                    <Td numeric>{formatQuantity(item.quantityReceived)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Items received"
            description="From the photo, or added manually."
            action={
              <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addManualLine}>
                Add line
              </Button>
            }
          />
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-body text-ink-muted sm:px-6">
              Upload a photo above, or add a line manually.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th numeric>Qty</Th>
                  <Th numeric>Unit cost</Th>
                  <Th numeric>New price</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const flagged = lineIsFlagged(row);
                  return (
                    <tr key={row.key}>
                      <Td>
                        <Input
                          value={row.name}
                          onChange={(event) => updateRow(row.key, { name: event.target.value })}
                          placeholder="Item name"
                          className="mb-1"
                        />
                        {row.productId ? (
                          <Combobox
                            value={row.productId}
                            onChange={(productId) => pickProductForRow(row.key, productId)}
                            options={products.map((p) => ({
                              value: p.id,
                              label: p.name,
                              sublabel: p.sku ?? undefined,
                            }))}
                          />
                        ) : (
                          <Combobox
                            value=""
                            onChange={(productId) => pickProductForRow(row.key, productId)}
                            options={products.map((p) => ({
                              value: p.id,
                              label: p.name,
                              sublabel: p.sku ?? undefined,
                            }))}
                            placeholder="Match a catalogue product…"
                          />
                        )}
                      </Td>
                      <Td numeric>
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="num text-right"
                          value={row.quantityReceived}
                          onChange={(event) =>
                            updateRow(row.key, { quantityReceived: event.target.value })
                          }
                        />
                        {row.quantityOrdered !== null ? (
                          <p className="mt-1 text-caption text-ink-muted">
                            Ordered {formatQuantity(row.quantityOrdered)}
                          </p>
                        ) : null}
                      </Td>
                      <Td numeric>
                        <MoneyInput
                          type="number"
                          min="0"
                          step="0.01"
                          className="text-right"
                          value={row.unitCost}
                          onChange={(event) => {
                            const unitCost = Number(event.target.value) || 0;
                            const nextAppliedPrice =
                              row.existingPrice !== null && row.existingCostPrice !== null
                                ? String(suggestPrice(unitCost, row.existingPrice, row.existingCostPrice))
                                : row.appliedPrice;
                            updateRow(row.key, {
                              unitCost: event.target.value,
                              appliedPrice: nextAppliedPrice,
                            });
                          }}
                        />
                      </Td>
                      <Td numeric>
                        <MoneyInput
                          type="number"
                          min="0"
                          step="0.01"
                          className="text-right"
                          value={row.appliedPrice}
                          onChange={(event) =>
                            updateRow(row.key, { appliedPrice: event.target.value })
                          }
                          disabled={!row.productId}
                        />
                      </Td>
                      <Td>
                        {!row.productId ? (
                          <Badge tone="neutral">Not yet in catalogue</Badge>
                        ) : flagged ? (
                          <Badge tone="warning">Review</Badge>
                        ) : (
                          <Badge tone="success">In catalogue</Badge>
                        )}
                        {flagged ? (
                          <Input
                            value={row.note}
                            onChange={(event) => updateRow(row.key, { note: event.target.value })}
                            placeholder="Note (e.g. short by 2)"
                            className="mt-1"
                          />
                        ) : null}
                      </Td>
                      <Td>
                        <div className="flex justify-end">
                          <IconButton
                            icon={Trash2}
                            label="Remove line"
                            tone="danger"
                            onClick={() => removeRow(row.key)}
                          />
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {rows.some((row) => lineIsFlagged(row)) ? (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-caption text-warning-ink">
          <TriangleAlert size={16} />
          Some lines need review — they still save, but are flagged on the receipt.
        </div>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="sticky bottom-0 z-10 rounded-md border border-border bg-surface px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:px-6">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() =>
              router.push((linkedOrder ? `/purchase-orders/${linkedOrder.id}` : "/purchase-orders") as Route)
            }
          >
            Cancel
          </Button>
          <Button icon={Save} loading={saving} onClick={requestSubmit} className="w-full sm:w-auto">
            {saving ? "Saving..." : "Save receipt"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        pending={saving}
        title="Save this receipt?"
        description={
          rows.some((row) => lineIsFlagged(row))
            ? "This restocks matched items and can adjust their prices. Some lines are flagged for review — they still save. You can't undo it from here."
            : "This restocks matched items and can adjust their prices. You can't undo it from here."
        }
        confirmLabel="Save receipt"
        confirmIcon={Save}
      />
    </div>
  );
}
