"use client";

import { useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AddonGroup } from "@double-a/api-client/queries";
import { Badge, Button, Card, CardBody, Field, IconButton, Input, PageHeader, Select } from "@/components/ui";
import { useAddonGroups, useCreateAddonGroup, useDeleteAddonGroup, useUpdateAddonGroup } from "@/lib/query/addon-groups";
import { AddItemForm, AddonGroupItemsList } from "./addon-group-items";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function AddonGroupCard({ group }: { group: AddonGroup }) {
  const update = useUpdateAddonGroup();
  const remove = useDeleteAddonGroup();

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-body font-medium text-ink">{group.name}</p>
            <Badge tone="neutral">{group.selectionType === "single" ? "Pick one" : "Pick any"}</Badge>
            {group.isRequired ? <Badge tone="warning">Required</Badge> : null}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-caption text-ink-muted">
              <input
                type="checkbox"
                checked={group.isRequired}
                onChange={(event) =>
                  update.mutate(
                    { id: group.id, isRequired: event.target.checked },
                    { onError: (error) => toast.error(errorMessage(error, "Could not save this change.")) },
                  )
                }
              />
              Required
            </label>
            <Select
              value={group.selectionType}
              onChange={(event) =>
                update.mutate(
                  { id: group.id, selectionType: event.target.value as AddonGroup["selectionType"] },
                  { onError: (error) => toast.error(errorMessage(error, "Could not save this change.")) },
                )
              }
              className="h-8 w-32 text-caption"
            >
              <option value="multiple">Pick any</option>
              <option value="single">Pick one</option>
            </Select>
            <IconButton
              icon={Trash2}
              label={`Delete ${group.name}`}
              tone="danger"
              onClick={() => {
                if (!window.confirm(`Delete "${group.name}"? This removes it from every product it's attached to.`)) return;
                remove.mutate(group.id, {
                  onError: (error) => toast.error(errorMessage(error, "Could not delete this group.")),
                });
              }}
            />
          </div>
        </div>

        <AddonGroupItemsList items={group.items} />

        <AddItemForm groupId={group.id} />
      </CardBody>
    </Card>
  );
}

export default function AddonGroupsPage() {
  const groupsQuery = useAddonGroups();
  const createGroup = useCreateAddonGroup();
  const [name, setName] = useState("");

  function onCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    createGroup.mutate(
      { name: trimmed },
      {
        onSuccess: () => setName(""),
        onError: (error) => toast.error(errorMessage(error, "Could not create that group.")),
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Layers}
        title="Add-on groups"
        description="Merchant-configurable extras — Toppings, Drill Accessories — attached to one or more products. Selecting during a sale ships with the POS variant picker."
      />

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-64">
              <Field label="New group">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onCreate();
                    }
                  }}
                  placeholder="e.g. Toppings"
                />
              </Field>
            </div>
            <Button type="button" icon={Plus} onClick={onCreate} loading={createGroup.isPending} disabled={!name.trim()}>
              Add group
            </Button>
          </div>
        </CardBody>
      </Card>

      {groupsQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : groupsQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {errorMessage(groupsQuery.error, "Could not load add-on groups.")}
        </Card>
      ) : (groupsQuery.data ?? []).length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Layers size={24} className="text-ink-muted" />
          <p className="text-body text-ink-muted">No add-on groups yet — add one above.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {(groupsQuery.data ?? []).map((group) => (
            <AddonGroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
