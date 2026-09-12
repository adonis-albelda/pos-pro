import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CheckCircle2, Clock, Coffee, LogOut } from "lucide-react-native";

// Same logo used on setup.tsx's own header — this screen sits in the same
// unlock → attendance → POS chain, so it keeps the same logo/title/background
// rather than growing a clock-in-specific look.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as setup.tsx; no *.png module declaration in this project
const LOGO = require("../assets/logo.webp");
/** Mirrors ClockInAction::EARLY_WINDOW_MINUTES (Laravel) — client-side copy is UX only, the server is the real gate. */
const EARLY_WINDOW_MINUTES = 30;
import {
  ATTENDANCE_STATUS_LABELS,
  formatMinutes,
  formatScheduleTime,
  ROLES,
  type AttendanceRecord,
} from "@double-a/shared-types";
import {
  clockIn,
  clockOut,
  endBreak,
  getAttendanceSettings,
  getFeatureFlags,
  getMyTodayAttendance,
  startBreak,
} from "@double-a/api-client/queries";
import { getApiClient } from "@/lib/api/session";
import { useSession } from "@/lib/session";
import { useLocationScope } from "@/lib/location-scope";
import { useLayout } from "@/lib/layout";
import { Button } from "@/components/ui";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, space } from "@/theme";

function scheduleLine(record: AttendanceRecord): string | null {
  if (!record.scheduledStart || !record.scheduledEnd) return null;
  return `${formatScheduleTime(new Date(record.scheduledStart).toTimeString().slice(0, 5))} - ${formatScheduleTime(
    new Date(record.scheduledEnd).toTimeString().slice(0, 5),
  )}`;
}

/** Wall-clock time for a Date, e.g. "6:00 PM" — used both for display and for the eligibility message. */
function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/**
 * Mirrors ClockInAction's own two guards (no schedule today / more than
 * EARLY_WINDOW_MINUTES before the shift starts) so the button is disabled
 * with a clear reason instead of letting the tap round-trip to a 422 the
 * user has to decode. The server re-checks both regardless — this is UX
 * only, never the real gate.
 */
function clockInEligibility(record: AttendanceRecord | null, now: Date): { canClockIn: boolean; reason: string | null } {
  if (!record || !record.scheduledStart) {
    return { canClockIn: false, reason: "No schedule is set for today. Ask an admin to assign one before clocking in." };
  }
  const opensAt = new Date(new Date(record.scheduledStart).getTime() - EARLY_WINDOW_MINUTES * 60_000);
  if (now < opensAt) {
    return {
      canClockIn: false,
      reason: `Too early — you can clock in starting ${formatTime(opensAt)}, ${EARLY_WINDOW_MINUTES} minutes before your shift.`,
    };
  }
  return { canClockIn: true, reason: null };
}

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/**
 * POS login flow's "check today's schedule / check attendance" step (spec
 * §7). Reached right after PIN unlock; skips straight to /pos on its own
 * when the attendance feature is off for this company, enforcement is off,
 * there's no schedule today (rest day), or the cashier is already clocked
 * in and not on break — the gate only actually stops anyone who is
 * scheduled and hasn't clocked in yet.
 */
