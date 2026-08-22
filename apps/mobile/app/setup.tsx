import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { User } from "@double-a/shared-types";
import { ApiError } from "@double-a/api-client";
import { login } from "@double-a/api-client/queries";
import { getSyncMeta, markFirstPullSkipped } from "@/db/meta";
import { countLocalProducts } from "@/db/products";
import { getDeviceId, getDeviceLabel, setDeviceLabel, getEnrolledCompanyId, setEnrolledCompanyId } from "@/lib/device";
import { resetLocalData } from "@/db";
import { useLayout } from "@/lib/layout";
import { createBareClient } from "@/lib/api/client";
import { isEnrolled, setSessionToken, unenrollTerminal } from "@/lib/api/session";
import { registerDevicePushToken } from "@/lib/push";
import { runFirstPull } from "@/sync";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Monitor,
  CloudDownload,
  CheckCircle2,
  LogIn,
  RefreshCw,
  Play,
  UserX,
  ShieldCheck,
} from "lucide-react-native";
import { Button, ErrorNote } from "@/components/ui";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, space } from "@/theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as company-intro.tsx; no *.png module declaration in this project
const LOGO = require("../assets/logo.png");

type Step = "sign-in" | "first-pull" | "done";

/**
 * One-time terminal setup — enrollment always requires connectivity.
 *
 * One live sign-in, with whatever credentials the account already has in the
 * database: an admin's dashboard email and password, or a dedicated Terminal
 * account's. Either role may push sales and call verify_pin, so a shop with a
 * single admin login needs nothing extra created before it can sell.
 *
 * The session signed in here is the one persisted on the device, so later syncs
 * need no login. Terminals are told apart by their own device id, not by the
 * account, so two tablets on the same admin login still report separately.
 *
 * Cashier unlock after this hits live verify_pin — local SQLite is only for
 * selling once the shift has started.
 */
