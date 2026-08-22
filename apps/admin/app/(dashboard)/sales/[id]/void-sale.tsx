"use client";

import { useState, useTransition } from "react";
import { Ban, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/overlay";
import { useInvalidateSales } from "@/lib/query/sales";
import { voidSaleAction } from "./actions";

/**
 * Two labels over one mechanism, deliberately: a test sale needs the exact
 * same effect a void does (stock restored, excluded from every report —
 * every report query already filters status = 'completed') so this reuses
 * voidSaleAction rather than adding a second status/column. The sale itself
 * ends up indistinguishable from a genuine void afterward — accepted
 * tradeoff, not a bug.
 */
export function VoidSale({ saleId, mode = "void" }: { saleId: string; mode?: "void" | "test" }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const invalidate = useInvalidateSales();

  function confirm() {
    const form = new FormData();
    form.set("id", saleId);
    startTransition(async () => {
      await voidSaleAction(form);
      invalidate();
      setOpen(false);
    });
  }

  const copy =
    mode === "test"
      ? {
          icon: FlaskConical,
          label: "Mark as test",
          title: "Mark this sale as a test?",
          description: "The stock goes back, it drops out of every report, and this cannot be undone.",
        }
      : {
          icon: Ban,
          label: "Void sale",
          title: "Void this sale?",
          description: "The stock goes back and this cannot be undone.",
        };

  return (
    <>
      <Button
        variant="danger"
        icon={copy.icon}
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
      >
        {copy.label}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        pending={pending}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.label}
      />
    </>
  );
}
