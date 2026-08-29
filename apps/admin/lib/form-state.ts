export interface FormState {
  error: string | null;
  ok: boolean;
  /** Set by a handful of actions (e.g. saveProduct on create) that a caller needs the new row's id for. */
  id?: string;
}

// Lives outside the action files because a "use server" module may only export
// async functions.
export const EMPTY_FORM_STATE: FormState = { error: null, ok: false };
