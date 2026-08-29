"use client";

import { useActionState, useEffect } from "react";
import { Check, FolderPlus } from "lucide-react";
import { Button, Combobox, ErrorNote, Field, Input, SuccessNote } from "@/components/ui";
import {
  descendantIds,
  indentLabel,
  type CategoryOption,
} from "@/lib/category-options";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateCategories } from "@/lib/query/categories";
import { saveCategory } from "./actions";

export function CategoryForm({
  category,
  categories,
  onDone,
}: {
  category?: CategoryOption;
  categories: CategoryOption[];
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveCategory, EMPTY_FORM_STATE);
  const invalidate = useInvalidateCategories();

  useEffect(() => {
    if (state.ok) {
      invalidate();
      onDone?.();
    }
    // invalidate is stable enough for this effect; only state.ok/onDone gate re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, onDone]);

  // Moving a category under one of its own children would orphan the branch.
  const blocked = category ? descendantIds(categories, category.id) : new Set<string>();

  return (
    <form action={action} className="space-y-4">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <Input
            name="name"
            defaultValue={category?.name}
            placeholder="Pipes"
            required
          />
        </Field>
        <Field label="Sits under" hint="Leave as a top level to start a new branch." required={false}>
          <Combobox
            name="parent_id"
            defaultValue={category?.parentId ?? ""}
            placeholder="Top level"
            options={[
              { value: "", label: "Top level" },
              ...categories
                .filter((option) => !blocked.has(option.id))
                .map((option) => ({ value: option.id, label: indentLabel(option) })),
            ]}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Markup %"
          hint="When applied, new products under this category get shelf = cost × (1 + %)."
          required={false}
        >
          <Input
            name="markup_percent"
            type="number"
            step="0.01"
            min="0"
            defaultValue={category?.markupPercent ?? 0}
          />
        </Field>
        <Field label="Apply markup" hint="Off = owner types shelf price by hand." required={false}>
          <label className="flex min-h-11 items-center gap-2 rounded-sm border border-border bg-surface px-3 text-body">
            <input
              type="checkbox"
              name="markup_applied"
              value="true"
              defaultChecked={category?.markupApplied ?? false}
              className="size-4 accent-primary"
            />
            Use markup when creating products
          </label>
        </Field>
      </div>

      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {state.ok ? (
        <SuccessNote>
          Saved. Products under it now read the new path on their next sync.
        </SuccessNote>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          type="submit"
          loading={pending}
          icon={category ? Check : FolderPlus}
          className="w-full sm:w-auto"
        >
          {pending ? "Saving..." : category ? "Save changes" : "Add category"}
        </Button>
        {onDone ? (
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
