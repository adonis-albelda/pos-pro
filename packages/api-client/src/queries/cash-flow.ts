import type { CashFlowLedgerEntry, CashFlowSummary, CashMovement, CashMovementType } from "@double-a/shared-types";
import type { ApiClient, DataEnvelope, JsonApiResource } from "../http";
import { type CashMovementAttrs, toCashMovement } from "../mappers";

/**
 * Cash Flow is a read-only aggregation over Sales, Expenses, and manual
 * CashMovement entries — it never stores its own copy of a sale, expense, or
 * refund (see the Laravel BuildCashFlowMovements action's own docblock for
 * the same note). `from`/`to` follow the same inclusive/exclusive ISO
 * timestamp convention as `reports.ts`'s DateRange.
 */
export interface CashFlowRange {
  /** Inclusive ISO timestamp. */
  from: string;
  /** Exclusive ISO timestamp. */
  to: string;
  locationId?: string | null;
  terminalId?: string | null;
}

interface CashFlowSummaryJson {
  from: string;
  to: string;
  opening_cash: number;
  cash_in: number;
  cash_out: number;
  net_cash_flow: number;
  expected_cash: number;
  cash_in_by_type: Record<string, number>;
  cash_out_by_type: Record<string, number>;
}

function toCashFlowSummary(json: CashFlowSummaryJson): CashFlowSummary {
  return {
    from: json.from,
    to: json.to,
    openingCash: Number(json.opening_cash),
    cashIn: Number(json.cash_in),
    cashOut: Number(json.cash_out),
    netCashFlow: Number(json.net_cash_flow),
    expectedCash: Number(json.expected_cash),
    cashInByType: json.cash_in_by_type as CashFlowSummary["cashInByType"],
    cashOutByType: json.cash_out_by_type as CashFlowSummary["cashOutByType"],
  };
}

export async function getCashFlowSummary(client: ApiClient, range: CashFlowRange): Promise<CashFlowSummary> {
  const { data } = await client.get<DataEnvelope<CashFlowSummaryJson>>("/cash-flow/summary", {
    from: range.from,
    to: range.to,
    location_id: range.locationId ?? undefined,
    terminal_id: range.terminalId ?? undefined,
  });
  return toCashFlowSummary(data);
}

interface CashFlowLedgerEntryJson {
  date: string;
  type: string;
  direction: string;
  description: string;
  amount: number;
  location_id: string | null;
  location_name: string | null;
  terminal_id: string | null;
  terminal_name: string | null;
  reference_type: string | null;
  reference_id: string | null;
  user_id: string | null;
  user_name: string | null;
}

function toLedgerEntry(json: CashFlowLedgerEntryJson): CashFlowLedgerEntry {
  return {
    date: json.date,
    type: json.type as CashFlowLedgerEntry["type"],
    direction: json.direction as CashFlowLedgerEntry["direction"],
    description: json.description,
    amount: Number(json.amount),
    locationId: json.location_id,
    locationName: json.location_name,
    terminalId: json.terminal_id,
    terminalName: json.terminal_name,
    referenceType: json.reference_type,
    referenceId: json.reference_id,
    userId: json.user_id,
    userName: json.user_name,
  };
}

export async function listCashFlowLedger(
  client: ApiClient,
  range: CashFlowRange & {
    direction?: "in" | "out";
    type?: CashFlowLedgerEntry["type"];
    page?: number;
    pageSize?: number;
  },
): Promise<{ entries: CashFlowLedgerEntry[]; total: number; lastPage: number }> {
  const pageSize = range.pageSize ?? 50;
  const response = await client.get<DataEnvelope<CashFlowLedgerEntryJson[]>>("/cash-flow/ledger", {
    from: range.from,
    to: range.to,
    location_id: range.locationId ?? undefined,
    terminal_id: range.terminalId ?? undefined,
    direction: range.direction,
    type: range.type,
    page: range.page ?? 1,
    per_page: pageSize,
  });
  const meta = response.meta as { total?: number; last_page?: number } | undefined;
  const total = meta?.total ?? response.data.length;
  return {
    entries: response.data.map(toLedgerEntry),
    total,
    lastPage: meta?.last_page ?? Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface CashMovementInput {
  type: CashMovementType;
  locationId: string;
  terminalId?: string | null;
  amount: number;
  reason: string;
}

export async function createCashMovement(client: ApiClient, input: CashMovementInput): Promise<CashMovement> {
  const { data } = await client.post<{ data: JsonApiResource<CashMovementAttrs> }>("/cash-flow/movements", {
    type: input.type,
    location_id: input.locationId,
    terminal_id: input.terminalId ?? null,
    amount: input.amount,
    reason: input.reason,
  });
  return toCashMovement(data);
}
