"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import {
  CalendarClock,
  Clock,
  Pencil,
  Plus,
  Save,
  Settings as SettingsIcon,
  Trash2,
  UserX,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import {
  ATTENDANCE_STATUS_LABELS,
  DAY_OF_WEEK_LABELS,
  formatMinutes,
  formatScheduleTime,
  ROLES,
  type AttendanceRecord,
  type AttendanceStatus,
  type ScheduleAssignment,
  type WorkSchedule,
} from "@double-a/shared-types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardListSkeleton,
  Field,
  IconButton,
  Input,
  PageHeader,
  Select,
  StatCard,
  StatCardSkeleton,
  Table,
  TableSkeleton,
  Td,
  Th,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/overlay";
import { TabNav } from "@/components/tab-nav";
import { useUsers } from "@/lib/query/users";
import { useLocations } from "@/lib/query/locations";
import {
  useAttendance,
  useAttendanceSettings,
  useCorrectAttendance,
  useCreateScheduleAssignment,
  useCreateWorkSchedule,
  useDeleteScheduleAssignment,
  useDeleteWorkSchedule,
  useMaterializeAttendance,
  useScheduleAssignments,
  useUpdateAttendanceSettings,
  useUpdateScheduleAssignment,
  useUpdateWorkSchedule,
  useWorkSchedules,
} from "@/lib/query/attendance";

