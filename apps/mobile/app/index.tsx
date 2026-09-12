import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { CompanyIntro } from "@/components/company-intro";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { getSyncMeta } from "@/db/meta";
import { useSession } from "@/lib/session";
import { isEnrolled } from "@/lib/api/session";

type Destination =
  | { state: "needs-setup" }
  | { state: "needs-unlock" }
  | { state: "ready" };

type Boot =
  | { state: "intro" }
  | { state: "checking" }
  | Destination;

/**
 * Cold start: company intro → enroll / unlock / POS.
 *
 * Feature steppers live inside setup, right after a successful sign-in —
 * not on this gate. The enrollment check runs *during* the splash hold so
 * the redirect fires as soon as the intro timer ends (no blank flash).
 */
export default function Index() {
  const { cashier } = useSession();
  const [boot, setBoot] = useState<Boot>({ state: "intro" });
  const destination = useRef<Destination | null>(null);
  const introDone = useRef(false);

  function advance() {
    if (!introDone.current) return;
    if (destination.current === null) {
      setBoot({ state: "checking" });
      return;
    }
    setBoot(destination.current);
  }

  useEffect(() => {
    async function check() {
      const [enrolled, meta] = await Promise.all([isEnrolled(), getSyncMeta()]);
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

  if (boot.state === "intro") {
    return <CompanyIntro onDone={handleIntroDone} />;
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
