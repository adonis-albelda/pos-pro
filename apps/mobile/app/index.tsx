import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { CompanyIntro } from "@/components/company-intro";
import { FeatureOnboarding } from "@/components/feature-onboarding";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { getSyncMeta } from "@/db/meta";
import { hasSeenFeatureOnboarding } from "@/lib/onboarding";
import { useSession } from "@/lib/session";
import { isEnrolled } from "@/lib/api/session";

type Destination =
  | { state: "needs-setup" }
  | { state: "needs-unlock" }
  | { state: "ready" };

type Boot =
  | { state: "intro" }
  | { state: "onboarding" }
  | { state: "checking" }
  | Destination;

type OnboardingGate = "unknown" | "needed" | "seen";

/**
 * Cold start: company intro → (first install only) feature steppers →
 * enroll / unlock / POS.
 *
 * The enrollment check runs *during* the splash hold, not after it — local
 * SQLite/SecureStore reads finish well inside COMPANY_INTRO_HOLD_MS, so by
 * the time the splash's own timer ends there's almost always already a
 * destination ready and the redirect fires immediately. That's what keeps
 * this from flashing a blank "checking" screen between splash and the next
 * route; the old version only started the check once the splash was gone.
 *
 * Feature steppers sit after the splash and only when AsyncStorage says this
 * install has never finished them — returning cashiers never see them again.
 */
export default function Index() {
  const { cashier } = useSession();
  const [boot, setBoot] = useState<Boot>({ state: "intro" });
  const destination = useRef<Destination | null>(null);
  const introDone = useRef(false);
  const onboardingGate = useRef<OnboardingGate>("unknown");

  function advance() {
    if (!introDone.current) return;
    if (onboardingGate.current === "unknown" || destination.current === null) {
      setBoot({ state: "checking" });
      return;
    }
    if (onboardingGate.current === "needed") {
      setBoot({ state: "onboarding" });
      return;
    }
    setBoot(destination.current);
  }

  useEffect(() => {
    async function check() {
      const [enrolled, meta, seenOnboarding] = await Promise.all([
        isEnrolled(),
        getSyncMeta(),
        hasSeenFeatureOnboarding(),
      ]);
      onboardingGate.current = seenOnboarding ? "seen" : "needed";
      destination.current =
        !enrolled || !meta.firstPullDone
          ? { state: "needs-setup" }
          : { state: cashier ? "ready" : "needs-unlock" };
      advance();
    }

    void check();
    // advance closes over refs; cashier is the only reactive input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashier]);

  function handleIntroDone() {
    introDone.current = true;
    advance();
  }

  function handleOnboardingDone() {
    onboardingGate.current = "seen";
    setBoot(destination.current ?? { state: "checking" });
  }

  if (boot.state === "intro") {
    return <CompanyIntro onDone={handleIntroDone} />;
  }

  if (boot.state === "onboarding") {
    return <FeatureOnboarding onDone={handleOnboardingDone} />;
  }

  if (boot.state === "checking") {
    return (
      <View style={{ flex: 1 }}>
        <WaveBackdrop />
        <LoadingState text="Getting things ready…" />
      </View>
    );
  }

  if (boot.state === "needs-setup") return <Redirect href="/setup" />;
  if (boot.state === "needs-unlock") return <Redirect href="/unlock" />;
  return <Redirect href="/pos" />;
}
