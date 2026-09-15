import { Alert, AppState, Linking, PermissionsAndroid, Platform } from "react-native";
import type { Permission } from "react-native";

/**
 * Ask Android for the Bluetooth permissions the PT-210 scan/connect needs.
 * If the cashier previously tapped "Don't ask again", opens system Settings
 * and re-checks when they return — so a grant in Settings is picked up
 * without a second deny loop.
 *
 * API 31+ needs BLUETOOTH_SCAN + BLUETOOTH_CONNECT at runtime.
 * Older APIs need fine location to discover Classic devices.
 */
export async function ensureBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  const permissions = runtimeBluetoothPermissions();
  if (permissions.length === 0) return true;

  if (await allGranted(permissions)) return true;

  const proceed = await confirmPrompt();
  if (!proceed) return false;

  const result = await PermissionsAndroid.requestMultiple(permissions);

  if (permissions.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED)) {
    return true;
  }

  // Already granted in Settings between check and request (or OEM quirk).
  if (await allGranted(permissions)) return true;

  const blocked = permissions.some(
    (permission) => result[permission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
  );

  if (!blocked) {
    Alert.alert(
      "Bluetooth needed",
      "Allow Bluetooth so this terminal can find and print to the PT-210.",
    );
    return false;
  }

  const opened = await offerSettings();
  if (!opened) return false;

  return allGranted(permissions);
}

function runtimeBluetoothPermissions(): Permission[] {
  const api = typeof Platform.Version === "number" ? Platform.Version : 0;

  if (api >= 31) {
    return [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ].filter((permission): permission is Permission => Boolean(permission));
  }

  // Discovery on Android 11 and below rides on location permission.
  return [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION].filter(
    (permission): permission is Permission => Boolean(permission),
  );
}

async function allGranted(permissions: Permission[]): Promise<boolean> {
  const checks = await Promise.all(
    permissions.map((permission) => PermissionsAndroid.check(permission)),
  );
  return checks.every(Boolean);
}

function confirmPrompt(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Allow Bluetooth?",
      "POSPro One needs Bluetooth to find and print receipts on the PT-210 thermal printer.",
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** true if cashier opened Settings (and we waited for return). */
function offerSettings(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Bluetooth blocked",
      "Permission was denied earlier. Open Settings and allow Bluetooth (and nearby devices) for POSPro One.",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Open Settings",
          onPress: () => {
            void (async () => {
              const returned = waitForReturnFromBackground();
              await Linking.openSettings();
              await returned;
              resolve(true);
            })();
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Linking.openSettings resolves as soon as Settings opens — not when the
 * cashier comes back. Wait for background → active so a grant is visible
 * to PermissionsAndroid.check.
 */
function waitForReturnFromBackground(): Promise<void> {
  return new Promise((resolve) => {
    let sawBackground = AppState.currentState !== "active";

    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        sawBackground = true;
        return;
      }
      if (!sawBackground) return;
      sub.remove();
      resolve();
    });
  });
}
