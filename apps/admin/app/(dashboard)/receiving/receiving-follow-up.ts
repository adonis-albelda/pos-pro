export const RECEIVING_FOLLOW_UP_KEY = "receiving:follow-up";

export interface ReceivingFollowUpProduct {
  id: string;
  name: string;
}

export interface ReceivingFollowUpUncatalogued {
  name: string;
  sku: string | null;
}

export interface ReceivingFollowUp {
  savedAt: string;
  catalogProducts: ReceivingFollowUpProduct[];
  uncataloguedItems: ReceivingFollowUpUncatalogued[];
}

export function saveReceivingFollowUp(data: ReceivingFollowUp): void {
  sessionStorage.setItem(RECEIVING_FOLLOW_UP_KEY, JSON.stringify(data));
}

export function consumeReceivingFollowUp(): ReceivingFollowUp | null {
  const raw = sessionStorage.getItem(RECEIVING_FOLLOW_UP_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(RECEIVING_FOLLOW_UP_KEY);
  try {
    return JSON.parse(raw) as ReceivingFollowUp;
  } catch {
    return null;
  }
}
