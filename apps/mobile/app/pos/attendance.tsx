import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ban, CalendarClock, Clock } from "lucide-react-native";
import { ApiError } from "@double-a/api-client";
import {
  ATTENDANCE_STATUS_LABELS,
  ROLES,
  type AttendanceRecord,
  type User,
  type UserRole,
} from "@double-a/shared-types";
import {
  clockIn,
  clockOut,
  getMyTodayAttendance,
  listAttendance,
  listUsers,
} from "@double-a/api-client/queries";
import { getApiClient } from "@/lib/api/session";
import { useSession } from "@/lib/session";
import { useLocationScope } from "@/lib/location-scope";
import { useLayout } from "@/lib/layout";
import { useLiveFeatureFlags } from "@/lib/features";
import { AttendancePinSheet } from "@/components/attendance-pin-sheet";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { Badge, Button, Card, ErrorNote } from "@/components/ui";
import { circleRadius, color, fontSize, radius, space, styles } from "@/theme";

const ROLE_LABELS: Record<UserRole, string> = {
  cashier: "Cashier",
  admin: "Admin",
  manager: "Manager",
  inventory_clerk: "Inventory clerk",
  terminal: "Terminal",
  superadmin: "Superadmin",
};

function shopDayToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return first ?? error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

function isStaffUser(user: User): boolean {
  return (
    user.isActive &&
    user.role !== ROLES.TERMINAL &&
    user.role !== ROLES.SUPERADMIN
  );
}

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

function Avatar({ user, size = 48 }: { user: User; size?: number }) {
  const initial = user.name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: circleRadius(size),
        backgroundColor: color.primarySoft,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {user.avatarUrl ? (
        <Image
          source={{ uri: user.avatarUrl }}
          style={{ width: size, height: size }}
          resizeMode="cover"
        />
      ) : (
        <Text style={{ fontSize: size * 0.4, fontWeight: "700", color: color.primary }}>
          {initial}
        </Text>
      )}
    </View>
  );
}

/**
 * Mid-shift attendance. Unlock never gates here — punch from this tab only.
 * Admin/manager see every active staff row; other roles see themselves.
 * Company feature flag off → centered disabled message, still reachable.
 */
