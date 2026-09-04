"use client";

import { useState } from "react";
import { Layers, Plus, Sparkles, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@double-a/shared-types";
import type { CompanyAttribute, ProductVariant } from "@double-a/api-client/queries";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Combobox,
  Field,
  IconButton,
  Input,
  MoneyInput,
  Table,
  Td,
  Th,
} from "@/components/ui";
import {
  useAttachProductAttribute,
  useCompanyAttributes,
  useCreateCompanyAttribute,
  useCreateCompanyAttributeValue,
  useDeleteCompanyAttributeValue,
  useDeleteProductVariant,
  useDetachProductAttribute,
  useGenerateProductVariants,
  useProductAttributes,
  useProductVariants,
  useUpdateProductVariant,
} from "@/lib/query/attributes";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function AttributeValueBadge({
  value,
  onRemove,
}: {
  value: { id: string; value: string };
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-canvas px-2 text-caption">
      {value.value}
      <button type="button" onClick={onRemove} aria-label={`Remove ${value.value}`} className="text-ink-muted hover:text-danger">
        <X size={12} strokeWidth={2} />
      </button>
    </span>
  );
}

function AttachedAttributeCard({ productId, attribute }: { productId: string; attribute: CompanyAttribute }) {
  const [newValue, setNewValue] = useState("");
  const createValue = useCreateCompanyAttributeValue();
  const deleteValue = useDeleteCompanyAttributeValue();
  const detach = useDetachProductAttribute(productId);

  function addValue() {
    const value = newValue.trim();
    if (!value) return;
    createValue.mutate(
      { attributeId: attribute.id, value },
      {
        onSuccess: () => setNewValue(""),
        onError: (error) => toast.error(errorMessage(error, "Could not add that value.")),
      },
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body font-medium text-ink">{attribute.name}</p>
        <IconButton
          icon={Trash2}
          label={`Remove ${attribute.name} from this product`}
          tone="danger"
          onClick={() => detach.mutate(attribute.id, {
            onError: (error) => toast.error(errorMessage(error, "Could not remove this choice.")),
          })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {attribute.values.map((value) => (
          <AttributeValueBadge
            key={value.id}
            value={value}
            onRemove={() =>
              deleteValue.mutate(value.id, {
                onError: (error) => toast.error(errorMessage(error, "Could not remove this value.")),
              })
            }
          />
        ))}
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Input
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addValue();
              }
            }}
            placeholder="Add value…"
            className="h-7 w-28 text-caption"
          />
          <IconButton icon={Plus} label="Add value" onClick={addValue} disabled={!newValue.trim()} />
        </span>
      </div>
    </div>
  );
}

function VariantRow({ productId, variant }: { productId: string; variant: ProductVariant }) {
  const update = useUpdateProductVariant(productId);
  const remove = useDeleteProductVariant(productId);
  const [sku, setSku] = useState(variant.sku ?? "");
  const [barcode, setBarcode] = useState(variant.barcode ?? "");
  const [price, setPrice] = useState(String(variant.price));
  const [costPrice, setCostPrice] = useState(String(variant.costPrice));

  function saveField(patch: Omit<Parameters<typeof update.mutate>[0], "variantId">) {
    update.mutate(
      { variantId: variant.id, ...patch },
      { onError: (error) => toast.error(errorMessage(error, "Could not save this variant.")) },
    );
  }

  const label = variant.attributeValues.map((v) => v.value).filter(Boolean).join(" / ") || "—";

  return (
    <tr>
      <Td>{label}</Td>
      <Td>
        <Input
          value={sku}
          onChange={(event) => setSku(event.target.value)}
          onBlur={() => saveField({ sku: sku.trim() || null })}
          className="h-9 w-32"
        />
      </Td>
      <Td>
        <Input
          value={barcode}
          onChange={(event) => setBarcode(event.target.value)}
          onBlur={() => saveField({ barcode: barcode.trim() || null })}
          className="h-9 w-32"
        />
      </Td>
      <Td numeric>
        <MoneyInput
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          onBlur={() => {
            const parsed = Number(price);
            if (Number.isFinite(parsed)) saveField({ price: parsed });
          }}
          className="h-9 w-28 text-right"
        />
      </Td>
      <Td numeric>
        <MoneyInput
          type="number"
          step="0.01"
          min="0"
          value={costPrice}
          onChange={(event) => setCostPrice(event.target.value)}
          onBlur={() => {
            const parsed = Number(costPrice);
            if (Number.isFinite(parsed)) saveField({ costPrice: parsed });
          }}
          className="h-9 w-28 text-right"
        />
      </Td>
      <Td numeric>
        <IconButton
          icon={Trash2}
          label={`Delete variant ${label}`}
          tone="danger"
          onClick={() =>
            remove.mutate(variant.id, {
              onError: (error) => toast.error(errorMessage(error, "Could not delete this variant.")),
            })
          }
        />
      </Td>
    </tr>
  );
}