export default function SetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const layout = useLayout();

  const [step, setStep] = useState<Step>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState<User | null>(null);
  const [label, setLabel] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulled, setPulled] = useState<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    async function prime() {
      setDeviceId(await getDeviceId());
      setLabel((await getDeviceLabel()) ?? "");

      const [enrolled, meta] = await Promise.all([isEnrolled(), getSyncMeta()]);
      if (enrolled && !meta.firstPullDone) setStep("first-pull");
      if (enrolled && meta.firstPullDone) setStep("done");
    }

    void prime();
  }, []);

  async function connectTerminal() {
    if (!email.trim() || !password) {
      setError("Enter the email and password for the account.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const deviceName = label.trim() || "Terminal";

      let signedIn;
      try {
        signedIn = await login(createBareClient(), {
          email: email.trim(),
          password,
          deviceName,
        });
      } catch (cause) {
        if (cause instanceof ApiError && (cause.isValidation || cause.isUnauthenticated)) {
          setError("That email and password do not match an account.");
          return;
        }
        throw cause;
      }

      const profile = signedIn.user;

      if (profile.role !== "admin" && profile.role !== "device") {
        setError(
          "Cashiers do not sign in here — they unlock with a PIN once setup is done. Use an admin or Terminal account.",
        );
        return;
      }

      if (!profile.companyIsActive) {
        setError("This shop account is disabled. Contact the office.");
        return;
      }

      if (!profile.companyId) {
        setError("This login is not linked to a company.");
        return;
      }

      // Terminal (device-role) accounts are created in web admin only
      // (Users page) — mobile setup never mints one. An admin logging in
      // here just persists their own login token directly, same as a
      // pre-existing Terminal account's.
      const sessionToken = signedIn.token;

      const storedCompany = await getEnrolledCompanyId();
      if (storedCompany && storedCompany !== profile.companyId) {
        await resetLocalData();
      }
      await setEnrolledCompanyId(profile.companyId);
      await setSessionToken(sessionToken);
      void registerDevicePushToken();

      setAccount(profile);
      await setDeviceLabel(deviceName);
      setPassword("");

      // An admin isn't necessarily standing this tablet up as a selling
      // terminal right now — do not force the offline catalog download.
      // A real Terminal account is: it needs products on-device before a
      // cashier can sell, and may not reach the Sync tab first. Either way
      // the deferred pull (next visit to the Sync tab) still comes down as
      // a full pull, since no watermark gets set here.
      if (profile.role === "admin") {
        await markFirstPullSkipped();
        setStep("done");
      } else {
        setStep("first-pull");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not reach the server — check the connection and try again",
      );
    } finally {
      setBusy(false);
    }
  }

  async function firstPull() {
    setBusy(true);
    setError(null);

    try {
      await runFirstPull();
      setPulled(await countLocalProducts());
      setStep("done");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not download products - check the connection and try again",
      );
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    setBusy(true);
    setError(null);
    try {
      await unenrollTerminal();
      setAccount(null);
      setPulled(null);
      setStep("sign-in");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not disconnect this terminal.",
      );
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = ["sign-in", "first-pull", "done"].indexOf(step);

  const stepMeta = {
    "sign-in": {
      title: "Terminal Setup",
      subtitle: "Sign in to connect this device",
      Icon: ShieldCheck,
    },
    "first-pull": {
      title: "Download Catalog",
      subtitle: "Get products ready for offline use",
      Icon: CloudDownload,
    },
    done: {
      title: "Ready to Sell",
      subtitle: pulled !== null ? `${pulled} products loaded` : "Terminal is enrolled",
      Icon: CheckCircle2,
    },
  }[step];

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <WaveBackdrop />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: layout.gutter,
          // Must stay equal top/bottom — that symmetry is what makes the sole
          // flow child (the card) land at the screen's true vertical middle.
          // The leftover space this centering creates above the card is what
          // gives the absolutely-positioned header (below) room to render.
          paddingTop: insets.top + space.xl,
          paddingBottom: insets.bottom + space.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            width: "100%",
            maxWidth: 380,
            alignSelf: "center",
            gap: space.xl,
            // justifyContent:"center" above centers this whole (header+card)
            // group, which puts the CARD's own center above true screen
            // middle by half the header's height. Shifting the group up by
            // that same amount cancels it out, so the card lands at center
            // regardless of the card's own height (short download-catalog
            // card vs. tall sign-in card with three fields) — measured via
            // onLayout below since header height is fixed but unknown until
            // first paint.
            //
            // Capped at -space.xl: on a short screen or a tall header (a
            // long shop name wrapping to two lines), the uncapped offset
            // could push the logo up past the ScrollView's own top padding
            // and under the status bar. Perfect optical centering loses to
            // "never draws outside the safe area."
            marginTop: Math.max(-headerHeight / 2, -space.xl),
          }}
        >
          <View
            onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
            style={{ alignItems: "center", gap: space.md }}
          >
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
                Welcome to POSPro!
              </Text>
              <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>
                Set up this terminal to start selling.
              </Text>
            </View>

            <ProgressDots index={stepIndex} />
          </View>

          {/* Form card — floats over the wave; a soft edge plus the shadow, not shadow alone. */}
          <View
            style={{
              backgroundColor: color.surface,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: color.borderSoft,
              paddingHorizontal: space.xl,
              paddingVertical: space.xl,
              gap: space.lg,
              shadowColor: "#000",
              shadowOpacity: 0.14,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 10 },
              elevation: 10,
            }}
          >
            {/* Card heading — the step-specific action, mirrors the outer greeting/card split */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  backgroundColor: step === "done" ? color.successSoft : color.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <stepMeta.Icon
                  size={18}
                  color={step === "done" ? color.success : color.primary}
                  strokeWidth={2}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
                  {stepMeta.title}
                </Text>
                <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                  {stepMeta.subtitle}
                </Text>
              </View>
            </View>

            {step === "sign-in" ? (
              <>
                <FilledInput
                  label="Email Address"
                  icon={<Mail size={16} color={color.inkMuted} strokeWidth={2} />}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="admin@yourshop.com"
                />
                <FilledInput
                  label="Password"
                  icon={<Lock size={16} color={color.inkMuted} strokeWidth={2} />}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="password"
                  placeholder="••••••••"
                />
                <FilledInput
                  label="Device Name"
                  icon={<Monitor size={16} color={color.inkMuted} strokeWidth={2} />}
                  value={label}
                  onChangeText={setLabel}
                  placeholder="Counter 1"
                />
                {error ? <ErrorNote>{error}</ErrorNote> : null}
                <Button
                  label={busy ? "Signing in..." : "Sign In"}
                  large
                  busy={busy}
                  onPress={() => void connectTerminal()}
                  style={{ borderRadius: 14 }}
                  icon={LogIn}
                />
                <InfoLine text="One-time setup, admin or terminal account only — needs an internet connection." />
              </>
            ) : null}

            {step === "first-pull" ? (
              <>
                {account ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.sm,
                      backgroundColor: color.primaryTint,
                      borderRadius: 12,
                      paddingHorizontal: space.md,
                      paddingVertical: space.sm,
                    }}
                  >
                    <ShieldCheck size={16} color={color.primary} strokeWidth={2} />
                    <Text style={{ fontSize: fontSize.body, color: color.primary, fontWeight: "600", flex: 1 }}>
                      {account.name}
                    </Text>
                  </View>
                ) : null}
                {error ? <ErrorNote>{error}</ErrorNote> : null}
                <Button
                  label={busy ? "Downloading..." : "Download Products"}
                  large
                  busy={busy}
                  onPress={() => void firstPull()}
                  style={{ borderRadius: 14 }}
                  icon={RefreshCw}
                />
                <TextLink label="Use a different account" onPress={() => void switchAccount()} disabled={busy} icon={<UserX size={14} color={color.primary} strokeWidth={2} />} />
                <InfoLine text="Downloads once — terminal works fully offline after this." />
              </>
            ) : null}

            {step === "done" ? (
              <>
                <View
                  style={{
                    backgroundColor: color.successSoft,
                    borderRadius: 12,
                    paddingHorizontal: space.md,
                    paddingVertical: space.md,
                    alignItems: "center",
                    gap: space.xs,
                  }}
                >
                  <CheckCircle2 size={22} color={color.success} strokeWidth={2} />
                  <Text style={{ fontSize: fontSize.body, color: color.successInk, fontWeight: "600", textAlign: "center" }}>
                    {pulled === null ? "Terminal is ready" : `${pulled} products loaded`}
                  </Text>
                  <Text style={{ fontSize: fontSize.caption, color: color.successInk, textAlign: "center" }}>
                    Cashiers can now unlock with their PIN
                  </Text>
                </View>
                {error ? <ErrorNote>{error}</ErrorNote> : null}
                <Button
                  label="Start Shift"
                  large
                  onPress={() => router.replace("/unlock")}
                  style={{ borderRadius: 14 }}
                  icon={Play}
                />
                <TextLink label="Use a different account" onPress={() => void switchAccount()} disabled={busy} icon={<UserX size={14} color={color.primary} strokeWidth={2} />} />
                <InfoLine text="Sync anytime from the Sync tab during a shift." />
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/*
        Pinned to the screen bottom, out of the centered header+card group —
        so its height never skews where the card lands, and the card always
        sits at the wave's 50/50 split regardless of step content or keyboard.
      */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: insets.bottom + space.lg,
          gap: space.xs,
        }}
      >
        <Text style={{ textAlign: "center", fontSize: fontSize.caption, color: color.sageLight }}>
          Device ID: {deviceId.slice(0, 8).toUpperCase()}
        </Text>
        <Text
          style={{
            textAlign: "center",
            fontSize: fontSize.caption,
            color: color.sageLight,
            opacity: 0.8,
          }}
        >
          Copyright © 2026 PROPos - All Rights Reserved.
        </Text>
      </View>
    </View>
  );
}