export default function PosAttendanceScreen() {
  const layout = useLayout();
  const { cashier } = useSession();
  const { locationId } = useLocationScope();
  const { isEnabled, loading: flagsLoading } = useLiveFeatureFlags();
  const attendanceEnabled = isEnabled("attendance");

  const canManageAll =
    cashier?.role === ROLES.ADMIN || cashier?.role === ROLES.MANAGER;

  const [employees, setEmployees] = useState<User[]>([]);
  const [recordsByUserId, setRecordsByUserId] = useState<Record<string, AttendanceRecord>>(
    {},
  );
  const [selfRecord, setSelfRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [punchBusy, setPunchBusy] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);

  const load = useCallback(async () => {
    if (!cashier || !attendanceEnabled) return;
    const client = getApiClient();
    const today = shopDayToday();

    if (canManageAll) {
      const [users, records] = await Promise.all([
        listUsers(client),
        listAttendance(client, { date: today }),
      ]);
      const staff = users.filter(isStaffUser).sort((a, b) => a.name.localeCompare(b.name));
      const map: Record<string, AttendanceRecord> = {};
      for (const record of records) {
        map[record.userId] = record;
      }
      setEmployees(staff);
      setRecordsByUserId(map);
      setSelfRecord(null);
      return;
    }

    const todayRecord = await getMyTodayAttendance(client, cashier.id);
    setSelfRecord(todayRecord);
    setEmployees([cashier]);
    setRecordsByUserId({ [cashier.id]: todayRecord });
  }, [attendanceEnabled, canManageAll, cashier]);

  useFocusEffect(
    useCallback(() => {
      if (flagsLoading || !attendanceEnabled || !cashier) {
        setLoading(false);
        return;
      }
      let alive = true;
      setLoading(true);
      setError(null);
      void load()
        .catch((cause) => {
          if (alive) setError(errorMessage(cause, "Could not load attendance."));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, [attendanceEnabled, cashier, flagsLoading, load]),
  );

  async function refresh() {
    if (!attendanceEnabled) return;
    setRefreshing(true);
    setError(null);
    try {
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Could not load attendance."));
    } finally {
      setRefreshing(false);
    }
  }

  const selectedRecord = selected ? recordsByUserId[selected.id] : null;
  const selectedAction: "in" | "out" = selectedRecord?.isClockedIn ? "out" : "in";

  async function confirmPunch() {
    if (!selected) return;
    setPunchBusy(true);
    setError(null);
    try {
      const client = getApiClient();
      const updated = selectedRecord?.isClockedIn
        ? await clockOut(client, selected.id)
        : await clockIn(client, selected.id, locationId ?? undefined);
      setRecordsByUserId((prev) => ({ ...prev, [selected.id]: updated }));
      if (!canManageAll) setSelfRecord(updated);
      setSelected(null);
    } catch (cause) {
      setError(errorMessage(cause, "Could not update attendance."));
      throw cause;
    } finally {
      setPunchBusy(false);
    }
  }

  const listData = useMemo(() => employees, [employees]);

  if (!cashier) return null;

  if (flagsLoading) {
    return (
      <View style={{ flex: 1 }}>
        <WaveBackdrop />
        <LoadingState text="Checking attendance…" />
      </View>
    );
  }

  if (!attendanceEnabled) {
    return (
      <View style={{ flex: 1 }}>
        <WaveBackdrop />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: layout.gutter,
            gap: space.md,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: circleRadius(72),
              backgroundColor: color.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ban size={32} color={color.primary} strokeWidth={2} />
          </View>
          <Text
            style={{
              fontSize: fontSize.headingSm,
              fontWeight: "700",
              color: color.ink,
              textAlign: "center",
            }}
          >
            This feature is disabled currently.
          </Text>
          <Text style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}>
            An admin can turn attendance on for this company.
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <WaveBackdrop />
        <LoadingState text="Loading attendance…" />
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        padding: layout.gutter,
        width: "100%",
        maxWidth: layout.readableMaxWidth,
        alignSelf: "center",
      }}
    >
      <WaveBackdrop />

      {error ? (
        <View style={{ marginBottom: space.md }}>
          <ErrorNote>{error}</ErrorNote>
        </View>
      ) : null}

      {canManageAll ? (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
          contentContainerStyle={{ gap: space.sm, paddingBottom: space.xl }}
          ListEmptyComponent={
            <Card style={[{ padding: space.xl, alignItems: "center", gap: space.sm }, styles.floatShadow]}>
              <CalendarClock size={28} color={color.inkMuted} strokeWidth={2} />
              <Text style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}>
                No employees to show.
              </Text>
            </Card>
          }
          renderItem={({ item }) => {
            const record = recordsByUserId[item.id];
            const clockedIn = record?.isClockedIn ?? false;
            return (
              <Pressable
                onPress={() => {
                  setError(null);
                  setSelected(item);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${ROLE_LABELS[item.role]}, ${clockedIn ? "clocked in" : "not clocked in"}`}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.md,
                    padding: space.md,
                    backgroundColor: color.surface,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: color.borderSoft,
                    opacity: pressed ? 0.85 : 1,
                  },
                  styles.floatShadow,
                ]}
              >
                <Avatar user={item} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}
                  >
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                    {ROLE_LABELS[item.role]}
                  </Text>
                </View>
                <Badge
                  tone={clockedIn ? "success" : "neutral"}
                  label={
                    clockedIn
                      ? "Clocked in"
                      : record
                        ? ATTENDANCE_STATUS_LABELS[record.status]
                        : "Not in"
                  }
                />
              </Pressable>
            );
          }}
        />
      ) : (
        <SelfAttendanceCard
          user={cashier}
          record={selfRecord}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          onPunch={() => {
            setError(null);
            setSelected(cashier);
          }}
        />
      )}

      <AttendancePinSheet
        open={selected !== null}
        user={selected}
        action={selectedAction}
        busy={punchBusy}
        onClose={() => {
          if (!punchBusy) setSelected(null);
        }}
        onConfirmed={confirmPunch}
      />
    </View>
  );
}

function SelfAttendanceCard({
  user,
  record,
  refreshing,
  onRefresh,
  onPunch,
}: {
  user: User;
  record: AttendanceRecord | null;
  refreshing: boolean;
  onRefresh: () => void;
  onPunch: () => void;
}) {
  const clockedIn = record?.isClockedIn ?? false;
  const actionLabel = clockedIn ? "Time out" : "Time in";

  return (
    <View style={{ gap: space.md }}>
      <Card style={[{ gap: space.lg, padding: space.lg }, styles.floatShadow]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Avatar user={user} size={64} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}
            >
              {user.name}
            </Text>
            <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>
              {ROLE_LABELS[user.role]}
            </Text>
            {record ? (
              <Badge
                tone={clockedIn ? "success" : "neutral"}
                label={ATTENDANCE_STATUS_LABELS[record.status]}
              />
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: space.lg }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>Time in</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Clock size={16} color={color.inkMuted} strokeWidth={2} />
              <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.ink }}>
                {formatClock(record?.clockIn ?? null)}
              </Text>
            </View>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>Time out</Text>
            <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.ink }}>
              {formatClock(record?.clockOut ?? null)}
            </Text>
          </View>
        </View>

        <Button label={actionLabel} large onPress={onPunch} />
        <Pressable onPress={onRefresh} disabled={refreshing}>
          <Text
            style={{
              fontSize: fontSize.caption,
              color: color.primary,
              textAlign: "center",
              fontWeight: "600",
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Text>
        </Pressable>
      </Card>
    </View>
  );
}
