import { Platform } from "react-native";
import { Blob as ExpoBlob } from "expo-blob";

/**
 * Expo fetch checks globalThis.Blob === react-native's Blob and, if so, copies
 * response bytes through the native blob store (base64). Swap in expo-blob
 * before any fetch().blob() runs — multipart photo uploads included.
 */
if (Platform.OS !== "web") {
  globalThis.Blob = ExpoBlob as typeof Blob;
}
