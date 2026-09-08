"use client";

import { useState } from "react";
import { Layers, X } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@double-a/shared-types";
import type { AddonGroup } from "@double-a/api-client/queries";
import { Badge, Card, CardBody, CardHeader, Combobox, Field } from "@/components/ui";
import {
  useAddonGroups,
  useCreateAddonGroup,
  useLinkProductAddonGroup,
  useProductAddonGroups,
  useUnlinkProductAddonGroup,
} from "@/lib/query/addon-groups";
import { AddItemForm, AddonGroupItemsList } from "../addon-groups/addon-group-items";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * A product carries at most one add-on group (enforced server-side too —
 * LinkProductAddonGroupRequest). Once one is attached, items go straight in
 * from here — no need to leave the product page for the standalone
 * /addon-groups screen, which stays for cross-product group management
 * (renaming, single/multiple, required) and browsing every group at once.
 */
export function ProductAddonGroupsSection({
  product,
  bare = false,
}: {
  product: Product;
  /** true = no Card/CardHeader wrapper (already inside a bordered tab panel). */
  bare?: boolean;
}) {
  const allGroupsQuery = useAddonGroups();
  const linkedQuery = useProductAddonGroups(product.id);
  const link = useLinkProductAddonGroup(product.id);
  const unlink = useUnlinkProductAddonGroup(product.id);
  const createGroup = useCreateAddonGroup();
  const [pickerValue, setPickerValue] = useState("");

  const group = (linkedQuery.data ?? [])[0] ?? null;

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

  const body = (
    <CardBody className="space-y-4">
        {group ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-body font-medium text-ink">{group.name}</p>
                <Badge tone="neutral">{group.selectionType === "single" ? "Pick one" : "Pick any"}</Badge>
                {group.isRequired ? <Badge tone="warning">Required</Badge> : null}
              </div>
              <button
                type="button"
                onClick={() =>
                  unlink.mutate(group.id, {
                    onError: (error) => toast.error(errorMessage(error, "Could not remove this add-on group.")),
                  })
                }
                className="flex items-center gap-1 text-caption text-ink-muted transition-colors hover:text-danger"
              >
                <X size={12} strokeWidth={2} />
                Remove group
              </button>
            </div>

            <AddonGroupItemsList items={group.items} />
            <AddItemForm groupId={group.id} />
          </>
        ) : (
          <div className="w-full">
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
                options={(allGroupsQuery.data ?? []).map((g: AddonGroup) => ({ value: g.id, label: g.name }))}
                creatable
                createOptionLabel={(typed) => `“${typed}” doesn't exist — create it`}
                onCreate={onCreateAndAttach}
              />
            </Field>
          </div>
        )}
    </CardBody>
  );

  if (bare) return body;

  return (
    <Card>
      <CardHeader
        icon={Layers}
        title="Add-ons"
        description="Extras a cashier can add to this sale alongside this product — priced items from your own catalogue."
      />
      {body}
    </Card>
  );
}
