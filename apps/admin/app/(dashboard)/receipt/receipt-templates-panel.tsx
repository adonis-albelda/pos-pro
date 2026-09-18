"use client";

import { useId, useMemo, useState } from "react";
import { Check, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import {
  formatReceiptPreview,
  type ReceiptTemplate,
  type ReceiptTemplateFontSize,
  type StoreSettings,
} from "@double-a/shared-types";
import type { ReceiptTemplateInput } from "@double-a/api-client/queries";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Select,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { ConfirmDialog, Sheet } from "@/components/overlay";
import {
  useCreateReceiptTemplate,
  useDeleteReceiptTemplate,
  useReceiptTemplates,
  useUpdateReceiptTemplate,
} from "@/lib/query/receipt-templates";

type ToggleKey =
  | "showShopName"
  | "showLogoLine"
  | "showAddress"
  | "showPhone"
  | "showCashier"
  | "showTerminal"
  | "showCustomer"
  | "showDiscounts"
  | "showPayment"
  | "showFooter";

const TOGGLES: { key: ToggleKey; label: string; hint: string }[] = [
  { key: "showShopName", label: "Shop name", hint: "Centered at the top." },
  { key: "showLogoLine", label: "Logo placeholder", hint: "Prints [logo] under the name." },
  { key: "showAddress", label: "Address", hint: "From company settings." },
  { key: "showPhone", label: "Phone", hint: "From company settings." },
  { key: "showCashier", label: "Cashier name", hint: "Who unlocked the terminal." },
  { key: "showTerminal", label: "Terminal id", hint: "Short device id." },
  { key: "showCustomer", label: "Customer block", hint: "Only when the sale has customer details." },
  { key: "showDiscounts", label: "Discount line", hint: "When a counter discount exists." },
  { key: "showPayment", label: "Payment method", hint: "Cash, E-Wallet, card…" },
  { key: "showFooter", label: "Footer", hint: "Company receipt footer, or “Thank you”." },
];

const DEFAULT_TOGGLES: Record<(typeof TOGGLES)[number]["key"], boolean> = {
  showShopName: true,
  showLogoLine: false,
  showAddress: false,
  showPhone: false,
  showCashier: true,
  showTerminal: true,
  showCustomer: true,
  showDiscounts: false,
  showPayment: false,
  showFooter: false,
};

export function ReceiptTemplatesPanel({ store }: { store: StoreSettings }) {
  const templatesQuery = useReceiptTemplates();
  const deleteMutation = useDeleteReceiptTemplate();
  const [editing, setEditing] = useState<ReceiptTemplate | "new" | null>(null);
  const [deleting, setDeleting] = useState<ReceiptTemplate | null>(null);

  const templates = templatesQuery.data ?? [];

  function confirmDelete() {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }

  return (
    <>
      <Card className="relative z-0 overflow-visible">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div>
            <h3 className="text-heading-sm font-semibold">Custom receipts</h3>
            <p className="mt-0.5 text-caption text-ink-muted">
              Define a receipt for a purpose other than the customer's own — a Kitchen Order
              slip, a delivery note, whatever this shop needs. Nothing prints one automatically
              yet; this is where you design it.
            </p>
          </div>
          <Button type="button" icon={Plus} size="sm" onClick={() => setEditing("new")}>
            New template
          </Button>
        </div>

        <div className="px-4 py-5 sm:px-6">
          {templatesQuery.isPending ? (
            <p className="py-8 text-center text-body text-ink-muted">Loading…</p>
          ) : templatesQuery.isError ? (
            <p className="py-8 text-center text-body text-danger">
              {templatesQuery.error instanceof Error
                ? templatesQuery.error.message
                : "Could not load custom receipts."}
            </p>
          ) : templates.length === 0 ? (
            <EmptyState
              icon={Printer}
              title="No custom receipts yet"
              instruction='Add one for a purpose the customer receipt doesn’t cover, like a Kitchen Order slip.'
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Title</Th>
                  <Th>Status</Th>
                  <Th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <Td className="font-medium text-ink">{template.name}</Td>
                    <Td className="text-ink-muted">{template.title || "—"}</Td>
                    <Td>
                      <Badge tone={template.isActive ? "success" : "neutral"}>
                        {template.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <IconButton
                          icon={Pencil}
                          label={`Edit ${template.name}`}
                          onClick={() => setEditing(template)}
                        />
                        <IconButton
                          icon={Trash2}
                          label={`Delete ${template.name}`}
                          tone="danger"
                          onClick={() => setDeleting(template)}
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New custom receipt" : `Edit ${editing?.name ?? ""}`}
        description="Its own title, description, blocks, and heading size — printed independently of the customer receipt."
        className="max-w-3xl"
      >
        {editing !== null ? (
          <ReceiptTemplateForm
            template={editing === "new" ? null : editing}
            store={store}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete this custom receipt?"
        description={
          deleting ? `"${deleting.name}" will be removed. This cannot be undone.` : ""
        }
        pending={deleteMutation.isPending}
      />
    </>
  );
}

function ReceiptTemplateForm({
  template,
  store,
  onDone,
}: {
  template: ReceiptTemplate | null;
  store: StoreSettings;
  onDone: () => void;
}) {
  const formId = useId();
  const createMutation = useCreateReceiptTemplate();
  const updateMutation = useUpdateReceiptTemplate();
  const mutation = template ? updateMutation : createMutation;

  const [name, setName] = useState(template?.name ?? "");
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [fontSize, setFontSize] = useState<ReceiptTemplateFontSize>(template?.fontSize ?? "normal");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [toggles, setToggles] = useState<Record<(typeof TOGGLES)[number]["key"], boolean>>(
    () =>
      template
        ? Object.fromEntries(TOGGLES.map(({ key }) => [key, Boolean(template[key])])) as typeof DEFAULT_TOGGLES
        : DEFAULT_TOGGLES,
  );

  function toggle(key: (typeof TOGGLES)[number]["key"]) {
    setToggles((previous) => ({ ...previous, [key]: !previous[key] }));
  }

  const preview = useMemo(
    () =>
      formatReceiptPreview(undefined, {
        layout: {
          showShopName: toggles.showShopName,
          showAddress: toggles.showAddress,
          showPhone: toggles.showPhone,
          showLogoLine: toggles.showLogoLine,
          showCashier: toggles.showCashier,
          showTerminal: toggles.showTerminal,
          showCustomer: toggles.showCustomer,
          showDiscounts: toggles.showDiscounts,
          showPayment: toggles.showPayment,
          showFooter: toggles.showFooter,
          paperWidthMm: 58,
          columns: 32,
          printerModel: "PT-210",
          updatedAt: "",
        },
        store,
      }),
    [toggles, store],
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: ReceiptTemplateInput = {
      name: name.trim(),
      title: title.trim() || null,
      description: description.trim() || null,
      fontSize,
      isActive,
      ...toggles,
    };
    if (!input.name) return;

    if (template) {
      updateMutation.mutate({ id: template.id, patch: input }, { onSuccess: onDone });
    } else {
      createMutation.mutate(input, { onSuccess: onDone });
    }
  }

  return (
    <form id={formId} onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5">
        <Field label="Name" hint="Internal label — shows in this list only." required>
          <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" hint="Printed heading, e.g. “ORDER RECEIPT”." required={false}>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} />
          </Field>
          <Field label="Heading size" required={false}>
            <Select
              value={fontSize}
              onChange={(event) => setFontSize(event.target.value as ReceiptTemplateFontSize)}
            >
              <option value="normal">Normal</option>
              <option value="large">Large</option>
            </Select>
          </Field>
        </div>

        <Field label="Description" hint="Printed under the title, e.g. instructions for the kitchen." required={false}>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
            rows={2}
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="mb-1 block text-caption font-medium text-ink-muted">Blocks</legend>
          {TOGGLES.map(({ key, label, hint }) => (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-3 rounded-sm border border-border bg-surface px-3 py-3 transition-colors hover:bg-paper"
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary"
                checked={toggles[key]}
                onChange={() => toggle(key)}
              />
              <span className="min-w-0">
                <span className="block text-body font-medium">{label}</span>
                <span className="mt-0.5 block text-caption text-ink-muted">{hint}</span>
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-border bg-surface px-3 py-3 transition-colors hover:bg-paper">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-body font-medium">Active</span>
              <span className="mt-0.5 block text-caption text-ink-muted">
                Inactive templates stay saved but are hidden from anywhere this list is picked
                from later.
              </span>
            </span>
          </label>
        </fieldset>

        {mutation.isError ? (
          <ErrorNote>
            {mutation.error instanceof Error ? mutation.error.message : "Could not save this template."}
          </ErrorNote>
        ) : null}

        <Button type="submit" loading={mutation.isPending} icon={Check}>
          {mutation.isPending ? "Saving..." : "Save template"}
        </Button>
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <div className="mb-2 flex items-center gap-2 text-caption font-medium tracking-wide text-ink-muted uppercase">
          <Printer size={14} />
          Preview · 58mm
        </div>
        <div
          className="mx-auto overflow-hidden rounded-sm border border-border bg-[#f7f4ea] shadow-xs"
          style={{ width: 240 }}
        >
          {title || description ? (
            <div className="border-b border-dashed border-border/80 bg-[#f7f4ea] px-3 py-2 text-center">
              {title ? (
                <p
                  className={
                    "font-bold text-ink uppercase " +
                    ("large" === fontSize ? "text-body-lg" : "text-caption")
                  }
                >
                  {title}
                </p>
              ) : null}
              {description ? (
                <p className="mt-0.5 text-[10px] text-ink-muted">{description}</p>
              ) : null}
            </div>
          ) : null}
          <pre className="overflow-x-auto bg-transparent px-3 py-3 font-mono text-[11px] leading-[1.35] text-ink whitespace-pre">
            {preview}
          </pre>
        </div>
      </aside>
    </form>
  );
}
