"use client";

import { useState } from "react";
import { Layers, X } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@double-a/shared-types";
import { Card, CardBody, CardHeader, Combobox, Field } from "@/components/ui";
import {
  useAddonGroups,
  useCreateAddonGroup,
  useLinkProductAddonGroup,
  useProductAddonGroups,
  useUnlinkProductAddonGroup,
} from "@/lib/query/addon-groups";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function ProductAddonGroupsSection({ product }: { product: Product }) {
  const allGroupsQuery = useAddonGroups();
  const linkedQuery = useProductAddonGroups(product.id);
  const link = useLinkProductAddonGroup(product.id);
  const unlink = useUnlinkProductAddonGroup(product.id);
  const createGroup = useCreateAddonGroup();
  const [pickerValue, setPickerValue] = useState("");

  const linked = linkedQuery.data ?? [];
  const linkedIds = new Set(linked.map((g) => g.id));
  const available = (allGroupsQuery.data ?? []).filter((g) => !linkedIds.has(g.id));

  function onCreateAndAttach(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    createGroup.mutate(
      { name: trimmed },
      {
        onSuccess: (created) => {
          link.mutate(created.id, {
            onError: (error) => toast.error(errorMessage(error, "Could not attach this add-on group.")),
          });
        },
        onError: (error) => toast.error(errorMessage(error, "Could not create that add-on group.")),
      },
    );
  }

  return (
    <Card>
      <CardHeader
        icon={Layers}
        title="Add-ons"
        description="Toppings, accessories — extras a cashier offers alongside this product. Manage the groups themselves under Add-on groups."
      />
      <CardBody className="space-y-3">
        {linked.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {linked.map((group) => (
              <span
                key={group.id}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-canvas px-2 py-1 text-caption"
              >
                {group.name}
                <button
                  type="button"
                  onClick={() =>
                    unlink.mutate(group.id, {
                      onError: (error) => toast.error(errorMessage(error, "Could not remove this add-on group.")),
                    })
                  }
                  aria-label={`Remove ${group.name}`}
                  className="text-ink-muted hover:text-danger"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className={linked.length > 0 ? "w-64" : "mx-auto w-full max-w-sm py-2"}>
          <Field label="Attach an add-on group" hint="Pick an existing one, or type a new name to create it.">
            <Combobox
              value={pickerValue}
              onChange={(value) => {
                if (!value) return;
                setPickerValue("");
                link.mutate(value, {
                  onError: (error) => toast.error(errorMessage(error, "Could not attach this add-on group.")),
                });
              }}
              placeholder="Choose or type to create"
              options={available.map((g) => ({ value: g.id, label: g.name }))}
              creatable
              createOptionLabel={(typed) => `“${typed}” doesn't exist — create it`}
              onCreate={onCreateAndAttach}
            />
          </Field>
        </div>
      </CardBody>
    </Card>
  );
}
