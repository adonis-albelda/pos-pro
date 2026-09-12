export interface FormState {
  error: string | null;
  ok: boolean;
  /** Set by a handful of actions (e.g. saveExpense) that a caller needs the created/updated row's id from. */
  id?: string;
}

// Lives outside the action files because a "use server" module may only export
// async functions.
export const EMPTY_FORM_STATE: FormState = { error: null, ok: false };
