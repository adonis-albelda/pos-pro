import type { Expense } from "@double-a/shared-types";
import { roundMoney } from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiPage, type JsonApiResource } from "../http";
import { type ExpenseAttrs, toExpense } from "../mappers";

/** Admin-only (CLAUDE.md rule 14) — never called from the POS or synced to SQLite. */

export interface ExpenseInput {
  description: string;
  amount: number;
  category?: string | null;
  /** Shop calendar day (yyyy-mm-dd), Asia/Manila. */
  expenseDate?: string | null;
  note?: string | null;
  /** Null/omitted = company-wide. Set = this outlay belongs to one branch/warehouse. */
  locationId?: string | null;
}

function toPayload(input: Partial<ExpenseInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.description !== undefined) payload.description = input.description;
  if (input.amount !== undefined) payload.amount = input.amount;
  if (input.category !== undefined) payload.category = input.category;
  if (input.expenseDate !== undefined) payload.expense_date = input.expenseDate;
  if (input.note !== undefined) payload.note = input.note;
  if (input.locationId !== undefined) payload.location_id = input.locationId;
  return payload;
}

export interface ExpenseDayRange {
  /** Inclusive shop day, yyyy-mm-dd. */
  fromDay: string;
  /** Inclusive shop day, yyyy-mm-dd. */
  toDay: string;
}

export interface ExpenseFilterOptions {
  /** Branch/warehouse to filter to. Company-wide expenses (location_id null) are excluded when set. */
  locationId?: string | null;
}

export interface ListExpensesPageOptions extends Partial<ExpenseDayRange>, ExpenseFilterOptions {
  page?: number;
  pageSize?: number;
}

/**
 * `IndexExpensesController` paginates (`per_page`, capped at 200) and orders
 * newest expense_date first — the old Postgres query fetched every matching
 * row in one shot, so callers wanting "every expense in range" should use
 * `listExpenses`, which walks pages the same way `listProducts` does.
 */
export async function listExpensesPage(
  client: ApiClient,
  options: ListExpensesPageOptions = {},
): Promise<{ expenses: Expense[]; total: number; lastPage: number }> {
  const page = await client.get<JsonApiPage<ExpenseAttrs>>("/expenses", {
    from: options.fromDay,
    to: options.toDay,
    location_id: options.locationId ?? undefined,
    page: options.page ?? 1,
    per_page: options.pageSize ?? 200,
  });

  return {
    expenses: page.data.map(toExpense),
    total: page.meta?.total ?? page.data.length,
    lastPage: page.meta?.last_page ?? 1,
  };
}

/**
 * Newest first. Optional day filter matches the shop calendar column, not
 * created_at — an expense dated yesterday belongs on yesterday's P&L. Walks
 * every page so callers get the same "everything in range" contract the old
 * un-paginated Postgres query gave them.
 */
export async function listExpenses(
  client: ApiClient,
  range?: ExpenseDayRange,
  filter?: ExpenseFilterOptions,
): Promise<Expense[]> {
  const expenses: Expense[] = [];
  let page = 1;
  for (;;) {
    const result = await listExpensesPage(client, {
      ...range,
      ...filter,
      page,
      pageSize: 200,
    });
    expenses.push(...result.expenses);
    if (page >= result.lastPage) return expenses;
    page += 1;
  }
}

/**
 * GAP: no aggregate endpoint on the Tally API (the old query was a single
 * `select amount` summed in Postgres). This walks every page in range via
 * `listExpenses` and sums client-side — fine for a shop-sized expense list;
 * ask backend for a real aggregate if this gets slow.
 */
export async function sumExpenses(
  client: ApiClient,
  range: ExpenseDayRange,
  filter?: ExpenseFilterOptions,
): Promise<number> {
  const expenses = await listExpenses(client, range, filter);
  return roundMoney(expenses.reduce((sum, expense) => sum + expense.amount, 0));
}

export async function getExpense(client: ApiClient, id: string): Promise<Expense | null> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<ExpenseAttrs> }>(`/expenses/${id}`);
    return toExpense(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** `created_by` is stamped server-side from the authenticated user — not part of ExpenseInput. */
export async function createExpense(client: ApiClient, input: ExpenseInput): Promise<Expense> {
  const { data } = await client.post<{ data: JsonApiResource<ExpenseAttrs> }>(
    "/expenses",
    toPayload(input),
  );
  return toExpense(data);
}

export async function updateExpense(
  client: ApiClient,
  id: string,
  patch: Partial<ExpenseInput>,
): Promise<Expense> {
  const { data } = await client.patch<{ data: JsonApiResource<ExpenseAttrs> }>(
    `/expenses/${id}`,
    toPayload(patch),
  );
  return toExpense(data);
}

export async function deleteExpense(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/expenses/${id}`);
}