export default function AttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const { cashier } = useSession();
  const { locationId } = useLocationScope();
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [enforcementEnabled, setEnforcementEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cashier) return;
    const client = getApiClient();
    const [settings, today] = await Promise.all([
      getAttendanceSettings(client),
      getMyTodayAttendance(client, cashier.id),
    ]);
    setEnforcementEnabled(settings.enforcementEnabled);
    setRecord(today);
    return { settings, today };
  }, [cashier]);

  useEffect(() => {
    // Admins run the dashboard/back office, not a shift on the floor — the
    // clock-in gate is for staff scheduled to work, never the owner's own
    // account. Skip straight through, no attendance round trip at all.
    if (cashier?.role === ROLES.ADMIN) {
      router.replace("/pos");
      return;
    }

    let alive = true;
    setLoading(true);
    (async () => {
      try {
        // Checked via the ungated /feature-flags endpoint, not
        // /attendance-settings — that route is itself feature-gated now, so
        // a disabled company must never call it (403) just to find out it's
        // disabled. Straight through to /pos, same as enforcement-off.
        const flags = await getFeatureFlags(getApiClient());
        if (!(flags.attendance ?? true)) {
          if (alive) router.replace("/pos");
          return;
        }

        const result = await load();
        if (!alive || !result) return;
        const { settings, today } = result;
        // Nothing to gate on: no enforcement, no schedule today, or already
        // clocked in and not on break — straight through, no screen shown.
        const noGateNeeded =
          !settings.enforcementEnabled ||
          today.status === "rest_day" ||
          (today.isClockedIn && !today.isOnBreak);
        if (noGateNeeded) {
          router.replace("/pos");
        }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not reach the server.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount
  }, []);

  async function refresh() {
    try {
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the server.");
    }
  }

  async function onClockIn() {
    if (!cashier) return;
    setBusy(true);
    setError(null);
    try {
      const client = getApiClient();
      const updated = await clockIn(client, cashier.id, locationId ?? undefined);
      setRecord(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not clock in.");
    } finally {
      setBusy(false);
    }
  }

  async function onStartBreak() {
    if (!cashier) return;
    setBusy(true);
    setError(null);
    try {
      const client = getApiClient();
      setRecord(await startBreak(client, cashier.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start break.");
    } finally {
      setBusy(false);
    }
  }

  async function onEndBreak() {
    if (!cashier) return;
    setBusy(true);
    setError(null);
    try {
      const client = getApiClient();
      setRecord(await endBreak(client, cashier.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not end break.");
    } finally {
      setBusy(false);
    }
  }

  async function onClockOut() {
    if (!cashier) return;
    setBusy(true);
    setError(null);
    try {
      const client = getApiClient();
      setRecord(await clockOut(client, cashier.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not clock out.");
    } finally {
      setBusy(false);
    }
  }

  function continueToPos() {
    router.replace("/pos");
  }

  if (!cashier) {
    return null;
  }

  const schedule = record ? scheduleLine(record) : null;
  const greeting = new Date().getHours() < 17 ? "Good morning" : "Good evening";
  const eligibility = clockInEligibility(record, new Date());

  const subtitle = loading
    ? "Checking today's schedule…"
    : record?.isOnBreak
      ? "You're on break."
      : record?.isClockedIn
        ? "You're clocked in."
        : "Ready to start your shift?";

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <WaveBackdrop />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: layout.gutter,
          paddingTop: insets.top + space.xl,
          paddingBottom: insets.bottom + space.xl,
        }}
      >
        <View style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: space.xl }}>
          {/* Same logo badge + title treatment as setup.tsx's own header. */}
          <View style={{ alignItems: "center", gap: space.md }}>
            <View
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: color.surface,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: color.primaryDark,
                shadowOpacity: 0.3,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              }}
            >
              <Image source={LOGO} style={{ width: 68, height: 68 }} resizeMode="contain" />
            </View>

            <View style={{ alignItems: "center", gap: space.xs }}>
              <Text
                style={{
                  fontSize: fontSize.headingMd,
                  fontWeight: "700",
                  color: color.ink,
                  letterSpacing: -0.5,
                }}
              >
                {greeting}, {cashier.name.split(" ")[0]}
              </Text>
              <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>{subtitle}</Text>
            </View>
          </View>

          {/* Form card — floats over the wave; same treatment as setup.tsx. */}
          <View
            style={{
              backgroundColor: color.surface,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: color.borderSoft,
              paddingHorizontal: space.xl,
              paddingVertical: space.xl,
              gap: space.md,
            }}
          >
            {loading ? (
              <ActivityIndicator color={color.primary} style={{ paddingVertical: space.xl }} />
            ) : (
              <>
                {schedule ? (
                  <View style={{ gap: 2 }}>
                    <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>Your schedule</Text>
                    <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.ink }}>{schedule}</Text>
                  </View>
                ) : null}

                {record?.isOnBreak ? (
                  <View style={{ gap: space.sm }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: space.xs,
                        paddingVertical: space.sm,
                      }}
                    >
                      <Coffee size={18} color={color.primary} strokeWidth={2} />
                      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>On Break</Text>
                    </View>
                    <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                      Started {formatClock(record.breakStartedAt)}
                    </Text>
                    <Button label="End Break" large icon={Coffee} busy={busy} onPress={onEndBreak} />
                  </View>
                ) : record?.isClockedIn ? (
                  <View style={{ gap: space.sm }}>
                    <View style={{ gap: 2 }}>
                      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>Clocked in</Text>
                      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.ink }}>
                        {formatClock(record.clockIn)}
                      </Text>
                    </View>
                    <View style={{ gap: 2 }}>
                      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>Status</Text>
                      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.ink }}>
                        {ATTENDANCE_STATUS_LABELS[record.status]}
                        {record.lateMinutes ? ` — ${formatMinutes(record.lateMinutes)}` : ""}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                      <Button
                        label="Start Break"
                        variant="secondary"
                        icon={Coffee}
                        style={{ flex: 1 }}
                        busy={busy}
                        onPress={onStartBreak}
                      />
                      <Button
                        label="Continue to POS"
                        icon={CheckCircle2}
                        style={{ flex: 1 }}
                        onPress={continueToPos}
                      />
                    </View>
                    <Button label="Clock Out" variant="secondary" icon={LogOut} busy={busy} onPress={onClockOut} />
                  </View>
                ) : (
                  <View style={{ gap: space.sm, alignItems: "center", width: "100%" }}>
                    <Text style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}>
                      {eligibility.reason ?? "Tap below to clock in and begin your shift."}
                    </Text>
                    <Button
                      label="Clock In"
                      large
                      icon={Clock}
                      busy={busy}
                      disabled={!eligibility.canClockIn}
                      style={{ width: "100%", marginTop: space.xs }}
                      onPress={onClockIn}
                    />
                  </View>
                )}

                {error ? (
                  <Text style={{ fontSize: fontSize.caption, color: color.danger }}>{error}</Text>
                ) : null}

                {!enforcementEnabled ? (
                  <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                    Clocking in isn't required to use the POS on this terminal.
                  </Text>
                ) : null}

                <Button label="Refresh" variant="secondary" onPress={refresh} disabled={busy} />
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
