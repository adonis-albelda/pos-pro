import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BUSINESS_TYPES, ROLES, type User } from "@double-a/shared-types";
import { ApiError } from "@double-a/api-client";
import {
  forgotPassword,
  login,
  registerDemoAccount,
  resendRegistrationVerification,
  updateCompanyBusinessType,
} from "@double-a/api-client/queries";
import { getSyncMeta, markFirstPullSkipped } from "@/db/meta";
import { countLocalProducts } from "@/db/products";
import { getDeviceId, setDeviceLabel, getEnrolledCompanyId, setEnrolledCompanyId, setEnrolledLocationId, getEnrolledLocationId, setEnrolledRole } from "@/lib/device";
import { resetLocalData } from "@/db";
import { useLayout } from "@/lib/layout";
import { createBareClient } from "@/lib/api/client";
import { getApiClient, isEnrolled, setSessionToken, unenrollTerminal } from "@/lib/api/session";
import { registerDevicePushToken } from "@/lib/push";
import { runFirstPull } from "@/sync";
import { useSync } from "@/sync/sync-provider";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  CloudDownload,
  CheckCircle2,
  LogIn,
  RefreshCw,
  Play,
  Send,
  Store,
  UserPlus,
  UserX,
  ShieldCheck,
} from "lucide-react-native";
import { Button, ErrorNote } from "@/components/ui";
import { useKeyboardHeight } from "@/components/bottom-sheet";
import { FeatureOnboarding } from "@/components/feature-onboarding";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { hasSeenFeatureOnboarding } from "@/lib/onboarding";
import { circleRadius, color, fontSize, radius, space } from "@/theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as company-intro.tsx; no *.png module declaration in this project
const LOGO = require("../assets/logo.webp");

/**
 * How often the "check your email" screen retries login while waiting for
 * the owner to click the verification link. LoginController rejects an
 * unverified email with the same generic "invalid credentials" 422 as a
 * wrong password (see LoginController — it nulls the user before the
 * Hash::check when email_verified_at is null), so there is no dedicated
 * "is this verified yet?" endpoint to poll instead — retrying the same
 * login call IS the check, and it starts succeeding the moment
 * VerifyEmailController marks the account verified.
 *
 * A freshly registered account is a demo account, and AppServiceProvider's
 * auth-login rate limiter caps those at 10/min — every attempt below stays
 * a demo login (same email, unverified), so this interval must clear that
 * bar with margin (~8.5/min) rather than trip a 429 mid-wait.
 */
const VERIFY_POLL_INTERVAL_MS = 7000;

/** Must match the API's AUTH_VERIFICATION_EXPIRE (config/auth.php). */
const VERIFICATION_LINK_EXPIRE_MINUTES = 10;

