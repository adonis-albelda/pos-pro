"use client";

import { formatMoney, type Expense, type ExpenseBill } from "@double-a/shared-types";
import { Card } from "@/components/ui";

function monthKey(isoDay: string): string {
  return isoDay.slice(0, 7);
}

function addMonths(yyyyMm: string, delta: number): string {
  const parts = yyyyMm.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(yyyyMm: string): string {
  const parts = yyyyMm.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-PH", {
    month: "short",
    timeZone: "UTC",
  });
}

function occurrencesInMonth(bill: ExpenseBill, yyyyMm: string): number {
  if (!bill.active) return 0;
  const due = bill.nextDueDate;
  const dueMonth = monthKey(due);

  switch (bill.frequency) {
    case "once":
      return dueMonth === yyyyMm ? 1 : 0;
    case "monthly":
    case "yearly": {
      // Count if this month is due month or a later cycle month after next due.
      if (yyyyMm < dueMonth) return 0;
      if (bill.frequency === "yearly") {
        const dueM = due.slice(5, 7);
        return yyyyMm.slice(5, 7) === dueM ? 1 : 0;
      }
      return 1;
    }
    case "weekly": {
      // Rough: ~4 weeks if bill is already due this month or earlier; else partial.
      if (yyyyMm < dueMonth) return 0;
      return 4;
    }
    default:
      return 0;
  }
}

export function ExpenseForecast({
  expenses,
  bills,
  today,
}: {
  expenses: Expense[];
  bills: ExpenseBill[];
  today: string;
}) {
  const thisMonth = monthKey(today);
  const historyMonths = Array.from({ length: 6 }, (_, i) => addMonths(thisMonth, i - 5));
  const forecastMonths = Array.from({ length: 3 }, (_, i) => addMonths(thisMonth, i));

  const spentByMonth = new Map<string, number>();
  for (const month of historyMonths) spentByMonth.set(month, 0);
  for (const expense of expenses) {
    const key = monthKey(expense.expenseDate);
    if (!spentByMonth.has(key)) continue;
    spentByMonth.set(key, (spentByMonth.get(key) ?? 0) + expense.amount);
  }

  const forecastByMonth = new Map<string, number>();
  for (const month of forecastMonths) {
    let sum = 0;
    for (const bill of bills) {
      sum += bill.amount * occurrencesInMonth(bill, month);
    }
    forecastByMonth.set(month, sum);
  }

  const horizon = new Date(`${today}T12:00:00`);
  horizon.setDate(horizon.getDate() + 30);
  const horizonDay = horizon.toISOString().slice(0, 10);
  const next30 = bills
    .filter((b) => b.active && b.nextDueDate >= today && b.nextDueDate <= horizonDay)
    .reduce((sum, b) => sum + b.amount, 0);

  const historyMax = Math.max(1, ...historyMonths.map((m) => spentByMonth.get(m) ?? 0));
  const forecastMax = Math.max(1, ...forecastMonths.map((m) => forecastByMonth.get(m) ?? 0));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h2 className="text-body font-medium">Spend — last 6 months</h2>
        <p className="mt-0.5 text-caption text-ink-muted">Ledger expenses by shop month.</p>
        <div className="mt-4 flex h-36 items-end gap-2">
          {historyMonths.map((month) => {
            const value = spentByMonth.get(month) ?? 0;
            const height = Math.max(4, Math.round((value / historyMax) * 100));
            return (
              <div key={month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${height}%` }}
                  title={formatMoney(value)}
                />
                <span className="text-caption text-ink-muted">{monthLabel(month)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-body font-medium">Forecast — next 3 months</h2>
            <p className="mt-0.5 text-caption text-ink-muted">
              From active bills (weekly ≈ 4× / month).
            </p>
          </div>
          <p className="text-caption font-medium text-ink">
            Next 30 days: {formatMoney(next30)}
          </p>
        </div>
        <div className="mt-4 flex h-36 items-end gap-3">
          {forecastMonths.map((month) => {
            const value = forecastByMonth.get(month) ?? 0;
            const height = Math.max(4, Math.round((value / forecastMax) * 100));
            return (
              <div key={month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-caption num text-ink-muted">{formatMoney(value)}</span>
                <div
                  className="w-full rounded-t bg-amber-500/70"
                  style={{ height: `${height}%` }}
                  title={formatMoney(value)}
                />
                <span className="text-caption text-ink-muted">{monthLabel(month)}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
