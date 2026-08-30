import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useMutation } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  HandHelping,
  KeyRound,
  Pencil,
  Shield,
  Smartphone,
  Truck,
  UserCog,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import type { User, UserRole } from "@double-a/shared-types";
import { isValidPin } from "@double-a/shared-types";
import { createUser, setUserPin, updateUser } from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";
import { useInvalidateUsers, useUsers } from "@/lib/query/users";
import { Badge, Button, EmptyState, ErrorNote, IconButton } from "@/components/ui";
import { BottomSheet } from "@/components/bottom-sheet";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, radius, space, styles } from "@/theme";

/** Terminal accounts (role "device") show up read-only — see the GAP notes
 * in packages/api-client/src/queries/users.ts: they self-enroll from the POS
 * setup screen and cannot be created, edited, or PIN-managed from here. */
type StaffRole = Exclude<UserRole, "superadmin">;
/** Every role this screen can create — device self-enrolls and is excluded, matching apps/admin's user-form.tsx. */
type CreatableRole = Extract<UserRole, "cashier" | "admin" | "manager" | "driver" | "helper">;

const TABS: { key: StaffRole; label: string; icon: LucideIcon }[] = [
  { key: "admin", label: "Admins", icon: Shield },
  { key: "manager", label: "Managers", icon: UserCog },
  { key: "cashier", label: "Cashiers", icon: UserRound },
  { key: "driver", label: "Drivers", icon: Truck },
  { key: "helper", label: "Helpers", icon: HandHelping },
  { key: "device", label: "Terminals", icon: Smartphone },
];

const ROLE_ICON: Record<StaffRole, LucideIcon> = {
  admin: Shield,
  manager: UserCog,
  cashier: UserRound,
  driver: Truck,
  helper: HandHelping,
  device: Smartphone,
};

const ROLE_LABEL: Record<CreatableRole, string> = {
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
  driver: "Driver",
  helper: "Helper",
};

const fieldStyle = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: radius.sm,
  paddingHorizontal: space.md,
  color: color.ink,
} as const;

