export interface FormState {
  error: string | null;
  ok: boolean;
}

// Lives outside the action files because a "use server" module may only export
// async functions.
export const EMPTY_FORM_STATE: FormState = { error: null, ok: false };
