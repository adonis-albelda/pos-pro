"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Check, Printer } from "lucide-react";
import {
  RECEIPT_COLUMNS,
  RECEIPT_PAPER_WIDTH_MM,
  RECEIPT_PRINTER_MODEL,
  formatReceiptPreview,
  type ReceiptLayout,
  type StoreSettings,
} from "@double-a/shared-types";
import { Button, ErrorNote, SuccessNote } from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateSettings } from "@/lib/query/settings";
import { saveReceiptLayout } from "./actions";

const TOGGLES: { key: keyof ReceiptLayout; label: string; hint: string }[] = [
  { key: "showShopName", label: "Shop name", hint: "Centered at the top." },
  {
    key: "showLogoLine",
    label: "Logo placeholder",
    hint: "Prints [logo] under the name. Bitmap logos are not on PT-210 yet.",
  },
  { key: "showAddress", label: "Address", hint: "From company settings." },
  { key: "showPhone", label: "Phone", hint: "From company settings." },
  { key: "showCashier", label: "Cashier name", hint: "Who unlocked the terminal." },
  { key: "showTerminal", label: "Terminal id", hint: "Short device id." },
  {
    key: "showCustomer",
    label: "Customer block",
    hint: "Only when the sale has customer details.",
  },
  { key: "showDiscounts", label: "Discount line", hint: "When a counter discount exists." },
  { key: "showPayment", label: "Payment method", hint: "Cash, GCash, card…" },
  {
    key: "showFooter",
    label: "Footer",
    hint: "Company receipt footer, or “Thank you”.",
  },
];

const FIELD_NAMES: Record<
  (typeof TOGGLES)[number]["key"],
  string
> = {
  showShopName: "show_shop_name",
  showAddress: "show_address",
  showPhone: "show_phone",
  showLogoLine: "show_logo_line",
  showCashier: "show_cashier",
  showTerminal: "show_terminal",
  showCustomer: "show_customer",
  showDiscounts: "show_discounts",
  showPayment: "show_payment",
  showFooter: "show_footer",
  paperWidthMm: "paper_width_mm",
  columns: "columns",
  printerModel: "printer_model",
  updatedAt: "updated_at",
};

export function ReceiptLayoutForm({
  layout: initial,
  store,
}: {
  layout: ReceiptLayout;
  store: StoreSettings;
}) {
  const [layout, setLayout] = useState(initial);
  const [state, action, pending] = useActionState(saveReceiptLayout, EMPTY_FORM_STATE);
  const invalidate = useInvalidateSettings();

  useEffect(() => {
    if (state.ok) invalidate();
    // invalidate is stable enough for this effect; only state.ok gates re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  const preview = useMemo(
    () => formatReceiptPreview(undefined, { layout, store }),
    [layout, store],
  );

  function toggle(key: (typeof TOGGLES)[number]["key"]) {
    setLayout((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <form action={action} className="space-y-5">
        {TOGGLES.map(({ key, label, hint }) => (
          <label
            key={key}
            className="flex cursor-pointer items-start gap-3 rounded-sm border border-border px-3 py-3 transition-colors hover:bg-paper"
          >
            <input type="hidden" name={FIELD_NAMES[key]} value={layout[key] ? "true" : "false"} />
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={Boolean(layout[key])}
              onChange={() => toggle(key)}
            />
            <span className="min-w-0">
              <span className="block text-body font-medium">{label}</span>
              <span className="mt-0.5 block text-caption text-ink-muted">{hint}</span>
            </span>
          </label>
        ))}

        <p className="text-caption text-ink-muted">
          Locked to {RECEIPT_PRINTER_MODEL}, {RECEIPT_PAPER_WIDTH_MM}mm paper,{" "}
          {RECEIPT_COLUMNS} characters per line. Pair the printer on each terminal.
        </p>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.ok ? <SuccessNote>Saved. Terminals pick this up on the next sync.</SuccessNote> : null}

        <Button type="submit" loading={pending} icon={Check}>
          {pending ? "Saving..." : "Save layout"}
        </Button>
      </form>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <div className="mb-2 flex items-center gap-2 text-caption font-medium text-ink-muted uppercase tracking-wide">
          <Printer size={14} />
          Printer overview · {RECEIPT_PAPER_WIDTH_MM}mm
        </div>
        <div
          className="mx-auto overflow-hidden rounded-sm border border-border bg-[#f7f4ea] shadow-xs"
          style={{ width: 240 }}
          aria-label="Receipt preview at 58mm width"
        >
          <div className="border-b border-dashed border-border/80 px-3 py-1.5 text-center text-[10px] text-ink-muted">
            {RECEIPT_PRINTER_MODEL}
          </div>
          <pre
            className="overflow-x-auto px-3 py-3 font-mono text-[11px] leading-[1.35] text-ink whitespace-pre"
            style={{ width: "100%" }}
          >
            {preview}
          </pre>
          <div className="border-t border-dashed border-border/80 px-3 py-2 text-center text-[10px] text-ink-muted">
            Live preview · sample sale
          </div>
        </div>
      </aside>
    </div>
  );
}