type SetupFlowStep = "first-pull" | "business-type" | "done";
type Step = "sign-in" | "feature-onboarding" | SetupFlowStep;

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
  const keyboardHeight = useKeyboardHeight();
  const { notifyEnrollmentChanged } = useSync();

  const [step, setStep] = useState<Step>("sign-in");
  const [afterOnboardingStep, setAfterOnboardingStep] = useState<SetupFlowStep>("first-pull");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulled, setPulled] = useState<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerBusinessName, setRegisterBusinessName] = useState("");
  const [registerBusy, setRegisterBusy] = useState(false);
  const [registerSent, setRegisterSent] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [businessTypeBusy, setBusinessTypeBusy] = useState(false);
  // When the current verification link was sent — link dies
  // VERIFICATION_LINK_EXPIRE_MINUTES after this (must match the API's
  // AUTH_VERIFICATION_EXPIRE, config/auth.php).
  const [verificationSentAt, setVerificationSentAt] = useState<number | null>(null);
  const [verificationExpired, setVerificationExpired] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendConfirmation, setResendConfirmation] = useState<string | null>(null);

  useEffect(() => {
    async function prime() {
      // Mints and persists this terminal's stable id on first run — nothing
      // here displays it, but sales/tokens need it minted before use.
      void getDeviceId();

      const [enrolled, meta] = await Promise.all([isEnrolled(), getSyncMeta()]);
      if (enrolled && !meta.firstPullDone) setStep("first-pull");
      if (enrolled && meta.firstPullDone) setStep("done");
    }

    void prime();
  }, []);

  /**
   * Everything that happens once a login() call comes back with a token —
   * shared by the manual sign-in form and the "check your email" screen's
   * background poll, since both end at the same place (an enrolled device,
   * headed to onboarding/business-type/first-pull).
   */
  async function completeSignIn(signedIn: Awaited<ReturnType<typeof login>>): Promise<boolean> {
    const profile = signedIn.user;

    if (profile.role !== ROLES.ADMIN && profile.role !== ROLES.TERMINAL) {
      setError(
        "Cashiers do not sign in here — they unlock with a PIN once setup is done. Use an admin or Terminal account.",
      );
      return false;
    }

    if (!profile.companyIsActive) {
      setError("This shop account is disabled. Contact the office.");
      return false;
    }

    if (!profile.companyId) {
      setError("This login is not linked to a company.");
      return false;
    }

    if (profile.role === ROLES.TERMINAL && !profile.locationId) {
      setError("This terminal account is not bound to a branch. Ask admin to re-enroll it.");
      return false;
    }

    // Terminal accounts are created in web admin only
    // (Users page) — mobile setup never mints one. An admin logging in
    // here just persists their own login token directly, same as a
    // pre-existing Terminal account's.
    const sessionToken = signedIn.token;

    const storedCompany = await getEnrolledCompanyId();
    const storedLocation = await getEnrolledLocationId();
    if (
      (storedCompany && storedCompany !== profile.companyId) ||
      (profile.locationId && storedLocation && storedLocation !== profile.locationId)
    ) {
      await resetLocalData();
    }
    await setEnrolledCompanyId(profile.companyId);
    if (profile.role === ROLES.ADMIN || profile.role === ROLES.TERMINAL) {
      await setEnrolledRole(profile.role);
    }
    if (profile.locationId) {
      await setEnrolledLocationId(profile.locationId);
    }
    await setSessionToken(sessionToken);
    void registerDevicePushToken();

    setAccount(profile);
    await setDeviceLabel(profile.name);
    setPassword("");

    // An admin isn't necessarily standing this tablet up as a selling
    // terminal right now — do not force the offline catalog download.
    // A real Terminal account is: it needs products on-device before a
    // cashier can sell, and may not reach the Sync tab first. Either way
    // the deferred pull (next visit to the Sync tab) still comes down as
    // a full pull, since no watermark gets set here.
    const nextStep: SetupFlowStep =
      profile.role === ROLES.ADMIN ? "business-type" : "first-pull";
    if (profile.role === ROLES.ADMIN) {
      await markFirstPullSkipped();
    }

    // First-install feature tour — right after sign-in, before catalog /
    // business-type. Returning installs that already finished skip it.
    const seenOnboarding = await hasSeenFeatureOnboarding();
    if (!seenOnboarding) {
      setAfterOnboardingStep(nextStep);
      setStep("feature-onboarding");
    } else {
      setStep(nextStep);
    }
    return true;
  }

  async function connectTerminal() {
    if (!email.trim() || !password) {
      setError("Enter the email and password for the account.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // Audit-only label for the Sanctum token — the real, per-terminal
      // label shown elsewhere (pos/settings.tsx) is set below from the
      // signed-in account's own name once the response comes back.
      const deviceName = "Mobile Terminal";

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

      await completeSignIn(signedIn);
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

  async function sendResetLink() {
    if (!forgotEmail.trim()) {
      setForgotError("Enter the admin account's email.");
      return;
    }

    setForgotBusy(true);
    setForgotError(null);
    try {
      await forgotPassword(createBareClient(), forgotEmail.trim());
      setForgotSent(true);
    } catch (cause) {
      setForgotError(
        cause instanceof Error
          ? cause.message
          : "Could not reach the server — check the connection and try again",
      );
    } finally {
      setForgotBusy(false);
    }
  }

  function closeForgotPassword() {
    setForgotOpen(false);
    setForgotSent(false);
    setForgotError(null);
    setForgotEmail("");
  }

  async function submitRegistration() {
    if (!registerEmail.trim() || !registerPassword || !registerBusinessName.trim()) {
      setRegisterError("Fill in email, password, and business name.");
      return;
    }
    if (registerPassword.length < 8) {
      setRegisterError("Password must be at least 8 characters.");
      return;
    }

    setRegisterBusy(true);
    setRegisterError(null);
    try {
      await registerDemoAccount(createBareClient(), {
        email: registerEmail.trim(),
        password: registerPassword,
        businessName: registerBusinessName.trim(),
      });
      setRegisterSent(true);
      setVerificationSentAt(Date.now());
      setVerificationExpired(false);
    } catch (cause) {
      // A 422 here always means the field-level message (e.g. "An account
      // already exists for this email") — cause.message is only ever
      // Laravel's generic "The given data was invalid." wrapper text, never
      // the actual reason, so read the field error out of .errors instead.
      const fieldError =
        cause instanceof ApiError && cause.errors
          ? Object.values(cause.errors)[0]?.[0]
          : undefined;
      setRegisterError(
        fieldError ??
          (cause instanceof Error
            ? cause.message
            : "Could not reach the server — check the connection and try again"),
      );
    } finally {
      setRegisterBusy(false);
    }
  }

  function closeRegistration() {
    setRegisterOpen(false);
    setRegisterSent(false);
    setRegisterError(null);
    setRegisterEmail("");
    setRegisterPassword("");
    setRegisterBusinessName("");
    setVerificationSentAt(null);
    setVerificationExpired(false);
    setResendError(null);
    setResendConfirmation(null);
  }

  // While waiting on verification, "Back to sign in" drops this screen's
  // only copy of the poll loop — the account itself is untouched server-side
  // (still there, still unverified), but the owner would need to register
  // again from scratch to get back to a "check your email" state on this
  // device. Worth a confirm; filling out the form pre-submit has no such
  // cost, so only gate it once a link has actually gone out.
  function requestCloseRegistration() {
    if (!registerSent) {
      closeRegistration();
      return;
    }

    Alert.alert(
      "Go back to sign in?",
      "This stops waiting for your verification email. You'll need to register again to get a new link.",
      [
        { text: "Stay here", style: "cancel" },
        { text: "Go back", style: "destructive", onPress: closeRegistration },
      ],
    );
  }

  async function resendVerification() {
    const emailToResend = registerEmail.trim();
    if (!emailToResend) return;

    setResendBusy(true);
    setResendError(null);
    setResendConfirmation(null);
    try {
      await resendRegistrationVerification(createBareClient(), emailToResend);
      setVerificationSentAt(Date.now());
      setVerificationExpired(false);
      setResendConfirmation(`Sent a new link to ${emailToResend}`);
    } catch (cause) {
      const fieldError =
        cause instanceof ApiError && cause.errors ? Object.values(cause.errors)[0]?.[0] : undefined;
      setResendError(
        fieldError ??
          (cause instanceof Error
            ? cause.message
            : "Could not reach the server — check the connection and try again"),
      );
    } finally {
      setResendBusy(false);
    }
  }

  // Stay on the "check your email" screen and keep retrying login in the
  // background — the account's own email/password, not a token from
  // registerDemoAccount (register never returns one). Login itself starts
  // succeeding the instant the owner clicks the verification link, so this
  // retry loop doubles as the "is it verified yet?" check (see
  // VERIFY_POLL_INTERVAL_MS above).
  useEffect(() => {
    if (!registerSent) return;
    let cancelled = false;
    const emailToVerify = registerEmail.trim();
    const passwordToVerify = registerPassword;

    const timer = setInterval(() => {
      void (async () => {
        try {
          const signedIn = await login(createBareClient(), {
            email: emailToVerify,
            password: passwordToVerify,
            deviceName: "Mobile Terminal",
          });
          if (cancelled) return;
          clearInterval(timer);
          await completeSignIn(signedIn);
        } catch {
          // Not verified yet — same 422 as a wrong password either way
          // (LoginController can't tell them apart), or a dropped
          // connection. Either way, just try again next tick.
        }
      })();
    }, VERIFY_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [registerSent, registerEmail, registerPassword]);

  // Flips once the current link is past AUTH_VERIFICATION_EXPIRE — the login
  // poll above keeps running regardless (harmless either way, it's just
  // trying a login), this only swaps the "waiting" UI for a resend prompt.
  useEffect(() => {
    if (!registerSent || null === verificationSentAt) return;

    const elapsed = Date.now() - verificationSentAt;
    const remaining = VERIFICATION_LINK_EXPIRE_MINUTES * 60_000 - elapsed;
    if (remaining <= 0) {
      setVerificationExpired(true);
      return;
    }

    const timer = setTimeout(() => setVerificationExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [registerSent, verificationSentAt]);

  async function firstPull() {
    setBusy(true);
    setError(null);

    try {
      await runFirstPull();
      setPulled(await countLocalProducts());
      setStep("business-type");
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

  async function submitBusinessType(key: string) {
    setBusinessTypeBusy(true);
    try {
      await updateCompanyBusinessType(getApiClient(), key);
    } catch {
      // Best-effort — a survey answer is not worth blocking setup over.
    } finally {
      setBusinessTypeBusy(false);
      setStep("done");
      notifyEnrollmentChanged();
    }
  }

  function skipBusinessType() {
    setStep("done");
    notifyEnrollmentChanged();
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

  const stepIndex = ["sign-in", "first-pull", "business-type", "done"].indexOf(step);

  const stepMeta = {
    "sign-in": {
      title: "Terminal Setup",
      subtitle: "Sign in to connect this device",
      Icon: ShieldCheck,
    },
    "feature-onboarding": {
      title: "Welcome",
      subtitle: "A quick look at what POSPro can do",
      Icon: ShieldCheck,
    },
    "first-pull": {
      title: "Download Catalog",
      subtitle: "Get products ready for offline use",
      Icon: CloudDownload,
    },
    "business-type": {
      title: "One Last Thing",
      subtitle: "What kind of business is this?",
      Icon: Store,
    },
    done: {
      title: "Ready to Sell",
      subtitle: pulled !== null ? `${pulled} products loaded` : "Terminal is enrolled",
      Icon: CheckCircle2,
    },
  }[step];

  if (step === "feature-onboarding") {
    return (
      <FeatureOnboarding
        onDone={() => {
          setStep(afterOnboardingStep);
        }}
      />
    );
  }

  const cardHeading =
    step === "sign-in" && registerOpen
      ? {
          title: "Register Your Business",
          subtitle: "Name your shop and create an admin account",
          Icon: Store,
        }
      : step === "sign-in" && forgotOpen
        ? {
            title: "Reset Password",
            subtitle: "We'll email a link to your admin account",
            Icon: Mail,
          }
        : stepMeta;

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <WaveBackdrop />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          // Once the keyboard is up, centering fights it — the bottom half
          // of a tall form (register/sign-in, three stacked fields) can
          // land underneath. Top-align instead so the field being typed
          // into is always the thing sitting right below the header, and
          // pad the bottom by the keyboard's own height so there's still
          // room to scroll the last field/button above it.
          // Verification-pending body (spinner + resend area) and the
          // download-catalog step both grow/shrink as their own state
          // changes — true-centering either means the logo/title above them
          // visibly drift instead of sitting still at the top.
          justifyContent:
            keyboardHeight > 0 || registerSent || "first-pull" === step ? "flex-start" : "center",
          paddingHorizontal: layout.gutter,
          // Must stay equal top/bottom when no keyboard — that symmetry is
          // what makes the sole flow child (the card) land at the screen's
          // true vertical middle. The leftover space this centering creates
          // above the card is what gives the absolutely-positioned header
          // (below) room to render.
          paddingTop: insets.top + space.xl,
          paddingBottom: Math.max(insets.bottom, space.xl) + keyboardHeight,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            width: "100%",
            maxWidth: 480,
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
            marginTop:
              registerSent || "first-pull" === step ? 0 : Math.max(-headerHeight / 2, -space.xl),
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
                borderRadius: circleRadius(100),
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
              borderRadius: radius.lg,
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
                  borderRadius: radius.md,
                  backgroundColor: step === "done" ? color.successSoft : color.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <cardHeading.Icon
                  size={18}
                  color={step === "done" ? color.success : color.primary}
                  strokeWidth={2}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
                  {cardHeading.title}
                </Text>
                <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                  {cardHeading.subtitle}
                </Text>
              </View>
            </View>

            {step === "sign-in" && !forgotOpen && !registerOpen ? (
              <>
                <FilledInput
                  label="Email/Username"
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
                {error ? <ErrorNote>{error}</ErrorNote> : null}
                <Button
                  label={busy ? "Signing in..." : "Sign In"}
                  large
                  busy={busy}
                  onPress={() => void connectTerminal()}
                 
                  icon={LogIn}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: space.md,
                  }}
                >
                  <TextLink label="Forgot password?" onPress={() => setForgotOpen(true)} disabled={busy} />
                  <TextLink label="New to POSPro?" onPress={() => setRegisterOpen(true)} disabled={busy} />
                </View>
                <InfoLine text="One-time setup, admin or terminal account only — needs an internet connection." />
              </>
            ) : null}

            {step === "sign-in" && registerOpen ? (
              <>
                {registerSent ? (
                  <>
                    <View
                      style={{
                        backgroundColor: color.successSoft,
                        borderRadius: radius.md,
                        paddingHorizontal: space.md,
                        paddingVertical: space.md,
                        alignItems: "center",
                        gap: space.xs,
                      }}
                    >
                      <CheckCircle2 size={22} color={color.success} strokeWidth={2} />
                      <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink, textAlign: "center" }}>
                        Check your email to verify your account.
                      </Text>
                      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, textAlign: "center" }}>
                        Sent to {registerEmail.trim()}
                      </Text>
                    </View>
                    {verificationExpired ? (
                      <>
                        <ErrorNote>
                          That link has expired. Send yourself a new one to keep going.
                        </ErrorNote>
                        {resendConfirmation ? (
                          <Text style={{ fontSize: fontSize.caption, color: color.success, textAlign: "center" }}>
                            {resendConfirmation}
                          </Text>
                        ) : null}
                        {resendError ? <ErrorNote>{resendError}</ErrorNote> : null}
                        <Button
                          label={resendBusy ? "Sending..." : "Resend verification email"}
                          large
                          busy={resendBusy}
                          onPress={() => void resendVerification()}
                         
                          icon={Send}
                        />
                      </>
                    ) : (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: space.sm,
                        }}
                      >
                        <ActivityIndicator color={color.primary} />
                        <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>
                          Waiting for verification — stay on this screen
                        </Text>
                      </View>
                    )}
                    {error ? <ErrorNote>{error}</ErrorNote> : null}
                  </>
                ) : (
                  <>
                    <FilledInput
                      label="Email Address"
                      icon={<Mail size={16} color={color.inkMuted} strokeWidth={2} />}
                      value={registerEmail}
                      onChangeText={setRegisterEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      placeholder="jane@example.com"
                    />
                    <FilledInput
                      label="Password"
                      icon={<Lock size={16} color={color.inkMuted} strokeWidth={2} />}
                      value={registerPassword}
                      onChangeText={setRegisterPassword}
                      secureTextEntry
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                    />
                    <FilledInput
                      label="Business Name"
                      icon={<Store size={16} color={color.inkMuted} strokeWidth={2} />}
                      value={registerBusinessName}
                      onChangeText={setRegisterBusinessName}
                      placeholder="Jane's Sari-Sari Store"
                    />
                    {registerError ? <ErrorNote>{registerError}</ErrorNote> : null}
                    <Button
                      label={registerBusy ? "Creating account..." : "Create Account"}
                      large
                      busy={registerBusy}
                      onPress={() => void submitRegistration()}
                     
                      icon={UserPlus}
                    />
                  </>
                )}
                <TextLink label="Back to sign in" onPress={requestCloseRegistration} disabled={registerBusy} />
              </>
            ) : null}

            {step === "sign-in" && forgotOpen ? (
              <>
                {forgotSent ? (
                  <View
                    style={{
                      backgroundColor: color.successSoft,
                      borderRadius: radius.md,
                      paddingHorizontal: space.md,
                      paddingVertical: space.md,
                      alignItems: "center",
                      gap: space.xs,
                    }}
                  >
                    <CheckCircle2 size={22} color={color.success} strokeWidth={2} />
                    <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink, textAlign: "center" }}>
                      If that's an admin account, a reset link is on its way.
                    </Text>
                  </View>
                ) : (
                  <>
                    <FilledInput
                      label="Admin Email Address"
                      icon={<Mail size={16} color={color.inkMuted} strokeWidth={2} />}
                      value={forgotEmail}
                      onChangeText={setForgotEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      placeholder="admin@yourshop.com"
                    />
                    {forgotError ? <ErrorNote>{forgotError}</ErrorNote> : null}
                    <Button
                      label={forgotBusy ? "Sending..." : "Send Reset Link"}
                      large
                      busy={forgotBusy}
                      onPress={() => void sendResetLink()}
                     
                      icon={Send}
                    />
                    <InfoLine text="Password resets are for admin accounts only." />
                  </>
                )}
                <TextLink label="Back to sign in" onPress={closeForgotPassword} disabled={forgotBusy} />
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
                      borderRadius: radius.md,
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
                 
                  icon={RefreshCw}
                />
                <TextLink label="Use a different account" onPress={() => void switchAccount()} disabled={busy} icon={<UserX size={14} color={color.primary} strokeWidth={2} />} />
                <InfoLine text="Downloads once — terminal works fully offline after this." />
              </>
            ) : null}

            {step === "business-type" ? (
              <>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {BUSINESS_TYPES.map((option) => (
                    <Pressable
                      key={option.key}
                      disabled={businessTypeBusy}
                      onPress={() => void submitBusinessType(option.key)}
                      style={{
                        flexBasis: "48%",
                        flexGrow: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: space.xs,
                        borderRadius: radius.md,
                        borderWidth: 1.5,
                        borderColor: color.primarySoft,
                        backgroundColor: color.surface,
                        paddingVertical: space.sm,
                        paddingHorizontal: space.sm,
                        opacity: businessTypeBusy ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ fontSize: fontSize.bodyLg }}>{option.emoji}</Text>
                      <Text style={{ fontSize: fontSize.caption, fontWeight: "600", color: color.ink, flexShrink: 1 }}>
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextLink label="Skip" onPress={skipBusinessType} disabled={businessTypeBusy} />
              </>
            ) : null}

            {step === "done" ? (
              <>
                <View
                  style={{
                    backgroundColor: color.successSoft,
                    borderRadius: radius.md,
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
        <Text
          style={{
            textAlign: "center",
            fontSize: fontSize.caption,
            color: color.sageLight,
            opacity: 0.8,
          }}
        >
          Copyright © 2026 POSPro - All Rights Reserved.
        </Text>
      </View>
    </View>
  );
}

/** Sits on the green wave — white/accent scheme, not the ink-scale one used on paper. */
function ProgressDots({ index, count = 4 }: { index: number; count?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
      {Array.from({ length: count }, (_, i) => i).map((i) => (
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
          borderRadius: radius.md,
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