/** Sits on the green wave — white/accent scheme, not the ink-scale one used on paper. */
function ProgressDots({ index }: { index: number }) {
  return (
    <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: i === index ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor:
              i < index ? color.success : i === index ? color.primary : color.border,
          }}
        />
      ))}
    </View>
  );
}

function InfoLine({ text }: { text: string }) {
  return (
    <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, textAlign: "center", lineHeight: 18 }}>
      {text}
    </Text>
  );
}

function TextLink({
  label,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={{
        alignSelf: "center",
        opacity: disabled ? 0.45 : 1,
        paddingVertical: space.xs,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
      }}
    >
      {icon}
      <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.primary }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Filled, solid input — static label above the field, real placeholder inside it. */
function FilledInput({
  label,
  icon,
  secureTextEntry,
  value,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; icon?: React.ReactNode }) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, fontWeight: "600" }}>
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: color.surface,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: focused ? color.primary : color.primarySoft,
          paddingHorizontal: space.md,
          gap: space.sm,
        }}
      >
        <View style={{ opacity: focused || Boolean(value) ? 1 : 0.5 }}>{icon}</View>
        <TextInput
          {...props}
          value={value}
          secureTextEntry={isPassword && !revealed}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            flex: 1,
            minHeight: 48,
            fontSize: fontSize.bodyLg,
            fontWeight: value ? "600" : "400",
            color: color.ink,
          }}
          placeholderTextColor={color.inkMuted}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={8}
            style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
          >
            {revealed ? (
              <EyeOff size={18} color={color.inkMuted} strokeWidth={2} />
            ) : (
              <Eye size={18} color={color.inkMuted} strokeWidth={2} />
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