/** Same box `fieldStyle` draws, with a reveal toggle so a mistyped password/PIN can be checked before saving. */
function MaskedField(props: TextInputProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: fieldStyle.minHeight,
        borderWidth: fieldStyle.borderWidth,
        borderColor: fieldStyle.borderColor,
        borderRadius: fieldStyle.borderRadius,
        paddingLeft: space.md,
      }}
    >
      <TextInput
        {...props}
        secureTextEntry={!revealed}
        placeholderTextColor={color.inkMuted}
        style={{ flex: 1, minHeight: fieldStyle.minHeight, color: color.ink }}
      />
      <Pressable
        onPress={() => setRevealed((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={revealed ? "Hide" : "Show"}
        hitSlop={8}
        style={{ paddingHorizontal: space.md }}
      >
        {revealed ? (
          <EyeOff size={18} color={color.inkMuted} strokeWidth={2} />
        ) : (
          <Eye size={18} color={color.inkMuted} strokeWidth={2} />
        )}
      </Pressable>
    </View>
  );
}

export default function AdminUsersScreen() {
  const usersQuery = useUsers({ includeInactive: true });
  const invalidate = useInvalidateUsers();

  const [tab, setTab] = useState<StaffRole>("cashier");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [settingPin, setSettingPin] = useState<User | null>(null);

  const counts = useMemo(() => {
    const users = usersQuery.data ?? [];
    return {
      admin: users.filter((u) => u.role === "admin").length,
      manager: users.filter((u) => u.role === "manager").length,
      cashier: users.filter((u) => u.role === "cashier").length,
      driver: users.filter((u) => u.role === "driver").length,
      helper: users.filter((u) => u.role === "helper").length,
      device: users.filter((u) => u.role === "device").length,
    };
  }, [usersQuery.data]);

  const filtered = useMemo(() => {
    const users = (usersQuery.data ?? []).filter((u) => u.role === tab);
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle),
    );
  }, [usersQuery.data, tab, query]);

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      updateUser(getAdminApiClient(), input.id, { isActive: input.isActive }),
    onSuccess: invalidate,
  });

  if (usersQuery.isPending) {
    return <LoadingState text="Loading people…" />;
  }

  if (usersQuery.isError) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>
          {usersQuery.error instanceof Error ? usersQuery.error.message : "Could not load users."}
        </ErrorNote>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <WaveBackdrop />
      <View style={{ padding: space.md, gap: space.sm }}>
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.xs,
                  paddingHorizontal: space.md,
                  paddingVertical: space.xs,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: active ? color.primary : color.border,
                  backgroundColor: active ? color.primaryTint : color.surface,
                }}
              >
                <t.icon size={14} color={active ? color.primary : color.inkMuted} strokeWidth={2} />
                <Text
                  style={{
                    fontSize: fontSize.caption,
                    fontWeight: "600",
                    color: active ? color.primary : color.inkMuted,
                  }}
                >
                  {t.label} ({counts[t.key]})
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", gap: space.sm }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search name or email…"
            placeholderTextColor={color.inkMuted}
            style={{
              flex: 1,
              minHeight: 44,
              borderWidth: 1,
              borderColor: color.border,
              borderRadius: radius.sm,
              paddingHorizontal: space.md,
              color: color.ink,
              backgroundColor: color.surface,
            }}
          />
          {tab !== "device" ? (
            <Button label="Add" icon={UserPlus} onPress={() => setEditing("new")} />
          ) : null}
        </View>
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            query ? "Nothing matches" : `No ${tab === "device" ? "terminals" : `${tab}s`} yet`
          }
          instruction={
            tab === "device"
              ? "Terminals enroll themselves from the POS setup screen, using an admin login."
              : query
                ? "Try a different name or email."
                : "Add someone to get started."
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.md, gap: space.xs, paddingTop: 0 }}
          renderItem={({ item }) => {
            const RoleIcon = ROLE_ICON[item.role as StaffRole] ?? UserRound;
            const isDevice = item.role === "device";
            return (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  padding: space.md,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: color.border,
                  backgroundColor: color.surface,
                  opacity: item.isActive ? 1 : 0.55,
                }}
              >
                <View style={[styles.iconWell, { width: 34, height: 34 }]}>
                  <RoleIcon size={16} color={color.primary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                    {item.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: fontSize.caption, color: color.inkMuted }}
                  >
                    {item.email}
                  </Text>
                  <View
                    style={{ flexDirection: "row", gap: space.xs, marginTop: 2, flexWrap: "wrap" }}
                  >
                    {!item.isActive ? (
                      <Badge tone="neutral" label="Inactive" />
                    ) : !item.canSell && !isDevice ? (
                      <Badge tone="warning" label="Sales off" />
                    ) : (
                      <Badge tone="success" label="Active" />
                    )}
                  </View>
                </View>
                {isDevice ? null : (
                  <>
                    <Switch
                      value={item.isActive}
                      onValueChange={(value) => toggleActive.mutate({ id: item.id, isActive: value })}
                    />
                    {item.role === "admin" || item.role === "manager" || item.role === "cashier" ? (
                      <IconButton icon={KeyRound} label="Set PIN" onPress={() => setSettingPin(item)} />
                    ) : null}
                    <IconButton icon={Pencil} label="Edit" onPress={() => setEditing(item)} />
                  </>
                )}
              </View>
            );
          }}
        />
      )}

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)}>
        {editing ? (
          <UserForm
            user={editing === "new" ? null : editing}
            defaultRole={tab === "device" ? "cashier" : (tab as CreatableRole)}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet open={settingPin !== null} onClose={() => setSettingPin(null)}>
        {settingPin ? <PinForm user={settingPin} onDone={() => setSettingPin(null)} /> : null}
      </BottomSheet>
    </View>
  );
}

/**
 * Name/email/canSell only. Role and password are deliberately absent here —
 * `PATCH /users/{id}` (UpdateUserRequest) accepts neither, matching
 * apps/admin's user-form.tsx which disables the role select and hides the
 * password field on edit for the same server-side gap.
 */
