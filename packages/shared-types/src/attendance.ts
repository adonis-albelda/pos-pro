/**
 * Attendance + work schedules. Keyed on user_id — the authenticated POS
 * account — never employee_id. See the Laravel migration's own docblock
 * (create_attendance_tables) for the full reasoning.
 */

export type AttendanceStatus =
  | "rest_day"
  | "not_clocked_in"
  | "absent"
  | "on_break"
  | "missing_clock_out"
  | "early_out"
  | "late"
  | "on_time";

export type AttendancePhase = "not_started" | "working" | "on_break" | "completed";

export interface WorkSchedule {
  id: string;
  name: string;
  /** "HH:MM", 24-hour. */
  startTime: string;
  /** "HH:MM", 24-hour. */
  endTime: string;
  /** True when the shift's end falls on the following calendar day. */
  crossesMidnight: boolean;
  breakMinutes: number;
  graceMinutes: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ScheduleAssignment {
  id: string;
  userId: string;
  userName?: string | null;
  /** 0 = Sunday .. 6 = Saturday. */
  dayOfWeek: number;
  /** Null = explicit rest day. */
  workScheduleId: string | null;
  workScheduleName?: string | null;
  /** yyyy-mm-dd */
  effectiveFrom: string;
  /** yyyy-mm-dd, null = open-ended. */
  effectiveTo: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Everything needed to render one day's attendance — evaluation fields are computed server-side, never stored. */
export interface AttendanceRecord {
  id: string;
  userId: string;
  userName?: string | null;
  employeeName?: string | null;
  locationId: string | null;
  locationName?: string | null;
  workScheduleId: string | null;
  workScheduleName?: string | null;
  /** yyyy-mm-dd, shop day. */
  date: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  graceMinutes: number;
  expectedBreakMinutes: number;
  clockIn: string | null;
  clockOut: string | null;
  breakStartedAt: string | null;
  status: AttendanceStatus;
  phase: AttendancePhase;
  isClockedIn: boolean;
  isOnBreak: boolean;
  lateMinutes: number | null;
  earlyOutMinutes: number | null;
  overtimeMinutes: number | null;
  breakMinutes: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceCorrection {
  id: string;
  attendanceRecordId: string;
  correctedBy: string | null;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: string;
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  rest_day: "Rest Day",
  not_clocked_in: "Not Clocked In",
  absent: "Absent",
  on_break: "On Break",
  missing_clock_out: "Missing Clock Out",
  early_out: "Early Out",
  late: "Late",
  on_time: "On Time",
};

export const DAY_OF_WEEK_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "8:00 AM" from a 24-hour "HH:MM" string — same shelf-price-agnostic formatting used across the POS. */
export function formatScheduleTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
}

/** "17 minutes" / "1 hour 5 minutes" — used for late/early-out/overtime/break durations. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;
  return remainder === 0 ? hourPart : `${hourPart} ${remainder} minute${remainder === 1 ? "" : "s"}`;
}
