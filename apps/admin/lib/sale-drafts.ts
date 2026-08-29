import type { Product } from "@double-a/shared-types";

/**
 * Sales have no draft status server-side (only completed/voided/refunded — draft
 * is a purchase-order-only concept). A "held" sale is client-only: a snapshot of
 * the create-sale form saved to localStorage so a cashier can put it aside and
 * resume it later on the same browser. Never synced, never sent to the API.
 */

export interface SaleDraftItem {
  key: string;
  product: Product | null;
  quantity: string;
  unitPrice: string;
}

export interface SaleDraft {
  id: string;
  savedAt: string;
  items: SaleDraftItem[];
  paymentMethod: string;
  customerId: string;
  fulfillment: "pickup" | "delivery";
}

const STORAGE_KEY = "da:sale-drafts";

function readAll(): SaleDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(drafts: SaleDraft[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function listSaleDrafts(): SaleDraft[] {
  return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveSaleDraft(draft: Omit<SaleDraft, "id" | "savedAt">): SaleDraft {
  const saved: SaleDraft = {
    ...draft,
    id: Math.random().toString(36).slice(2),
    savedAt: new Date().toISOString(),
  };
  writeAll([...readAll(), saved]);
  return saved;
}

export function deleteSaleDraft(id: string): void {
  writeAll(readAll().filter((draft) => draft.id !== id));
}