const TABS = [
  { key: "today", label: "Today", icon: CalendarClock },
  { key: "schedules", label: "Schedules", icon: Clock },
  { key: "assignments", label: "Assignments", icon: Users },
  { key: "history", label: "History", icon: CalendarClock },
  { key: "settings", label: "Settings", icon: SettingsIcon },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function parseTab(raw: string | null): TabKey {
  if (raw === "schedules" || raw === "assignments" || raw === "history" || raw === "settings") return raw;
  return "today";
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return first ?? error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

const STATUS_TONE: Record<AttendanceStatus, "success" | "warning" | "danger" | "neutral"> = {
  on_time: "success",
  late: "warning",
  early_out: "warning",
  on_break: "warning",
  missing_clock_out: "danger",
  absent: "danger",
  not_clocked_in: "neutral",
  rest_day: "neutral",
};

function StatusBadge({ status }: { status: AttendanceStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{ATTENDANCE_STATUS_LABELS[status]}</Badge>;
}

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/* ------------------------------------------------------------------ */
/* Today                                                                */
/* ------------------------------------------------------------------ */

function TodayTab() {
  const today = new Date().toISOString().slice(0, 10);
  const attendanceQuery = useAttendance({ date: today });
  const usersQuery = useUsers();
  const locationsQuery = useLocations({ includeInactive: false });
  const materialize = useMaterializeAttendance();
  const [correcting, setCorrecting] = useState<AttendanceRecord | null>(null);

  const records = attendanceQuery.data ?? [];
  const clockedIn = records.filter((r) => r.isClockedIn).length;
  const late = records.filter((r) => r.status === "late").length;
  const absent = records.filter((r) => r.status === "absent").length;

  if (attendanceQuery.isPending || usersQuery.isPending) {
    return (
      <div className="space-y-4 p-3 sm:p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <CardListSkeleton count={3} />
      </div>
    );
  }

  function openCorrection(record: AttendanceRecord) {
    if (record.id.startsWith("virtual:")) {
      materialize.mutate(
        { userId: record.userId, date: record.date },
        {
          onSuccess: (real) => setCorrecting(real),
          onError: (error) => toast.error(errorMessage(error, "Could not open this day for correction.")),
        },
      );
      return;
    }
    setCorrecting(record);
  }

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Clocked in" value={String(clockedIn)} hint={`of ${records.length} scheduled`} tone="success" />
        <StatCard icon={Clock} label="Late" value={String(late)} tone={late > 0 ? "warning" : "success"} />
        <StatCard icon={UserX} label="Absent" value={String(absent)} tone={absent > 0 ? "danger" : "success"} />
      </div>

      {records.length === 0 ? (
        <p className="py-8 text-center text-body text-ink-muted">No one is scheduled today.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Schedule</Th>
              <Th>Clock in</Th>
              <Th>Clock out</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <Td className="font-medium text-ink">{record.employeeName ?? record.userName ?? record.userId.slice(0, 8)}</Td>
                <Td className="text-caption text-ink-muted">
                  {record.scheduledStart && record.scheduledEnd
                    ? `${formatClock(record.scheduledStart)} – ${formatClock(record.scheduledEnd)}`
                    : "—"}
                </Td>
                <Td>{formatClock(record.clockIn)}</Td>
                <Td>{formatClock(record.clockOut)}</Td>
                <Td>
                  <div className="flex flex-col gap-1">
                    <StatusBadge status={record.status} />
                    {record.lateMinutes ? (
                      <span className="text-caption text-ink-muted">Late {formatMinutes(record.lateMinutes)}</span>
                    ) : null}
                  </div>
                </Td>
                <Td>
                  <IconButton icon={Pencil} label="Correct attendance" onClick={() => openCorrection(record)} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <CorrectionSheet record={correcting} onClose={() => setCorrecting(null)} locations={locationsQuery.data ?? []} />
    </div>
  );
}

function CorrectionSheet({
  record,
  onClose,
  locations,
}: {
  record: AttendanceRecord | null;
  onClose: () => void;
  locations: { id: string; name: string }[];
}) {
  const correct = useCorrectAttendance();
  if (!record) return null;

  return (
    <Card className="border-primary/40">
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-body font-semibold text-ink">
            Correct {record.employeeName ?? record.userName} — {record.date}
          </p>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const reason = String(form.get("reason") ?? "").trim();
            if (!reason) {
              toast.error("A reason is required.");
              return;
            }
            correct.mutate(
              {
                id: record.id,
                input: {
                  clockIn: String(form.get("clock_in") ?? "") || null,
                  clockOut: String(form.get("clock_out") ?? "") || null,
                  breakMinutes: Number(form.get("break_minutes") ?? 0),
                  locationId: String(form.get("location_id") ?? "") || null,
                  reason,
                },
              },
              {
                onSuccess: () => {
                  toast.success("Attendance corrected.");
                  onClose();
                },
                onError: (error) => toast.error(errorMessage(error, "Could not save correction.")),
              },
            );
          }}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Clock in">
              <Input type="datetime-local" name="clock_in" defaultValue={record.clockIn?.slice(0, 16) ?? ""} />
            </Field>
            <Field label="Clock out">
              <Input type="datetime-local" name="clock_out" defaultValue={record.clockOut?.slice(0, 16) ?? ""} />
            </Field>
            <Field label="Break minutes">
              <Input type="number" min={0} name="break_minutes" defaultValue={record.breakMinutes} />
            </Field>
            <Field label="Location">
              <Select name="location_id" defaultValue={record.locationId ?? ""}>
                <option value="">—</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Reason" required>
            <Input name="reason" placeholder="Forgot to clock in" required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" icon={Save} loading={correct.isPending}>
              Save correction
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Schedules                                                            */
/* ------------------------------------------------------------------ */

function CreateScheduleForm({ onDone }: { onDone: () => void }) {
  const create = useCreateWorkSchedule();
  return (
    <Card>
      <CardBody className="space-y-4">
        <p className="text-body font-medium text-ink">New work schedule</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const name = String(form.get("name") ?? "").trim();
            const startTime = String(form.get("start_time") ?? "");
            const endTime = String(form.get("end_time") ?? "");
            if (!name || !startTime || !endTime) {
              toast.error("Name, start time, and end time are required.");
              return;
            }
            create.mutate(
              {
                name,
                startTime,
                endTime,
                breakMinutes: Number(form.get("break_minutes") ?? 0),
                graceMinutes: Number(form.get("grace_minutes") ?? 0),
              },
              {
                onSuccess: () => {
                  toast.success("Schedule created.");
                  onDone();
                },
                onError: (error) => toast.error(errorMessage(error, "Could not create schedule.")),
              },
            );
          }}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <Input name="name" required placeholder="Morning Shift" />
            </Field>
            <div />
            <Field label="Start time" required>
              <Input type="time" name="start_time" required />
            </Field>
            <Field label="End time" required>
              <Input type="time" name="end_time" required />
            </Field>
            <Field label="Break (minutes)">
              <Input type="number" min={0} name="break_minutes" defaultValue={0} />
            </Field>
            <Field label="Grace period (minutes)">
              <Input type="number" min={0} name="grace_minutes" defaultValue={0} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" icon={Plus} loading={create.isPending}>
              Create
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function ScheduleRow({ schedule }: { schedule: WorkSchedule }) {
  const update = useUpdateWorkSchedule();
  const remove = useDeleteWorkSchedule();
  const [deleting, setDeleting] = useState(false);

  return (
    <tr>
      <Td className="font-medium text-ink">{schedule.name}</Td>
      <Td>
        {formatScheduleTime(schedule.startTime)} – {formatScheduleTime(schedule.endTime)}
        {schedule.crossesMidnight ? <span className="ml-1 text-caption text-ink-muted">(+1d)</span> : null}
      </Td>
      <Td className="text-caption text-ink-muted">{schedule.breakMinutes}m</Td>
      <Td className="text-caption text-ink-muted">{schedule.graceMinutes}m</Td>
      <Td>
        <button
          type="button"
          onClick={() =>
            update.mutate(
              { id: schedule.id, patch: { isActive: !schedule.isActive } },
              { onError: (error) => toast.error(errorMessage(error, "Could not update schedule.")) },
            )
          }
        >
          <Badge tone={schedule.isActive ? "success" : "neutral"}>{schedule.isActive ? "Active" : "Inactive"}</Badge>
        </button>
      </Td>
      <Td>
        <IconButton icon={Trash2} label="Delete schedule" tone="danger" onClick={() => setDeleting(true)} />
        <ConfirmDialog
          open={deleting}
          onClose={() => setDeleting(false)}
          onConfirm={() =>
            remove.mutate(schedule.id, {
              onSuccess: () => setDeleting(false),
              onError: (error) => toast.error(errorMessage(error, "Could not delete schedule.")),
            })
          }
          pending={remove.isPending}
          title="Delete schedule?"
          description="Users assigned this schedule fall back to a rest day for any weekday that used it."
          confirmLabel="Delete schedule"
        />
      </Td>
    </tr>
  );
}

function SchedulesTab() {
  const schedulesQuery = useWorkSchedules();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus size={16} /> New schedule
        </Button>
      </div>
      {creating ? <CreateScheduleForm onDone={() => setCreating(false)} /> : null}
      {schedulesQuery.isPending ? (
        <CardListSkeleton count={3} />
      ) : (schedulesQuery.data ?? []).length === 0 ? (
        <p className="py-8 text-center text-body text-ink-muted">No work schedules yet.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Hours</Th>
              <Th>Break</Th>
              <Th>Grace</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {(schedulesQuery.data ?? []).map((schedule) => (
              <ScheduleRow key={schedule.id} schedule={schedule} />
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Assignments                                                          */
/* ------------------------------------------------------------------ */

function DayRow({
  dayOfWeek,
  assignment,
  userId,
  schedules,
}: {
  dayOfWeek: number;
  assignment: ScheduleAssignment | undefined;
  userId: string;
  schedules: WorkSchedule[];
}) {
  const create = useCreateScheduleAssignment();
  const update = useUpdateScheduleAssignment();
  const remove = useDeleteScheduleAssignment();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <tr>
        <Td colSpan={4}>
          <form
            className="flex flex-col gap-3 py-1"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const workScheduleId = String(form.get("work_schedule_id") ?? "") || null;
              const effectiveFrom = String(form.get("effective_from") ?? "");
              const effectiveTo = String(form.get("effective_to") ?? "") || null;
              if (!effectiveFrom) {
                toast.error("Effective from date is required.");
                return;
              }
              const onDone = () => setEditing(false);
              const onError = (error: unknown) => toast.error(errorMessage(error, "Could not save assignment."));
              if (assignment) {
                update.mutate(
                  { id: assignment.id, patch: { workScheduleId, effectiveFrom, effectiveTo } },
                  { onSuccess: onDone, onError },
                );
              } else {
                create.mutate(
                  { userId, dayOfWeek, workScheduleId, effectiveFrom, effectiveTo },
                  { onSuccess: onDone, onError },
                );
              }
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Schedule">
                <Select name="work_schedule_id" defaultValue={assignment?.workScheduleId ?? ""}>
                  <option value="">Rest day</option>
                  {schedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Effective from" required>
                <Input type="date" name="effective_from" defaultValue={assignment?.effectiveFrom ?? ""} required />
              </Field>
              <Field label="Effective to" hint="Leave blank for open-ended">
                <Input type="date" name="effective_to" defaultValue={assignment?.effectiveTo ?? ""} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={create.isPending || update.isPending}>
                Save
              </Button>
            </div>
          </form>
        </Td>
      </tr>
    );
  }

  return (
    <tr>
      <Td className="font-medium text-ink">{DAY_OF_WEEK_LABELS[dayOfWeek]}</Td>
      <Td>{assignment?.workScheduleName ?? <span className="text-ink-muted">Rest day</span>}</Td>
      <Td className="text-caption text-ink-muted">
        {assignment ? `${assignment.effectiveFrom} → ${assignment.effectiveTo ?? "ongoing"}` : "—"}
      </Td>
      <Td>
        <div className="flex justify-end gap-1">
          <IconButton icon={Pencil} label="Edit day" onClick={() => setEditing(true)} />
          {assignment ? (
            <IconButton
              icon={Trash2}
              label="Clear day"
              tone="danger"
              onClick={() =>
                remove.mutate(assignment.id, {
                  onError: (error) => toast.error(errorMessage(error, "Could not clear this day.")),
                })
              }
            />
          ) : null}
        </div>
      </Td>
    </tr>
  );
}

function AssignmentsTab() {
  const usersQuery = useUsers();
  const schedulesQuery = useWorkSchedules();
  const [userId, setUserId] = useState<string>("");
  const assignmentsQuery = useScheduleAssignments(userId || undefined);

  const assignableUsers = (usersQuery.data ?? []).filter((user) => user.role !== ROLES.TERMINAL);
  const byDay = new Map((assignmentsQuery.data ?? []).map((assignment) => [assignment.dayOfWeek, assignment]));

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <Field label="User">
        <Select value={userId} onChange={(event) => setUserId(event.currentTarget.value)} className="sm:max-w-xs">
          <option value="">Select a user…</option>
          {assignableUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </Select>
      </Field>

      {!userId ? (
        <p className="py-8 text-center text-body text-ink-muted">Pick a user to view or edit their weekly schedule.</p>
      ) : assignmentsQuery.isPending || schedulesQuery.isPending ? (
        <CardListSkeleton count={3} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Day</Th>
              <Th>Schedule</Th>
              <Th>Effective</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {DAY_OF_WEEK_LABELS.map((_, dayOfWeek) => (
              <DayRow
                key={dayOfWeek}
                dayOfWeek={dayOfWeek}
                assignment={byDay.get(dayOfWeek)}
                userId={userId}
                schedules={(schedulesQuery.data ?? []).filter((schedule) => schedule.isActive)}
              />
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* History                                                              */
/* ------------------------------------------------------------------ */

function HistoryTab() {
  const usersQuery = useUsers();
  const locationsQuery = useLocations({ includeInactive: false });
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState(() => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const historyQuery = useAttendance({ from, to, userId: userId || undefined });
  const materialize = useMaterializeAttendance();
  const [manualUserId, setManualUserId] = useState("");
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState<AttendanceRecord | null>(null);

  const userNameById = useMemo(() => new Map((usersQuery.data ?? []).map((u) => [u.id, u.name])), [usersQuery.data]);

  function addManualRecord() {
    if (!manualUserId) {
      toast.error("Pick an employee first.");
      return;
    }
    materialize.mutate(
      { userId: manualUserId, date: manualDate },
      {
        onSuccess: (record) => setCreating(record),
        onError: (error) => toast.error(errorMessage(error, "Could not create this record.")),
      },
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="User">
          <Select value={userId} onChange={(event) => setUserId(event.currentTarget.value)}>
            <option value="">Everyone</option>
            {(usersQuery.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input type="date" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
        <Field label="Employee" hint="Add a manual clock in/out record for any employee and date.">
          <Select value={manualUserId} onChange={(event) => setManualUserId(event.currentTarget.value)}>
            <option value="">Pick an employee…</option>
            {(usersQuery.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={manualDate} onChange={(event) => setManualDate(event.currentTarget.value)} />
        </Field>
        <Button type="button" icon={Plus} loading={materialize.isPending} onClick={addManualRecord}>
          Add manual record
        </Button>
      </div>

      <CorrectionSheet record={creating} onClose={() => setCreating(null)} locations={locationsQuery.data ?? []} />

      {historyQuery.isPending ? (
        <CardListSkeleton count={4} />
      ) : (historyQuery.data ?? []).length === 0 ? (
        <p className="py-8 text-center text-body text-ink-muted">No attendance in this range.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Name</Th>
              <Th>Clock in</Th>
              <Th>Clock out</Th>
              <Th>Late</Th>
              <Th>Early out</Th>
              <Th>Break</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {(historyQuery.data ?? []).map((record) => (
              <tr key={record.id}>
                <Td className="whitespace-nowrap num">{record.date}</Td>
                <Td>{record.employeeName ?? record.userName ?? userNameById.get(record.userId) ?? "—"}</Td>
                <Td>{formatClock(record.clockIn)}</Td>
                <Td>{formatClock(record.clockOut)}</Td>
                <Td className="text-caption text-ink-muted">{record.lateMinutes ? formatMinutes(record.lateMinutes) : "—"}</Td>
                <Td className="text-caption text-ink-muted">
                  {record.earlyOutMinutes ? formatMinutes(record.earlyOutMinutes) : "—"}
                </Td>
                <Td className="text-caption text-ink-muted">{record.breakMinutes ? `${record.breakMinutes}m` : "—"}</Td>
                <Td>
                  <StatusBadge status={record.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */

function SettingsTab() {
  const settingsQuery = useAttendanceSettings();
  const update = useUpdateAttendanceSettings();

  if (settingsQuery.isPending) {
    return (
      <div className="p-3 sm:p-4">
        <CardListSkeleton count={1} />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4">
      <Card>
        <CardBody className="space-y-4">
          <label className="flex items-start gap-3 text-body text-ink">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              checked={settingsQuery.data?.enforcementEnabled ?? false}
              onChange={(event) =>
                update.mutate(event.currentTarget.checked, {
                  onSuccess: () => toast.success("Attendance settings saved."),
                  onError: (error) => toast.error(errorMessage(error, "Could not save settings.")),
                })
              }
            />
            <span>
              <span className="font-medium">Require clock-in before POS access</span>
              <p className="mt-0.5 text-caption text-ink-muted">
                When on, a scheduled user must clock in before continuing past the unlock screen. Being late never
                blocks access by itself — only not being clocked in at all does.
              </p>
            </span>
          </label>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function AttendancePage() {
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const tabs = useMemo(
    () =>
      TABS.map((entry) => ({
        ...entry,
        href: (entry.key === "today" ? "/attendance" : `/attendance?tab=${entry.key}`) as Route,
      })),
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarClock}
        title="Attendance"
        description="Work schedules, clock-in/out, and POS access based on today's attendance."
      />

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <TabNav items={tabs} active={tab} ariaLabel="Attendance sections" className="mx-0 bg-surface px-2 sm:px-3" />

        {tab === "today" ? (
          <TodayTab />
        ) : tab === "schedules" ? (
          <SchedulesTab />
        ) : tab === "assignments" ? (
          <AssignmentsTab />
        ) : tab === "history" ? (
          <HistoryTab />
        ) : (
          <SettingsTab />
        )}
      </div>
    </div>
  );
}
