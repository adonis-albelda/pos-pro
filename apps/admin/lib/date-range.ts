import { STORE_TIME_ZONE } from "@double-a/shared-types";
import type { DateRange } from "@double-a/api-client/queries";

/**
 * Report days are shop days. The database buckets on STORE_TIME_ZONE
 * (public.store_timezone()), so the dashboard has to hand it boundaries cut the
 * same way — otherwise "today" on a server running in UTC starts at 8am in the
 * shop and the numbers never tie out.
 *
 * Manila has no daylight saving, so a fixed offset is exact.
 */
const STORE_OFFSET = "+08:00";

export const RANGE_PRESETS = ["today", "7d", "month", "last-month", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  month: "This month",
  "last-month": "Last month",
  custom: "Custom",
};

/** Today in the shop, as yyyy-mm-dd. */
export function storeToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: STORE_TIME_ZONE });
}

export function shiftDays(day: string, days: number): string {
  const [year = 1970, month = 1, date = 1] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + days));
  return shifted.toISOString().slice(0, 10);
}

export function firstOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Monday of the week `day` falls in — same Monday-first convention as monthGrid. */
export function startOfWeek(day: string): string {
  const [year = 1970, month = 1, date = 1] = day.split("-").map(Number);
  // getUTCDay: 0 = Sunday. Monday-first means Sunday sits at the end.
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  const lead = (weekday + 6) % 7;
  return shiftDays(day, -lead);
}

/** Same day-of-month is not guaranteed to exist, so month steps clamp to the 1st. */
export function shiftMonths(day: string, months: number): string {
  const [year = 1970, month = 1] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  return shifted.toISOString().slice(0, 10);
}

/** Midnight at the start of a shop day, as an instant the database understands. */
export function startOfStoreDay(day: string): string {
  return new Date(`${day}T00:00:00${STORE_OFFSET}`).toISOString();
}

/** Midnight after a shop day — the exclusive end of a range. */
export function endOfStoreDay(day: string): string {
  return startOfStoreDay(shiftDays(day, 1));
}

export function isValidDay(value: string | undefined | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

export function monthLabel(day: string): string {
  return new Date(`${day}T00:00:00${STORE_OFFSET}`).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: STORE_TIME_ZONE,
  });
}

/**
 * Six weeks of days covering the month `anchor` falls in, Monday first, so a
 * calendar grid never changes height as the user steps through months.
 */
export function monthGrid(anchor: string): string[] {
  const first = firstOfMonth(anchor);
  const [year = 1970, month = 1] = first.split("-").map(Number);
  // getUTCDay: 0 = Sunday. Monday-first means Sunday sits at the end.
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lead = (weekday + 6) % 7;
  const start = shiftDays(first, -lead);
  return Array.from({ length: 42 }, (_, index) => shiftDays(start, index));
}

export function dayOfMonth(day: string): number {
  return Number(day.slice(8, 10));
}

export function isSameMonth(day: string, other: string): boolean {
  return day.slice(0, 7) === other.slice(0, 7);
}

export interface ResolvedRange {
  preset: RangePreset;
  /** Inclusive first shop day, yyyy-mm-dd. */
  fromDay: string;
  /** Inclusive last shop day, yyyy-mm-dd. */
  toDay: string;
  /** What the report functions take: `from` inclusive, `to` exclusive. */
  range: DateRange;
  label: string;
}

export function resolveRange(params: {
  preset?: string;
  from?: string;
  to?: string;
}): ResolvedRange {
  const today = storeToday();
  const preset = (RANGE_PRESETS as readonly string[]).includes(params.preset ?? "")
    ? (params.preset as RangePreset)
    : params.from || params.to
      ? "custom"
      : "today";

  let fromDay = today;
  let toDay = today;

  if (preset === "7d") {
    fromDay = shiftDays(today, -6);
  } else if (preset === "month") {
    fromDay = firstOfMonth(today);
  } else if (preset === "last-month") {
    const lastDayOfLastMonth = shiftDays(firstOfMonth(today), -1);
    fromDay = firstOfMonth(lastDayOfLastMonth);
    toDay = lastDayOfLastMonth;
  } else if (preset === "custom") {
    fromDay = isValidDay(params.from) ? params.from : today;
    toDay = isValidDay(params.to) ? params.to : today;
  }

  // A backwards range would silently report nothing at all.
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];

  return {
    preset,
    fromDay,
    toDay,
    range: {
      from: startOfStoreDay(fromDay),
      to: startOfStoreDay(shiftDays(toDay, 1)),
    },
    label: describeRange(fromDay, toDay),
  };
}

/** Today's shop day, for the dashboard. */
export function todayRange(): DateRange {
  return resolveRange({ preset: "today" }).range;
}

/** Which shop day an instant belongs to, as yyyy-mm-dd. */
export function storeDayOf(instant: string): string {
  return new Date(instant).toLocaleDateString("en-CA", { timeZone: STORE_TIME_ZONE });
}

export function formatStoreDay(day: string): string {
  return new Date(`${day}T00:00:00${STORE_OFFSET}`).toLocaleDateString("en-PH", {
    dateStyle: "medium",
    timeZone: STORE_TIME_ZONE,
  });
}

export function describeRange(fromDay: string, toDay: string): string {
  return fromDay === toDay
    ? formatStoreDay(fromDay)
    : `${formatStoreDay(fromDay)} to ${formatStoreDay(toDay)}`;
}

/**
 * An open-ended day window, for history that reads back further than a report
 * range: either end may be missing, and both missing means everything ever
 * recorded. Movement history defaults to that rather than to today, because a
 * shop that has not restocked this morning should still see its last delivery.
 */
export interface DayWindow {
  fromDay: string | null;
  toDay: string | null;
  /** Inclusive instant for the query, absent when the window opens at the start. */
  from?: string;
  /** Exclusive instant for the query, absent when the window runs to now. */
  to?: string;
  label: string;
}

export function resolveDayWindow(params: { from?: string; to?: string }): DayWindow {
  let fromDay = isValidDay(params.from) ? params.from : null;
  let toDay = isValidDay(params.to) ? params.to : null;

  // A backwards window would silently match nothing at all.
  if (fromDay && toDay && fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];

  return {
    fromDay,
    toDay,
    from: fromDay ? startOfStoreDay(fromDay) : undefined,
    to: toDay ? endOfStoreDay(toDay) : undefined,
    label: describeDayWindow(fromDay, toDay),
  };
}

export function describeDayWindow(
  fromDay: string | null,
  toDay: string | null,
): string {
  if (fromDay && toDay) return describeRange(fromDay, toDay);
  if (fromDay) return `${formatStoreDay(fromDay)} onwards`;
  if (toDay) return `Up to ${formatStoreDay(toDay)}`;
  return "All time";
}
