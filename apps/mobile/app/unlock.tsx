import { useCallback, useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  PIN_LENGTH_MAX,
  PIN_LENGTH_MIN,
  storeInitial,
  timeAgo,
  type User,
} from "@double-a/shared-types";
import { listCashiers, me } from "@double-a/api-client/queries";
import { useLayout } from "@/lib/layout";
import { useSession } from "@/lib/session";
import { ensureFreshSession, getApiClient, unenrollTerminal } from "@/lib/api/session";
import { useStoreSettings } from "@/lib/store";
import { useSync } from "@/sync/sync-provider";
import {
  Check,
  Delete,
  RefreshCw,
  Shield,
  UserRoundCog,
  UserRound,
  Users,
  X,
} from "lucide-react-native";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { Button, Card, EmptyState, ErrorNote, IconButton } from "@/components/ui";
import { color, fontSize, space, styles } from "@/theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as company-intro.tsx; no *.png module declaration in this project
const PIN_ICON = require("../assets/password-protection.png");

/**
 * Start of a shift. Cashier list + PIN check hit the live Tally API. Local SQLite
 * is for selling after unlock — never for credentials.
 */
export default function UnlockScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const { unlock } = useSession();
  const { phase, lastSyncedAt, error: syncError, pullOnly } = useSync();
  const store = useStoreSettings();

  const [cashiers, setCashiers] = useState<User[]>([]);
  const [enrolled, setEnrolled] = useState<User | null>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadCashiers = useCallback(async () => {
    setLoadingList(true);
    setLoadError(null);
    try {
      await ensureFreshSession();
      const client = getApiClient();
      const [next, profile] = await Promise.all([listCashiers(client), me(client)]);
      // A terminal (role "device") only ever hands the shift to a cashier —
      // admins sign in to the dashboard, not a shop-floor POS.
      const onShift = profile.role === "device" ? next.filter((c) => c.role === "cashier") : next;
      setEnrolled(profile);
      setCashiers(onShift);
      setSelected((prev) =>
        prev && onShift.some((c) => c.id === prev.id)
          ? (onShift.find((c) => c.id === prev.id) ?? null)
          : null,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not reach the server.";
      setLoadError(message);
      setCashiers([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadCashiers();
  }, [loadCashiers]);

  const syncing = phase === "pushing" || phase === "pulling";

  /**
   * Pull catalog into SQLite for the shift, then reload the live cashier list.
   * PIN itself is always live — this is for products/prices, not hashes.
   */
  async function refreshCashiers() {
    await pullOnly();
    await loadCashiers();
    setPin("");
    setError(null);
  }

  async function switchAccount() {
    setBusy(true);
    setLoadError(null);
    try {
      await unenrollTerminal();
      router.replace("/setup");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not disconnect this terminal.");
    } finally {
      setBusy(false);
    }
  }

  function closePinDialog() {
    if (busy) return;
    setSelected(null);
    setPin("");
    setError(null);
  }

  async function submit() {
    if (!selected) return;

    setBusy(true);
    setError(null);

    try {
      const result = await unlock(selected, pin);

      if (result === "terminal-not-authorized") {
        setPin("");
        // Not the cashier's fault and not fixable at the keypad: the server does
        // not recognise this terminal's sign-in, so no PIN can ever pass.
        setError(
          "This terminal's sign-in is not accepted by the server, so no PIN will work. Set the terminal up again from the admin account.",
        );
        return;
      }

      if (result === "wrong-pin") {
        setPin("");
        setError(
          "That PIN does not match. Try again, or ask an admin to set a PIN for this person.",
        );
        return;
      }

      router.replace("/pos");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not reach the server.";
      setError(message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  // The gutter is tuned for POS product grids, which is too tight for a single
  // column of cards — this screen buys back side air.
  const dialogPadding = Math.max(layout.gutter, space.lg);
  const listWidth = Math.min(layout.width - dialogPadding * 2, 520);
  const cashierCols = listWidth < 400 ? 2 : 3;
  const cashierTileWidth = (listWidth - space.sm * (cashierCols - 1)) / cashierCols;

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
    <WaveBackdrop />
    <View style={{ flex: 1 }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: dialogPadding,
        paddingTop: insets.top + space.xl,
        gap: space.lg,
        // The keypad is thumb-sized, not screen-sized: on a tablet it keeps a
        // column width rather than stretching to arm's reach.
        width: "100%",
        maxWidth: 520,
        alignSelf: "center",
        flexGrow: 1,
        paddingBottom: insets.bottom + space.xl,
      }}
    >
      {/* Store banner — floats over the wave, same treatment as the setup card. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          padding: space.md,
          backgroundColor: color.surface,
          borderWidth: 1,
          borderColor: color.borderSoft,
          borderRadius: 20,
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: store.logoUrl ? color.border : color.primary,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: store.logoUrl ? color.surface : color.primary,
          }}
        >
          {store.logoUrl ? (
            <Image
              source={{ uri: store.logoUrl }}
              resizeMode="contain"
              style={{ width: "100%", height: "100%" }}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text
              style={{
                fontSize: fontSize.headingSm,
                fontWeight: "700",
                color: color.onPrimary,
              }}
            >
              {storeInitial(store.name)}
            </Text>
          )}
        </View>
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}
        >
          {store.name}
        </Text>
      </View>
      {enrolled?.email ? (
        <Text style={{ fontSize: fontSize.body, color: color.inkMuted, marginTop: -space.sm }}>
          Terminal signed in as {enrolled.email}. Shift unlock uses a 4–6 digit PIN, not this password.
        </Text>
      ) : null}

      <Button
        label="Use a different shop account"
        variant="secondary"
        icon={UserRoundCog}
        disabled={busy || syncing}
        onPress={() => void switchAccount()}
        style={{ borderRadius: 14 }}
      />

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.headingMd, fontWeight: "700", color: color.ink }}>
            Who is on shift?
          </Text>
          <Text
            style={{
              fontSize: fontSize.caption,
              color: loadError || syncError ? color.dangerInk : color.inkMuted,
              marginTop: space.xs,
            }}
          >
            {loadingList || syncing
              ? "Fetching latest data..."
              : (loadError ?? syncError ?? `Last synced: ${timeAgo(lastSyncedAt)}`)}
          </Text>
        </View>

        <Button
          label={syncing || loadingList ? "Refreshing..." : "Refresh"}
          variant="secondary"
          icon={RefreshCw}
          busy={syncing || loadingList}
          onPress={() => void refreshCashiers()}
          style={{ borderRadius: 14 }}
        />
      </View>

      {cashiers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={
              loadError
                ? "Cannot reach the server"
                : loadingList
                  ? "Loading cashiers..."
                  : "No cashiers yet"
            }
            instruction={
              loadError
                ? "Check the connection, then press Refresh."
                : "Add a cashier with a PIN in the admin dashboard, or set a PIN on this shop's admin, then press Refresh."
            }
          />
        </Card>
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: space.sm,
          }}
        >
          {cashiers.map((cashier) => {
            const active = selected?.id === cashier.id;

            return (
              <Pressable
                key={cashier.id}
                onPress={() => {
                  setSelected(cashier);
                  setPin("");
                  setError(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${cashier.name}, ${cashier.role === "admin" ? "Admin" : "Cashier"}`}
                style={({ pressed }) => [
                  styles.card,
                  {
                    width: cashierTileWidth,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: space.sm,
                    paddingVertical: space.lg,
                    paddingHorizontal: space.lg,
                    minHeight: layout.tileMinHeight,
                    borderColor: active ? color.primary : color.border,
                    borderWidth: active ? 2 : 1,
                    backgroundColor: pressed
                      ? color.primarySoft
                      : active
                        ? color.primaryTint
                        : color.surface,
                  },
                ]}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active ? color.primary : color.primarySoft,
                  }}
                >
                  {cashier.role === "admin" ? (
                    <Shield
                      size={24}
                      color={active ? color.onPrimary : color.primary}
                      strokeWidth={2}
                    />
                  ) : (
                    <UserRound
                      size={24}
                      color={active ? color.onPrimary : color.primary}
                      strokeWidth={2}
                    />
                  )}
                </View>

                <View style={{ alignItems: "center", gap: space.xs, width: "100%" }}>
                  <Text
                    numberOfLines={2}
                    style={{
                      fontSize: fontSize.bodyLg,
                      fontWeight: "700",
                      color: color.ink,
                      textAlign: "center",
                    }}
                  >
                    {cashier.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.caption,
                      fontWeight: "600",
                      color: active ? color.primary : color.inkMuted,
                      textAlign: "center",
                    }}
                  >
                    {cashier.role === "admin" ? "Admin" : "Cashier"}
                  </Text>
                </View>

                {active ? (
                  <View
                    style={{
                      position: "absolute",
                      top: space.sm,
                      right: space.sm,
                    }}
                  >
                    <Check size={18} color={color.primary} strokeWidth={2.5} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Bottom of the wave — was empty. A short, genuinely useful note instead of dead space. */}
      <View style={{ gap: space.xs, marginTop: space["3xl"], paddingBottom: space.md }}>
        <Text
          style={{
            fontSize: fontSize.body,
            fontWeight: "600",
            color: color.onPrimary,
            textAlign: "center",
          }}
        >
          Why does unlocking need a connection?
        </Text>
        <Text
          style={{
            fontSize: fontSize.caption,
            color: color.sageLight,
            textAlign: "center",
            lineHeight: 18,
          }}
        >
          Your PIN is checked live against the shop's account, every time — never stored on
          this tablet. Once you're in, selling works fully offline until you tap Sync.
        </Text>
      </View>
    </ScrollView>

    {/*
      An in-tree overlay, not a native Modal. The keypad is the only way into a
      shift, so it cannot depend on a second native window being presented over
      this route — that is what stopped appearing.
    */}
    {selected !== null ? (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            justifyContent: "center",
            paddingHorizontal: dialogPadding,
            paddingTop: insets.top + space.md,
            paddingBottom: insets.bottom + space.md,
            backgroundColor: `${color.ink}99`,
          },
        ]}
      >
        <Pressable
          onPress={closePinDialog}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={StyleSheet.absoluteFill}
        />

        <View
          style={{
            width: "100%",
            maxWidth: 400,
            alignSelf: "center",
            backgroundColor: color.surface,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: color.borderSoft,
            padding: space.lg,
            gap: space.lg,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <IconButton icon={X} label="Close" onPress={closePinDialog} disabled={busy} />
          </View>

          <View style={{ alignItems: "center", gap: space.sm, marginTop: -space.lg }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: color.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image source={PIN_ICON} style={{ width: 44, height: 44 }} resizeMode="contain" />
            </View>
            <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
              PIN for {selected?.name}
            </Text>
            <Text style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}>
              Enter your {PIN_LENGTH_MIN}-{PIN_LENGTH_MAX} digit PIN to start the shift.
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: space.sm, justifyContent: "center" }}>
            {Array.from({ length: PIN_LENGTH_MAX }).map((_, index) => {
              const filled = index < pin.length;
              return (
                <View
                  key={index}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: filled ? 0 : 1,
                    // Past the minimum the remaining dots are optional, so they
                    // stay faint rather than reading as digits still owed.
                    borderColor:
                      index < PIN_LENGTH_MIN ? color.primarySoft : color.borderSoft,
                    backgroundColor: filled ? color.primary : "transparent",
                  }}
                />
              );
            })}
          </View>

          <View style={{ gap: space.sm }}>
            {[
              ["1", "2", "3"],
              ["4", "5", "6"],
              ["7", "8", "9"],
              ["", "0", "clear"],
            ].map((row) => (
              <View
                key={row.join()}
                style={{ flexDirection: "row", gap: space.lg, justifyContent: "center" }}
              >
                {row.map((key, i) => {
                  if (key === "") {
                    // Empty bottom-left cell — keeps 0 centred and clear bottom-right, standard PIN pad layout.
                    return <View key={`spacer-${i}`} style={{ width: 64, height: 64 }} />;
                  }
                  const isClear = key === "clear";
                  return (
                    <Pressable
                      key={key}
                      onPress={() => {
                        if (isClear) {
                          setPin("");
                          return;
                        }
                        if (pin.length < PIN_LENGTH_MAX) setPin(pin + key);
                      }}
                      disabled={busy}
                      accessibilityLabel={isClear ? "Clear PIN" : key}
                      style={({ pressed }) => ({
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: isClear ? color.dangerSoft : color.primarySoft,
                        backgroundColor: pressed
                          ? color.primarySoft
                          : isClear
                            ? color.dangerSoft
                            : color.paper,
                      })}
                    >
                      {isClear ? (
                        <Delete size={22} color={color.dangerInk} strokeWidth={2} />
                      ) : (
                        <Text style={{ fontSize: fontSize.headingMd, fontWeight: "600", color: color.ink }}>
                          {key}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Button
            label={busy ? "Checking..." : "Start shift"}
            large
            icon={Check}
            busy={busy}
            disabled={pin.length < PIN_LENGTH_MIN}
            onPress={() => void submit()}
            style={{ borderRadius: 14 }}
          />

          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, textAlign: "center" }}>
            Forgot your PIN? Ask an admin to set a new one from the dashboard.
          </Text>
        </View>
      </View>
    ) : null}
    </View>
    </View>
  );
}
