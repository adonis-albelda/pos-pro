import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "double-a.device-id";
const DEVICE_LABEL_KEY = "double-a.device-label";
const COMPANY_ID_KEY = "double-a.company-id";
const LOCATION_ID_KEY = "double-a.location-id";
/** Enrolled account role: "admin" | "device". Drives location switcher visibility. */
const ENROLLED_ROLE_KEY = "double-a.enrolled-role";
/**
 * Active POS location for stock pull + sale stamp. Device terminals keep this
 * equal to LOCATION_ID_KEY. Admin tablets may switch among company branches.
 */
const ACTIVE_LOCATION_ID_KEY = "double-a.active-location-id";

export type EnrolledRole = "admin" | "device";

/**
 * A stable id for this terminal, minted once and kept in SecureStore. It rides
 * along on every sale so admin can tell which terminal rang it up — which is
 * how an oversell between two offline devices gets traced.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

export async function getDeviceLabel(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_LABEL_KEY);
}

export async function setDeviceLabel(label: string): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_LABEL_KEY, label);
}

export async function getEnrolledCompanyId(): Promise<string | null> {
  return SecureStore.getItemAsync(COMPANY_ID_KEY);
}

export async function setEnrolledCompanyId(companyId: string): Promise<void> {
  await SecureStore.setItemAsync(COMPANY_ID_KEY, companyId);
}

export async function clearEnrolledCompanyId(): Promise<void> {
  await SecureStore.deleteItemAsync(COMPANY_ID_KEY);
}

export async function getEnrolledLocationId(): Promise<string | null> {
  return SecureStore.getItemAsync(LOCATION_ID_KEY);
}

export async function setEnrolledLocationId(locationId: string): Promise<void> {
  await SecureStore.setItemAsync(LOCATION_ID_KEY, locationId);
  // First bind also seeds active scope when none chosen yet.
  const active = await SecureStore.getItemAsync(ACTIVE_LOCATION_ID_KEY);
  if (!active) {
    await SecureStore.setItemAsync(ACTIVE_LOCATION_ID_KEY, locationId);
  }
}

export async function clearEnrolledLocationId(): Promise<void> {
  await SecureStore.deleteItemAsync(LOCATION_ID_KEY);
  await SecureStore.deleteItemAsync(ACTIVE_LOCATION_ID_KEY);
}

export async function getEnrolledRole(): Promise<EnrolledRole | null> {
  const raw = await SecureStore.getItemAsync(ENROLLED_ROLE_KEY);
  return raw === "admin" || raw === "device" ? raw : null;
}

export async function setEnrolledRole(role: EnrolledRole): Promise<void> {
  await SecureStore.setItemAsync(ENROLLED_ROLE_KEY, role);
}

export async function clearEnrolledRole(): Promise<void> {
  await SecureStore.deleteItemAsync(ENROLLED_ROLE_KEY);
}

/** Location used for pull stock + new sales. Falls back to enrolled location. */
export async function getActiveLocationId(): Promise<string | null> {
  return (
    (await SecureStore.getItemAsync(ACTIVE_LOCATION_ID_KEY)) ??
    (await getEnrolledLocationId())
  );
}

export async function setActiveLocationId(locationId: string): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_LOCATION_ID_KEY, locationId);
}

export async function clearActiveLocationId(): Promise<void> {
  await SecureStore.deleteItemAsync(ACTIVE_LOCATION_ID_KEY);
}
