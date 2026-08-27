import type { Expense, ExpenseBill, ExpenseBillFrequency } from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiPage, type JsonApiResource } from "../http";
import {
  type ExpenseAttrs,
  type ExpenseBillAttrs,
  toExpense,
  toExpenseBill,
} from "../mappers";

/** Admin-only (CLAUDE.md rule 14) — bill templates; ledger stays on /expenses. */

export interface ExpenseBillInput {
  description: string;
  amount: number;
  category?: string | null;
  note?: string | null;
  frequency: ExpenseBillFrequency;
  nextDueDate: string;
  remindDaysBefore?: number;
  remindersEnabled?: boolean;
  active?: boolean;
}

function toPayload(input: Partial<ExpenseBillInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.description !== undefined) payload.description = input.description;
  if (input.amount !== undefined) payload.amount = input.amount;
  if (input.category !== undefined) payload.category = input.category;
  if (input.note !== undefined) payload.note = input.note;
  if (input.frequency !== undefined) payload.frequency = input.frequency;
  if (input.nextDueDate !== undefined) payload.next_due_date = input.nextDueDate;
  if (input.remindDaysBefore !== undefined) {
    payload.remind_days_before = input.remindDaysBefore;
  }
  if (input.remindersEnabled !== undefined) {
    payload.reminders_enabled = input.remindersEnabled;
  }
  if (input.active !== undefined) payload.active = input.active;
  return payload;
}

export interface ListExpenseBillsOptions {
  active?: boolean;
  upcomingDays?: number;
  page?: number;
  pageSize?: number;
}

export async function listExpenseBillsPage(
  client: ApiClient,
  options: ListExpenseBillsOptions = {},
): Promise<{ bills: ExpenseBill[]; total: number; lastPage: number }> {
  const page = await client.get<JsonApiPage<ExpenseBillAttrs>>("/expense-bills", {
    active: options.active,
    upcoming_days: options.upcomingDays,
    page: options.page ?? 1,
    per_page: options.pageSize ?? 200,
  });

  return {
    bills: page.data.map(toExpenseBill),
    total: page.meta?.total ?? page.data.length,
    lastPage: page.meta?.last_page ?? 1,
  };
}

export async function listExpenseBills(
  client: ApiClient,
  options: Omit<ListExpenseBillsOptions, "page" | "pageSize"> = {},
): Promise<ExpenseBill[]> {
  const bills: ExpenseBill[] = [];
  let page = 1;
  for (;;) {
    const result = await listExpenseBillsPage(client, {
      ...options,
      page,
      pageSize: 200,
    });
    bills.push(...result.bills);
    if (page >= result.lastPage) return bills;
    page += 1;
  }
}

/** Active bills due within `days` (default 30), soonest first. */
export async function listUpcomingExpenseBills(
  client: ApiClient,
  days = 30,
): Promise<ExpenseBill[]> {
  const bills = await listExpenseBills(client, {
    active: true,
    upcomingDays: days,
  });
  return bills.slice(0, 20);
}

export async function getExpenseBill(
  client: ApiClient,
  id: string,
): Promise<ExpenseBill | null> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<ExpenseBillAttrs> }>(
      `/expense-bills/${id}`,
    );
    return toExpenseBill(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createExpenseBill(
  client: ApiClient,
  input: ExpenseBillInput,
): Promise<ExpenseBill> {
  const { data } = await client.post<{ data: JsonApiResource<ExpenseBillAttrs> }>(
    "/expense-bills",
    toPayload(input),
  );
  return toExpenseBill(data);
}

export async function updateExpenseBill(
  client: ApiClient,
  id: string,
  patch: Partial<ExpenseBillInput>,
): Promise<ExpenseBill> {
  const { data } = await client.patch<{ data: JsonApiResource<ExpenseBillAttrs> }>(
    `/expense-bills/${id}`,
    toPayload(patch),
  );
  return toExpenseBill(data);
}

export async function deleteExpenseBill(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/expense-bills/${id}`);
}

export interface MarkExpenseBillPaidResult {
  expense: Expense;
  bill: ExpenseBill;
}

export async function markExpenseBillPaid(
  client: ApiClient,
  id: string,
  expenseDate?: string | null,
): Promise<MarkExpenseBillPaidResult> {
  const body =
    expenseDate !== undefined && expenseDate !== null
      ? { expense_date: expenseDate }
      : {};
  const response = await client.post<{
    data: JsonApiResource<ExpenseAttrs>;
    meta?: { bill?: JsonApiResource<ExpenseBillAttrs> };
  }>(`/expense-bills/${id}/mark-paid`, body);

  const expense = toExpense(response.data);
  const billResource = response.meta?.bill;
  if (!billResource) {
    const refreshed = await getExpenseBill(client, id);
    if (!refreshed) throw new Error("Bill missing after mark paid");
    return { expense, bill: refreshed };
  }
  return { expense, bill: toExpenseBill(billResource) };
}
