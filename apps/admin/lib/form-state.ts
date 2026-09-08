import type { VariantSignal } from "@double-a/api-client/queries";

export interface FormState {
  error: string | null;
  ok: boolean;
  /** Set by saveProduct — the update response's own variant-signal suggestion, no separate check call needed. */
  variantSignal?: VariantSignal;
}

// Lives outside the action files because a "use server" module may only export
// async functions.
export const EMPTY_FORM_STATE: FormState = { error: null, ok: false };