function UserForm({
  user,
  defaultRole,
  onDone,
}: {
  user: User | null;
  defaultRole: CreatableRole;
  onDone: () => void;
}) {
  const invalidate = useInvalidateUsers();
  const [role, setRole] = useState<CreatableRole>(
    user?.role === "admin" ||
      user?.role === "manager" ||
      user?.role === "cashier" ||
      user?.role === "driver" ||
      user?.role === "helper"
      ? user.role
      : defaultRole,
  );
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [canSell, setCanSell] = useState(user?.canSell ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      if (!trimmedName) throw new Error("Give this person a name.");
      if (!trimmedEmail) throw new Error("Email is required — it identifies the person.");
      const client = getAdminApiClient();

      if (user) {
        return updateUser(client, user.id, { name: trimmedName, email: trimmedEmail, canSell });
      }

      const needsPassword = role === "admin" || role === "manager";
      if (needsPassword && password.length < 8) {
        throw new Error("Set a password of at least 8 characters so this person can sign in.");
      }
      return createUser(client, {
        name: trimmedName,
        email: trimmedEmail,
        role,
        password: needsPassword ? password : undefined,
        canSell,
      });
    },
    onSuccess: () => {
      invalidate();
      onDone();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not save."),
  });

  return (
    <View style={{ gap: space.md }}>
      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
        {user ? `Edit ${user.name}` : "New person"}
      </Text>

      {user ? null : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {(["cashier", "admin", "manager", "driver", "helper"] as const).map((r) => {
            const active = r === role;
            return (
              <Pressable
                key={r}
                onPress={() => setRole(r)}
                style={{
                  flexGrow: 1,
                  minWidth: 90,
                  paddingVertical: space.sm,
                  alignItems: "center",
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: active ? color.primary : color.border,
                  backgroundColor: active ? color.primaryTint : color.surface,
                }}
              >
                <Text style={{ color: active ? color.primary : color.inkMuted, fontWeight: "600" }}>
                  {ROLE_LABEL[r]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name"
        placeholderTextColor={color.inkMuted}
        style={fieldStyle}
      />
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor={color.inkMuted}
        style={fieldStyle}
      />

      {!user && (role === "admin" || role === "manager") ? (
        <MaskedField
          value={password}
          onChangeText={setPassword}
          placeholder="Password (min 8 characters)"
        />
      ) : null}

      <Pressable
        onPress={() => setCanSell((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
      >
        <Switch value={canSell} onValueChange={setCanSell} />
        <Text style={{ color: color.ink }}>Allow this person to complete sales</Text>
      </Pressable>

      {user ? (
        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
          Role and password can&rsquo;t be changed from here. Use the key icon on the list to set a
          new PIN.
        </Text>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        label={save.isPending ? "Saving…" : "Save"}
        busy={save.isPending}
        onPress={() => save.mutate()}
      />
    </View>
  );
}

/** Admin-set PIN — PUT /users/{id}/pin, separate from cashier unlock (verify-pin). */
function PinForm({ user, onDone }: { user: User; onDone: () => void }) {
  const invalidate = useInvalidateUsers();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!isValidPin(pin)) throw new Error("PIN must be 4 to 6 digits.");
      return setUserPin(getAdminApiClient(), user.id, pin);
    },
    onSuccess: () => {
      invalidate();
      onDone();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not set PIN."),
  });

  return (
    <View style={{ gap: space.md }}>
      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
        Set PIN for {user.name}
      </Text>
      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
        4 to 6 digits. {user.name} uses this to unlock a terminal — it reaches the device on its
        next Sync or Refresh.
      </Text>
      <MaskedField
        value={pin}
        onChangeText={setPin}
        placeholder="New PIN"
        keyboardType="number-pad"
        maxLength={6}
      />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        label={save.isPending ? "Saving…" : "Set PIN"}
        busy={save.isPending}
        onPress={() => save.mutate()}
      />
    </View>
  );
}