function GenerateVariantsForm({ productId, attributes }: { productId: string; attributes: CompanyAttribute[] }) {
  const generate = useGenerateProductVariants(productId);
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  function toggleValue(attributeId: string, valueId: string) {
    setSelected((prev) => {
      const current = prev[attributeId] ?? [];
      const next = current.includes(valueId)
        ? current.filter((id) => id !== valueId)
        : [...current, valueId];
      return { ...prev, [attributeId]: next };
    });
  }

  async function onGenerate() {
    const attributeSelections = attributes
      .map((attribute) => ({ companyAttributeId: attribute.id, valueIds: selected[attribute.id] ?? [] }))
      .filter((entry) => entry.valueIds.length > 0);

    if (attributeSelections.length !== attributes.length) {
      toast.error("Pick at least one value for every choice before generating.");
      return;
    }

    try {
      const created = await generate.mutateAsync(attributeSelections);
      toast.success(
        created.length > 0
          ? `Created ${created.length} new variant${created.length === 1 ? "" : "s"}.`
          : "Every combination already exists.",
      );
    } catch (error) {
      toast.error(errorMessage(error, "Could not generate variants."));
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border p-3">
      {attributes.map((attribute) => (
        <div key={attribute.id}>
          <p className="mb-1 text-caption font-medium text-ink-muted">{attribute.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {attribute.values.map((value) => {
              const active = (selected[attribute.id] ?? []).includes(value.id);
              return (
                <button
                  key={value.id}
                  type="button"
                  onClick={() => toggleValue(attribute.id, value.id)}
                  className={`rounded-sm border px-2 py-1 text-caption transition-colors ${
                    active
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-surface text-ink hover:bg-canvas"
                  }`}
                >
                  {value.value}
                </button>
              );
            })}
            {attribute.values.length === 0 ? (
              <span className="text-caption text-ink-muted">No values yet — add some above first.</span>
            ) : null}
          </div>
        </div>
      ))}
      <Button type="button" icon={Sparkles} loading={generate.isPending} onClick={onGenerate}>
        Generate variants
      </Button>
    </div>
  );
}

export function ProductAttributesAndVariantsSection({ product }: { product: Product }) {
  const allAttributesQuery = useCompanyAttributes();
  const attachedQuery = useProductAttributes(product.id);
  const variantsQuery = useProductVariants(product.id);
  const attach = useAttachProductAttribute(product.id);
  const createAttribute = useCreateCompanyAttribute();
  const [pickerValue, setPickerValue] = useState("");

  const attached = attachedQuery.data ?? [];
  const attachedIds = new Set(attached.map((a) => a.id));
  const availableToAttach = (allAttributesQuery.data ?? []).filter((a) => !attachedIds.has(a.id));
  const nonDefaultVariants = (variantsQuery.data ?? []).filter((v) => !v.isDefault);

  function onAttachExisting(id: string) {
    if (!id) return;
    attach.mutate(id, {
      onSuccess: () => setPickerValue(""),
      onError: (error) => toast.error(errorMessage(error, "Could not attach this choice.")),
    });
  }

  function onCreateAndAttach(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    createAttribute.mutate(
      { name: trimmed },
      {
        onSuccess: (created) => {
          attach.mutate(created.id, {
            onError: (error) => toast.error(errorMessage(error, "Could not attach this choice.")),
          });
        },
        onError: (error) => toast.error(errorMessage(error, "Could not create that choice.")),
      },
    );
  }

  return (
    <Card>
      <CardHeader
        icon={Tag}
        title="Variants"
        description="Size, color, or anything else this product varies by. Leave empty for a simple product — price and cost above still apply directly."
      />
      <CardBody className="space-y-4">
        {attached.length > 0 ? (
          <div className="space-y-3">
            {attached.map((attribute) => (
              <AttachedAttributeCard key={attribute.id} productId={product.id} attribute={attribute} />
            ))}
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-sm rounded-md border border-dashed border-success/50 bg-success/5 px-4 py-4">
          <Field label="Add a choice" hint="Pick an existing one, or type a new name to create it.">
            <Combobox
              value={pickerValue}
              onChange={(value) => {
                setPickerValue(value);
                onAttachExisting(value);
              }}
              placeholder="Choose or type to create"
              options={availableToAttach.map((a) => ({ value: a.id, label: a.name }))}
              creatable
              createOptionLabel={(typed) => `“${typed}” doesn't exist — create it`}
              onCreate={onCreateAndAttach}
            />
          </Field>
        </div>

        {attached.length > 0 ? (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-ink-muted" />
              <p className="text-body font-medium text-ink">Combinations</p>
            </div>

            {nonDefaultVariants.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Combination</Th>
                      <Th>SKU</Th>
                      <Th>Barcode</Th>
                      <Th numeric>Price</Th>
                      <Th numeric>Cost</Th>
                      <Th numeric> </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonDefaultVariants.map((variant) => (
                      <VariantRow key={variant.id} productId={product.id} variant={variant} />
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : null}

            <GenerateVariantsForm productId={product.id} attributes={attached} />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
