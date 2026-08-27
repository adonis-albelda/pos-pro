"use server";

import { revalidatePath } from "next/cache";
import {
  EXPENSE_BILL_FREQUENCIES,
  EXPENSE_BILL_REMIND_DAYS_MAX,
  EXPENSE_CATEGORY_MAX,
  EXPENSE_DESCRIPTION_MAX,
  EXPENSE_NOTE_MAX,
  roundMoney,
  type ExpenseBillFrequency,
} from "@double-a/shared-types";
import { ApiError } from "@double-a/api-client";
import {
  createExpenseBill,
  deleteExpenseBill,
  markExpenseBillPaid,
  updateExpenseBill,
} from "@double-a/api-client/queries";
import type { FormState } from "@/lib/form-state";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";
import { isShopAdmin } from "@/lib/authz";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function revalidateExpenseViews() {
  revalidatePath("/expenses");
  revalidatePath("/");
  revalidatePath("/reports");
}

function isFrequency(value: string): value is ExpenseBillFrequency {
  return (EXPENSE_BILL_FREQUENCIES as readonly string[]).includes(value);
}

export async function saveExpenseBill(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, "id");
  const description = text(formData, "description");
  const categoryRaw = text(formData, "category");
  const noteRaw = text(formData, "note");
  const frequency = text(formData, "frequency");
  const nextDueDate = text(formData, "next_due_date");
  const amount = Number(formData.get("amount") ?? 0);
  const remindDaysBefore = Number(formData.get("remind_days_before") ?? 0);
  const remindersEnabled = formData.get("reminders_enabled") === "on";
  const active = id ? formData.get("active") === "on" : true;

  if (!description) {
    return { error: "Say what the bill is for.", ok: false };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be greater than zero.", ok: false };
  }
  if (!isFrequency(frequency)) {
    return { error: "Pick a valid frequency.", ok: false };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
    return { error: "Pick a valid due date.", ok: false };
  }
  if (
    !Number.isFinite(remindDaysBefore) ||
    remindDaysBefore < 0 ||
    remindDaysBefore > EXPENSE_BILL_REMIND_DAYS_MAX
  ) {
    return {
      error: `Remind days must be 0–${EXPENSE_BILL_REMIND_DAYS_MAX}.`,
      ok: false,
    };
  }

  const user = await getCurrentUser();
  if (!isShopAdmin(user)) {
    return { error: "Only the owner can manage bills.", ok: false };
  }

  const row = {
    description: description.slice(0, EXPENSE_DESCRIPTION_MAX),
    amount: roundMoney(amount),
    category: categoryRaw ? categoryRaw.slice(0, EXPENSE_CATEGORY_MAX) : null,
    note: noteRaw ? noteRaw.slice(0, EXPENSE_NOTE_MAX) : null,
    frequency,
    nextDueDate,
    remindDaysBefore: Math.floor(remindDaysBefore),
    remindersEnabled,
    active: id ? active : true,
  };

  try {
    const client = getAuthedClient();
    if (id) {
      await updateExpenseBill(client, id, row);
    } else {
      await createExpenseBill(client, row);
    }
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return { error: error.message, ok: false };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not save the bill: ${message}`, ok: false };
  }

  revalidateExpenseViews();
  return { error: null, ok: true };
}

export async function removeExpenseBill(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;

  const user = await getCurrentUser();
  if (!isShopAdmin(user)) return;

  await deleteExpenseBill(getAuthedClient(), id);
  revalidateExpenseViews();
}

export async function payExpenseBill(formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const expenseDate = text(formData, "expense_date");
  if (!id) return { error: "Missing bill.", ok: false };

  const user = await getCurrentUser();
  if (!isShopAdmin(user)) {
    return { error: "Only the owner can mark bills paid.", ok: false };
  }

  try {
    await markExpenseBillPaid(
      getAuthedClient(),
      id,
      /^\d{4}-\d{2}-\d{2}$/.test(expenseDate) ? expenseDate : null,
    );
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return { error: error.message, ok: false };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not mark paid: ${message}`, ok: false };
  }

  revalidateExpenseViews();
  return { error: null, ok: true };
}
