/** Browser File or React Native upload part `{ uri, name, type }`. */
export type MultipartFile = File | { uri: string; name: string; type: string };

function isBrowserFile(value: MultipartFile): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function isReactNativeUriPart(
  value: MultipartFile,
): value is { uri: string; name: string; type: string } {
  return (
    !isBrowserFile(value) &&
    typeof value === "object" &&
    value !== null &&
    typeof value.uri === "string" &&
    value.uri.length > 0
  );
}

/**
 * Expo fetch (52+) only serializes string, Blob, and File parts.
 * RN `{ uri, name, type }` throws "Unsupported FormDataPart implementation".
 * With expo-blob on globalThis.Blob, fetch(uri).blob() skips RN base64 blob store.
 */
export async function resolveMultipartFile(file: MultipartFile): Promise<Blob> {
  if (isBrowserFile(file)) {
    return file;
  }

  if (!isReactNativeUriPart(file)) {
    throw new Error("Unsupported multipart file part.");
  }

  const response = await fetch(file.uri);
  if (!response.ok) {
    throw new Error(`Could not read photo (${response.status}).`);
  }

  return response.blob();
}

export async function appendMultipartFile(
  formData: FormData,
  field: string,
  file: MultipartFile,
): Promise<void> {
  if (isBrowserFile(file)) {
    formData.append(field, file);
    return;
  }

  if (!isReactNativeUriPart(file)) {
    throw new Error("Unsupported multipart file part.");
  }

  const blob = await resolveMultipartFile(file);
  formData.append(field, blob, file.name);
}

export function appendMultipartField(formData: FormData, field: string, value: string): void {
  formData.append(field, value);
}
