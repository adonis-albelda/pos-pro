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
