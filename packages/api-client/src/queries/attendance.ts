import type {
  AttendanceRecord,
  AttendanceStatus,
  ScheduleAssignment,
  WorkSchedule,
} from "@double-a/shared-types";
import type { ApiClient, JsonApiResource } from "../http";

/* --------------------------------------------------------------------- */
/* Work schedules                                                         */
/* --------------------------------------------------------------------- */

export interface WorkScheduleAttrs {
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  break_minutes: number;
  grace_minutes: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export function toWorkSchedule(resource: JsonApiResource<WorkScheduleAttrs>): WorkSchedule {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    startTime: a.start_time,
    endTime: a.end_time,
    crossesMidnight: a.crosses_midnight,
    breakMinutes: a.break_minutes,
    graceMinutes: a.grace_minutes,
    isActive: a.is_active,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export async function listWorkSchedules(client: ApiClient): Promise<WorkSchedule[]> {
  const { data } = await client.get<{ data: JsonApiResource<WorkScheduleAttrs>[] }>("/work-schedules");
  return data.map(toWorkSchedule);
}

export interface UpsertWorkScheduleInput {
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight?: boolean;
  breakMinutes?: number;
  graceMinutes?: number;
  isActive?: boolean;
}

export async function createWorkSchedule(client: ApiClient, input: UpsertWorkScheduleInput): Promise<WorkSchedule> {
  const { data } = await client.post<{ data: JsonApiResource<WorkScheduleAttrs> }>("/work-schedules", {
    name: input.name,
    start_time: input.startTime,
    end_time: input.endTime,
    crosses_midnight: input.crossesMidnight,
    break_minutes: input.breakMinutes ?? 0,
    grace_minutes: input.graceMinutes ?? 0,
    is_active: input.isActive ?? true,
  });
  return toWorkSchedule(data);
}

export async function updateWorkSchedule(
  client: ApiClient,
  id: string,
  patch: Partial<UpsertWorkScheduleInput>,
): Promise<WorkSchedule> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.startTime !== undefined) body.start_time = patch.startTime;
  if (patch.endTime !== undefined) body.end_time = patch.endTime;
  if (patch.crossesMidnight !== undefined) body.crosses_midnight = patch.crossesMidnight;
  if (patch.breakMinutes !== undefined) body.break_minutes = patch.breakMinutes;
  if (patch.graceMinutes !== undefined) body.grace_minutes = patch.graceMinutes;
  if (patch.isActive !== undefined) body.is_active = patch.isActive;
  const { data } = await client.patch<{ data: JsonApiResource<WorkScheduleAttrs> }>(`/work-schedules/${id}`, body);
  return toWorkSchedule(data);
}

export async function deleteWorkSchedule(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/work-schedules/${id}`);
}

/* --------------------------------------------------------------------- */
/* Schedule assignments                                                   */
/* --------------------------------------------------------------------- */

export interface ScheduleAssignmentAttrs {
  user_id: string;
  user_name?: string | null;
  day_of_week: number;
  work_schedule_id: string | null;
  work_schedule_name?: string | null;
  effective_from: string;
  effective_to: string | null;
  created_at?: string;
  updated_at?: string;
}

export function toScheduleAssignment(resource: JsonApiResource<ScheduleAssignmentAttrs>): ScheduleAssignment {
  const a = resource.attributes;
  return {
    id: resource.id,
    userId: a.user_id,
    userName: a.user_name,
    dayOfWeek: a.day_of_week,
    workScheduleId: a.work_schedule_id,
    workScheduleName: a.work_schedule_name,
    effectiveFrom: a.effective_from,
    effectiveTo: a.effective_to,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export async function listScheduleAssignments(
  client: ApiClient,
  filter: { userId?: string } = {},
): Promise<ScheduleAssignment[]> {
  const { data } = await client.get<{ data: JsonApiResource<ScheduleAssignmentAttrs>[] }>(
    "/schedule-assignments",
    { user_id: filter.userId },
  );
  return data.map(toScheduleAssignment);
}

export interface UpsertScheduleAssignmentInput {
  userId: string;
  dayOfWeek: number;
  /** Null = explicit rest day. */
  workScheduleId: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export async function createScheduleAssignment(
  client: ApiClient,
  input: UpsertScheduleAssignmentInput,
): Promise<ScheduleAssignment> {
  const { data } = await client.post<{ data: JsonApiResource<ScheduleAssignmentAttrs> }>("/schedule-assignments", {
    user_id: input.userId,
    day_of_week: input.dayOfWeek,
    work_schedule_id: input.workScheduleId,
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo ?? null,
  });
  return toScheduleAssignment(data);
}

export async function updateScheduleAssignment(
  client: ApiClient,
  id: string,
  patch: Partial<Omit<UpsertScheduleAssignmentInput, "userId">>,
): Promise<ScheduleAssignment> {
  const body: Record<string, unknown> = {};
  if (patch.dayOfWeek !== undefined) body.day_of_week = patch.dayOfWeek;
  if (patch.workScheduleId !== undefined) body.work_schedule_id = patch.workScheduleId;
  if (patch.effectiveFrom !== undefined) body.effective_from = patch.effectiveFrom;
  if (patch.effectiveTo !== undefined) body.effective_to = patch.effectiveTo;
  const { data } = await client.patch<{ data: JsonApiResource<ScheduleAssignmentAttrs> }>(
    `/schedule-assignments/${id}`,
    body,
  );
  return toScheduleAssignment(data);
}

export async function deleteScheduleAssignment(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/schedule-assignments/${id}`);
}

