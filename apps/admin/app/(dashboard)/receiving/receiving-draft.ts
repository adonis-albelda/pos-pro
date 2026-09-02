import { normalizeHeldRow, type LineRow } from "./receiving-line-utils";

export const RECEIVING_DRAFT_KEY = "receiving:draft";

export interface ReceivingDraft {
  savedAt: string;
  locationId: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string;
  referenceNo: string;
  notes: string;
  rows: LineRow[];
  galleryPhotoId: string | null;
  hadUnkeptPhoto: boolean;
  photoRead: boolean;
  expandedKey: string | null;
}

export function draftHasContent(draft: ReceivingDraft): boolean {
  return (
    draft.rows.length > 0 ||
    Boolean(draft.supplierId) ||
    Boolean(draft.supplierName.trim()) ||
    Boolean(draft.purchaseOrderId) ||
    Boolean(draft.referenceNo.trim()) ||
    Boolean(draft.notes.trim()) ||
    Boolean(draft.galleryPhotoId)
  );
}

export function loadReceivingDraft(): ReceivingDraft | null {
  try {
    const raw = window.localStorage.getItem(RECEIVING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReceivingDraft;
    return {
      ...parsed,
      rows: (parsed.rows ?? []).map(normalizeHeldRow),
    };
  } catch {
    return null;
  }
}

export function saveReceivingDraft(draft: ReceivingDraft): void {
  try {
    window.localStorage.setItem(RECEIVING_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private browsing / quota — draft just won't persist.
  }
}

export function clearReceivingDraft(): void {
  try {
    window.localStorage.removeItem(RECEIVING_DRAFT_KEY);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
