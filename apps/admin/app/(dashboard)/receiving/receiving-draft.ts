import { normalizeHeldRow, type LineRow } from "./receiving-line-utils";

export const RECEIVING_DRAFT_KEY = "receiving:draft";
export const RECEIVING_HELD_PHOTOS_KEY = "receiving:held-receipt";

/** File blobs can't live in localStorage — IndexedDB holds receipt photos. */
const DRAFT_PHOTOS_DB = "receiving-draft-photos";
const DRAFT_PHOTOS_STORE = "photos";

export interface ReceivingDraft {
  savedAt: string;
  locationId: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string;
  referenceNo: string;
  notes: string;
  deliveryDate: string;
  salesmanName: string;
  paymentTerms: "cod" | "installment";
  rows: LineRow[];
  galleryPhotoId: string | null;
  /** Legacy: upload existed but File couldn't be serialized. Prefer IndexedDB now. */
  hadUnkeptPhoto: boolean;
  /** True when original photo bytes were written to IndexedDB with this draft. */
  hasLocalPhoto: boolean;
  photoRead: boolean;
  expandedKey: string | null;
}

type DraftPhotoBlob = {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
};

type ReceivingDraftPhotosRecord = {
  key: string;
  photo: DraftPhotoBlob | null;
  workingPhoto: DraftPhotoBlob | null;
};

export type ReceivingDraftPhotos = {
  photo: File | null;
  workingPhoto: File | null;
};

export function draftHasContent(draft: ReceivingDraft): boolean {
  return (
    draft.rows.length > 0 ||
    Boolean(draft.supplierId) ||
    Boolean(draft.supplierName.trim()) ||
    Boolean(draft.purchaseOrderId) ||
    Boolean(draft.referenceNo.trim()) ||
    Boolean(draft.notes.trim()) ||
    Boolean(draft.galleryPhotoId) ||
    Boolean(draft.hasLocalPhoto) ||
    Boolean(draft.hadUnkeptPhoto)
  );
}

export function loadReceivingDraft(): ReceivingDraft | null {
  try {
    const raw = window.localStorage.getItem(RECEIVING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReceivingDraft;
    return {
      ...parsed,
      hasLocalPhoto: Boolean(parsed.hasLocalPhoto),
      hadUnkeptPhoto: Boolean(parsed.hadUnkeptPhoto),
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
  void clearReceivingDraftPhotos(RECEIVING_DRAFT_KEY);
}

function openDraftPhotosDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DRAFT_PHOTOS_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_PHOTOS_STORE)) {
        db.createObjectStore(DRAFT_PHOTOS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function fileToDraftBlob(file: File): DraftPhotoBlob {
  return {
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    blob: file,
  };
}

function draftBlobToFile(entry: DraftPhotoBlob): File {
  return new File([entry.blob], entry.name, {
    type: entry.type || entry.blob.type || "application/octet-stream",
    lastModified: entry.lastModified,
  });
}

export async function readReceivingDraftPhotos(
  key: string,
): Promise<ReceivingDraftPhotos | null> {
  try {
    const db = await openDraftPhotosDb();
    const record = await new Promise<ReceivingDraftPhotosRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(DRAFT_PHOTOS_STORE, "readonly");
      const request = tx.objectStore(DRAFT_PHOTOS_STORE).get(key);
      request.onsuccess = () => resolve(request.result as ReceivingDraftPhotosRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
    db.close();
    if (!record?.photo) return null;
    return {
      photo: draftBlobToFile(record.photo),
      workingPhoto: record.workingPhoto ? draftBlobToFile(record.workingPhoto) : null,
    };
  } catch {
    return null;
  }
}

/** Returns true when a photo was stored (or cleared successfully with no photo). */
export async function writeReceivingDraftPhotos(
  key: string,
  photo: File | null,
  workingPhoto: File | null,
): Promise<boolean> {
  try {
    if (!photo) {
      await clearReceivingDraftPhotos(key);
      return true;
    }

    const db = await openDraftPhotosDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFT_PHOTOS_STORE, "readwrite");
      tx.objectStore(DRAFT_PHOTOS_STORE).put({
        key,
        photo: fileToDraftBlob(photo),
        workingPhoto: workingPhoto ? fileToDraftBlob(workingPhoto) : null,
      } satisfies ReceivingDraftPhotosRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    });
    db.close();
    return true;
  } catch {
    // Quota / private mode — photo draft just won't survive a refresh.
    return false;
  }
}

export async function clearReceivingDraftPhotos(key: string): Promise<void> {
  try {
    const db = await openDraftPhotosDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFT_PHOTOS_STORE, "readwrite");
      tx.objectStore(DRAFT_PHOTOS_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    });
    db.close();
  } catch {
    // Nothing to clean up if storage isn't available.
  }
}
