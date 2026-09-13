import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_SEEN_KEY = "double-a.onboarding.feature-steppers.seen";

/** True after the first-install feature steppers have been finished (or skipped). */
export async function hasSeenFeatureOnboarding(): Promise<boolean> {
  const value = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
  return value === "1";
}

export async function markFeatureOnboardingSeen(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1");
}

const BUSINESS_TYPE_STEP_SEEN_KEY = "double-a.onboarding.business-type-step.seen";

/**
 * True once this device has shown setup's "One Last Thing" business-type
 * survey step (picked or skipped) — a per-device, show-once prompt, distinct
 * from the answer itself (saved server-side on the company via
 * updateCompanyBusinessType). Without this, every admin sign-in on this
 * device would see the prompt again.
 */
export async function hasSeenBusinessTypeStep(): Promise<boolean> {
  const value = await AsyncStorage.getItem(BUSINESS_TYPE_STEP_SEEN_KEY);
  return value === "1";
}

export async function markBusinessTypeStepSeen(): Promise<void> {
  await AsyncStorage.setItem(BUSINESS_TYPE_STEP_SEEN_KEY, "1");
}