/* --------------------------------------------------------------------- */
/* Attendance settings                                                    */
/* --------------------------------------------------------------------- */

export interface AttendanceSettingsAttrs {
  attendance_enforcement_enabled: boolean;
}

export async function getAttendanceSettings(client: ApiClient): Promise<{ enforcementEnabled: boolean }> {
  const { data } = await client.get<{ data: AttendanceSettingsAttrs }>("/attendance-settings");
  return { enforcementEnabled: data.attendance_enforcement_enabled };
}

export async function updateAttendanceSettings(
  client: ApiClient,
  enforcementEnabled: boolean,
): Promise<{ enforcementEnabled: boolean }> {
  const { data } = await client.patch<{ data: AttendanceSettingsAttrs }>("/attendance-settings", {
    attendance_enforcement_enabled: enforcementEnabled,
  });
  return { enforcementEnabled: data.attendance_enforcement_enabled };
}

/* --------------------------------------------------------------------- */
/* Attendance records                                                     */
/* --------------------------------------------------------------------- */

export interface AttendanceRecordAttrs {
  user_id: string;
  user_name?: string | null;
  employee_name?: string | null;
  location_id: string | null;
  location_name?: string | null;
  work_schedule_id: string | null;
  work_schedule_name?: string | null;
  date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  grace_minutes: number;
  expected_break_minutes: number;
  clock_in: string | null;
  clock_out: string | null;
  break_started_at: string | null;
  status: AttendanceStatus;
  phase: string;
  is_clocked_in: boolean;
  is_on_break: boolean;
  late_minutes: number | null;
  early_out_minutes: number | null;
  overtime_minutes: number | null;
  break_minutes: number;
  created_at?: string;
  updated_at?: string;
}

