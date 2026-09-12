import type { ScheduleAssignment, WorkSchedule } from "@double-a/shared-types";
import { getDb } from "./index";

interface WorkScheduleRow {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: number;
  break_minutes: number;
  grace_minutes: number;
  is_active: number;
}

function toWorkSchedule(row: WorkScheduleRow): WorkSchedule {
  return {
    id: row.id,
    name: row.name,
    startTime: row.start_time,
    endTime: row.end_time,
    crossesMidnight: row.crosses_midnight === 1,
    breakMinutes: row.break_minutes,
    graceMinutes: row.grace_minutes,
    isActive: row.is_active === 1,
  };
}

/** Whole-replace on pull, same reasoning as discount_rules — a deactivated schedule must leave the device. */
export async function replaceWorkSchedules(schedules: WorkSchedule[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM work_schedules");
    for (const schedule of schedules) {
      await db.runAsync(
        `INSERT INTO work_schedules
           (id, name, start_time, end_time, crosses_midnight, break_minutes, grace_minutes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        schedule.id,
        schedule.name,
        schedule.startTime,
        schedule.endTime,
        schedule.crossesMidnight ? 1 : 0,
        schedule.breakMinutes,
        schedule.graceMinutes,
        schedule.isActive ? 1 : 0,
      );
    }
  });
}

/** Realtime counterpart — one row at a time, same shape as db/discounts.ts's upsertLocalDiscountRule. */
export async function upsertLocalWorkSchedule(schedule: WorkSchedule): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO work_schedules
       (id, name, start_time, end_time, crosses_midnight, break_minutes, grace_minutes, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       crosses_midnight = excluded.crosses_midnight,
       break_minutes = excluded.break_minutes,
       grace_minutes = excluded.grace_minutes,
       is_active = excluded.is_active`,
    schedule.id,
    schedule.name,
    schedule.startTime,
    schedule.endTime,
    schedule.crossesMidnight ? 1 : 0,
    schedule.breakMinutes,
    schedule.graceMinutes,
    schedule.isActive ? 1 : 0,
  );
}

export async function deleteLocalWorkSchedule(id: string): Promise<void> {
  await getDb().runAsync("DELETE FROM work_schedules WHERE id = ?", id);
}

export async function listLocalWorkSchedules(): Promise<WorkSchedule[]> {
  const rows = await getDb().getAllAsync<WorkScheduleRow>(
    "SELECT * FROM work_schedules WHERE is_active = 1 ORDER BY name",
  );
  return rows.map(toWorkSchedule);
}

interface ScheduleAssignmentRow {
  id: string;
  user_id: string;
  day_of_week: number;
  work_schedule_id: string | null;
  effective_from: string;
  effective_to: string | null;
}

function toScheduleAssignment(row: ScheduleAssignmentRow): ScheduleAssignment {
  return {
    id: row.id,
    userId: row.user_id,
    dayOfWeek: row.day_of_week,
    workScheduleId: row.work_schedule_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

/** Whole-replace on pull — same reasoning as work_schedules. */
export async function replaceScheduleAssignments(assignments: ScheduleAssignment[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM schedule_assignments");
    for (const assignment of assignments) {
      await db.runAsync(
        `INSERT INTO schedule_assignments
           (id, user_id, day_of_week, work_schedule_id, effective_from, effective_to)
         VALUES (?, ?, ?, ?, ?, ?)`,
        assignment.id,
        assignment.userId,
        assignment.dayOfWeek,
        assignment.workScheduleId,
        assignment.effectiveFrom,
        assignment.effectiveTo,
      );
    }
  });
}

/** Realtime counterpart — one row at a time. */
export async function upsertLocalScheduleAssignment(assignment: ScheduleAssignment): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO schedule_assignments
       (id, user_id, day_of_week, work_schedule_id, effective_from, effective_to)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       user_id = excluded.user_id,
       day_of_week = excluded.day_of_week,
       work_schedule_id = excluded.work_schedule_id,
       effective_from = excluded.effective_from,
       effective_to = excluded.effective_to`,
    assignment.id,
    assignment.userId,
    assignment.dayOfWeek,
    assignment.workScheduleId,
    assignment.effectiveFrom,
    assignment.effectiveTo,
  );
}

export async function deleteLocalScheduleAssignment(id: string): Promise<void> {
  await getDb().runAsync("DELETE FROM schedule_assignments WHERE id = ?", id);
}

/** This user's schedule for one weekday, active as of `today` (yyyy-mm-dd). */
export async function getLocalScheduleAssignmentFor(
  userId: string,
  dayOfWeek: number,
  today: string,
): Promise<ScheduleAssignment | null> {
  const row = await getDb().getFirstAsync<ScheduleAssignmentRow>(
    `SELECT * FROM schedule_assignments
      WHERE user_id = ? AND day_of_week = ?
        AND effective_from <= ?
        AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY effective_from DESC
      LIMIT 1`,
    userId,
    dayOfWeek,
    today,
    today,
  );
  return row ? toScheduleAssignment(row) : null;
}

export async function listLocalScheduleAssignments(userId: string): Promise<ScheduleAssignment[]> {
  const rows = await getDb().getAllAsync<ScheduleAssignmentRow>(
    "SELECT * FROM schedule_assignments WHERE user_id = ? ORDER BY day_of_week",
    userId,
  );
  return rows.map(toScheduleAssignment);
}
