"use client";

import { useState } from "react";
import { Palette, Plus, Tags, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardBody,
  Field,
  IconButton,
  Input,
  PageHeader,
} from "@/components/ui";
import {
  useCompanyAttributes,
  useCreateCompanyAttribute,
  useCreateCompanyAttributeValue,
  useDeleteCompanyAttribute,
  useDeleteCompanyAttributeValue,
} from "@/lib/query/attributes";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function AttributeCard({ attribute }: { attribute: { id: string; name: string; values: { id: string; value: string; hexCode: string | null }[] } }) {
  const [newValue, setNewValue] = useState("");
  const createValue = useCreateCompanyAttributeValue();
  const deleteValue = useDeleteCompanyAttributeValue();
  const deleteAttribute = useDeleteCompanyAttribute();

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
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-body font-medium text-ink">{attribute.name}</p>
          <IconButton
            icon={Trash2}
            label={`Delete ${attribute.name}`}
            tone="danger"
            onClick={() => {
              if (!window.confirm(`Delete "${attribute.name}"? Any variant using its values loses that value.`)) return;
              deleteAttribute.mutate(attribute.id, {
                onError: (error) => toast.error(errorMessage(error, "Could not delete this choice.")),
              });
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {attribute.values.map((value) => (
            <span
              key={value.id}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-canvas px-2 py-1 text-caption"
            >
              {value.hexCode ? (
                <span
                  className="size-3 rounded-full border border-border"
                  style={{ backgroundColor: value.hexCode }}
                  aria-hidden
                />
              ) : null}
              {value.value}
              <button
                type="button"
                onClick={() =>
                  deleteValue.mutate(value.id, {
                    onError: (error) => toast.error(errorMessage(error, "Could not remove this value.")),
                  })
                }
                aria-label={`Remove ${value.value}`}
                className="text-ink-muted hover:text-danger"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
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
        </div>
      </CardBody>
    </Card>
  );
}

export default function AttributesPage() {
  const attributesQuery = useCompanyAttributes();
  const createAttribute = useCreateCompanyAttribute();
  const [name, setName] = useState("");

  function onCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    createAttribute.mutate(
      { name: trimmed },
      {
        onSuccess: () => setName(""),
        onError: (error) => toast.error(errorMessage(error, "Could not create that choice.")),
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Tags}
        title="Choices"
        description="Build the vocabulary a product's variants draw from — Size, Color, Diameter. Pre-build a standard run here, or add one inline while editing a product."
      />

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-64">
              <Field label="New choice">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onCreate();
                    }
                  }}
                  placeholder="e.g. Size, Color, Diameter"
                />
              </Field>
            </div>
            <Button type="button" icon={Plus} onClick={onCreate} loading={createAttribute.isPending} disabled={!name.trim()}>
              Add choice
            </Button>
          </div>
        </CardBody>
      </Card>

      {attributesQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : attributesQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {errorMessage(attributesQuery.error, "Could not load choices.")}
        </Card>
      ) : (attributesQuery.data ?? []).length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Palette size={24} className="text-ink-muted" />
          <p className="text-body text-ink-muted">No choices yet — add one above.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {(attributesQuery.data ?? []).map((attribute) => (
            <AttributeCard key={attribute.id} attribute={attribute} />
          ))}
        </div>
      )}
    </div>
  );
}