export function toAttendanceRecord(resource: JsonApiResource<AttendanceRecordAttrs>): AttendanceRecord {
  const a = resource.attributes;
  return {
    id: resource.id,
    userId: a.user_id,
    userName: a.user_name,
    employeeName: a.employee_name,
    locationId: a.location_id,
    locationName: a.location_name,
    workScheduleId: a.work_schedule_id,
    workScheduleName: a.work_schedule_name,
    date: a.date,
    scheduledStart: a.scheduled_start,
    scheduledEnd: a.scheduled_end,
    graceMinutes: a.grace_minutes,
    expectedBreakMinutes: a.expected_break_minutes,
    clockIn: a.clock_in,
    clockOut: a.clock_out,
    breakStartedAt: a.break_started_at,
    status: a.status,
    phase: a.phase as AttendanceRecord["phase"],
    isClockedIn: a.is_clocked_in,
    isOnBreak: a.is_on_break,
    lateMinutes: a.late_minutes,
    earlyOutMinutes: a.early_out_minutes,
    overtimeMinutes: a.overtime_minutes,
    breakMinutes: a.break_minutes,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export interface AttendanceFilter {
  date?: string;
  from?: string;
  to?: string;
  userId?: string;
  workScheduleId?: string;
  locationId?: string;
  status?: AttendanceStatus;
}

/** Backs both the "Today's Attendance" dashboard and history — see IndexAttendanceController. */
export async function listAttendance(client: ApiClient, filter: AttendanceFilter = {}): Promise<AttendanceRecord[]> {
  const { data } = await client.get<{ data: JsonApiResource<AttendanceRecordAttrs>[] }>("/attendance", {
    date: filter.date,
    from: filter.from,
    to: filter.to,
    user_id: filter.userId,
    work_schedule_id: filter.workScheduleId,
    location_id: filter.locationId,
    status: filter.status,
  });
  return data.map(toAttendanceRecord);
}

export async function getAttendanceRecord(client: ApiClient, id: string): Promise<AttendanceRecord> {
  const { data } = await client.get<{ data: JsonApiResource<AttendanceRecordAttrs> }>(`/attendance/${id}`);
  return toAttendanceRecord(data);
}

/** Turns a computed "Absent" entry into a real row so it can be corrected. */
export async function materializeAttendance(
  client: ApiClient,
  userId: string,
  date: string,
): Promise<AttendanceRecord> {
  const { data } = await client.post<{ data: JsonApiResource<AttendanceRecordAttrs> }>("/attendance/materialize", {
    user_id: userId,
    date,
  });
  return toAttendanceRecord(data);
}

export interface CorrectAttendanceInput {
  clockIn?: string | null;
  clockOut?: string | null;
  breakMinutes?: number;
  locationId?: string | null;
  reason: string;
}

export async function correctAttendance(
  client: ApiClient,
  id: string,
  input: CorrectAttendanceInput,
): Promise<AttendanceRecord> {
  const body: Record<string, unknown> = { reason: input.reason };
  if (input.clockIn !== undefined) body.clock_in = input.clockIn;
  if (input.clockOut !== undefined) body.clock_out = input.clockOut;
  if (input.breakMinutes !== undefined) body.break_minutes = input.breakMinutes;
  if (input.locationId !== undefined) body.location_id = input.locationId;
  const { data } = await client.patch<{ data: JsonApiResource<AttendanceRecordAttrs> }>(
    `/attendance/${id}/correct`,
    body,
  );
  return toAttendanceRecord(data);
}

/* --------------------------------------------------------------------- */
/* Self-service — clock in/out for the PIN-verified cashier               */
/* --------------------------------------------------------------------- */

export async function getMyTodayAttendance(client: ApiClient, userId: string): Promise<AttendanceRecord> {
  const { data } = await client.get<{ data: JsonApiResource<AttendanceRecordAttrs> }>("/attendance/today", {
    user_id: userId,
  });
  return toAttendanceRecord(data);
}

export async function clockIn(client: ApiClient, userId: string, locationId?: string | null): Promise<AttendanceRecord> {
  const { data } = await client.post<{ data: JsonApiResource<AttendanceRecordAttrs> }>("/attendance/clock-in", {
    user_id: userId,
    location_id: locationId ?? undefined,
  });
  return toAttendanceRecord(data);
}

export async function startBreak(client: ApiClient, userId: string): Promise<AttendanceRecord> {
  const { data } = await client.post<{ data: JsonApiResource<AttendanceRecordAttrs> }>("/attendance/break/start", {
    user_id: userId,
  });
  return toAttendanceRecord(data);
}

export async function endBreak(client: ApiClient, userId: string): Promise<AttendanceRecord> {
  const { data } = await client.post<{ data: JsonApiResource<AttendanceRecordAttrs> }>("/attendance/break/end", {
    user_id: userId,
  });
  return toAttendanceRecord(data);
}

export async function clockOut(client: ApiClient, userId: string): Promise<AttendanceRecord> {
  const { data } = await client.post<{ data: JsonApiResource<AttendanceRecordAttrs> }>("/attendance/clock-out", {
    user_id: userId,
  });
  return toAttendanceRecord(data);
}
