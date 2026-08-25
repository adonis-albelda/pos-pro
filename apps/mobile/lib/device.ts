import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "double-a.device-id";
const DEVICE_LABEL_KEY = "double-a.device-label";
const COMPANY_ID_KEY = "double-a.company-id";
const LOCATION_ID_KEY = "double-a.location-id";

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
}

export async function clearEnrolledLocationId(): Promise<void> {
  await SecureStore.deleteItemAsync(LOCATION_ID_KEY);
}
