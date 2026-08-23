"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Hash, ImageOff, MapPin, Phone, Store } from "lucide-react";
import { storeInitial, type StoreSettings } from "@double-a/shared-types";
import {
  Button,
  ErrorNote,
  Field,
  FileInput,
  Input,
  SuccessNote,
  Textarea,
} from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateSettings } from "@/lib/query/settings";
import { saveStoreSettings } from "./actions";

export function StoreForm({ settings }: { settings: StoreSettings }) {
  const [state, action, pending] = useActionState(saveStoreSettings, EMPTY_FORM_STATE);
  const invalidate = useInvalidateSettings();

  const [invoicePrefix, setInvoicePrefix] = useState(settings.invoicePrefix ?? "");
  const [invoiceDigits, setInvoiceDigits] = useState(settings.invoiceDigits);
  const invoicePreview = `${invoicePrefix ? `${invoicePrefix}-` : ""}${"0".repeat(Math.max(invoiceDigits - 1, 0))}1`;

  useEffect(() => {
    if (state.ok) invalidate();
    // invalidate is stable enough for this effect; only state.ok gates re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  // Previewed from the chosen file rather than after the round trip, so the
  // owner sees the mark they picked before committing to it.
  const [preview, setPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  const shown = preview ?? (removeLogo ? null : settings.logoUrl);

  return (
    <form action={action} className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-paper">
          {shown ? (
            // Plain img: the logo is an arbitrary Supabase Storage URL, and
            // routing it through next/image would mean listing that host in
            // the build config of every deployment.
            <img src={shown} alt="" className="size-full object-contain" />
          ) : (
            <span className="font-display text-heading-sm font-bold text-primary">
              {storeInitial(settings.name)}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          <Field label="Logo" hint="PNG, JPEG, WebP or SVG, under 1 MB.">
            <FileInput
              name="logo"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
                if (file) setRemoveLogo(false);
              }}
            />
          </Field>

          {settings.logoUrl && !preview ? (
            <label className="flex items-center gap-2 text-caption text-ink-muted">
              <input
                type="checkbox"
                name="remove_logo"
                checked={removeLogo}
                onChange={(event) => setRemoveLogo(event.currentTarget.checked)}
                className="size-4 accent-primary"
              />
              <ImageOff size={14} strokeWidth={2} />
              Remove the current logo and show the initial instead
            </label>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Shop name" hint="Heads every terminal and the receipt.">
          <Input icon={Store} name="name" defaultValue={settings.name} required />
        </Field>
        <Field label="Phone">
          <Input
            icon={Phone}
            name="phone"
            defaultValue={settings.phone ?? ""}
            placeholder="0917 000 0000"
          />
        </Field>
      </div>

      <Field label="Address">
        <Input
          icon={MapPin}
          name="address"
          defaultValue={settings.address ?? ""}
          placeholder="123 Rizal St, Barangay Poblacion"
        />
      </Field>

      <Field
        label="Receipt footer"
        hint="Printed under the total. Leave empty to keep the default."
      >
        <Textarea
          name="receipt_footer"
          defaultValue={settings.receiptFooter ?? ""}
          placeholder="Thank you. No return, no exchange without receipt."
        />
      </Field>

      <div className="space-y-2 rounded-md border border-border p-4">
        <p className="text-body-sm font-medium text-ink">Invoice numbering</p>
        <p className="text-caption text-ink-muted">
          Every completed sale gets a sequential number in this format. Preview: {" "}
          <span className="font-mono">{invoicePreview}</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Prefix" hint="Optional, e.g. JH.">
            <Input
              icon={Hash}
              name="invoice_prefix"
              value={invoicePrefix}
              onChange={(event) => setInvoicePrefix(event.currentTarget.value)}
              placeholder="JH"
              maxLength={8}
            />
          </Field>
          <Field label="Digits" hint="Padded with leading zeros.">
            <Input
              type="number"
              name="invoice_digits"
              min={1}
              max={12}
              value={invoiceDigits}
              onChange={(event) => setInvoiceDigits(Number(event.currentTarget.value) || 1)}
            />
          </Field>
          <Field label="Next number" hint="Bumped automatically after each sale.">
            <Input
              type="number"
              name="invoice_next_number"
              min={1}
              defaultValue={settings.invoiceNextNumber}
            />
          </Field>
        </div>
      </div>

      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {state.ok ? (
        <SuccessNote>Saved. Terminals pick this up on their next sync.</SuccessNote>
      ) : null}

      <Button type="submit" loading={pending} icon={Check} className="w-full sm:w-auto">
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
