/** Local-timezone YYYY-MM-DD — Date#toISOString() is UTC and can shift the calendar day, wrong for anything meant to read as "today" on this device. */
export function toIsoDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses a YYYY-MM-DD string as a local date — `new Date("YYYY-MM-DD")` parses as UTC midnight, which can display as the previous day in a timezone behind UTC. */
export function parseIsoDateString(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Adds (or subtracts, with a negative count) whole days to a YYYY-MM-DD string. */
export function shiftIsoDate(value: string, days: number): string {
  const date = parseIsoDateString(value) ?? new Date();
  date.setDate(date.getDate() + days);
  return toIsoDateString(date);
}

/** Monday of the week `value` falls in. */
export function startOfIsoWeek(value: string): string {
  const date = parseIsoDateString(value) ?? new Date();
  // getDay(): 0 = Sunday. Monday-first means Sunday sits at the end of the week.
  const weekday = date.getDay();
  const lead = (weekday + 6) % 7;
  return shiftIsoDate(value, -lead);
}
