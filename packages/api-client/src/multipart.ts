/** Browser File or React Native upload part `{ uri, name, type }`. */
export type MultipartFile = File | { uri: string; name: string; type: string };

function isBrowserFile(value: MultipartFile): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

/** RN fetch only accepts uri objects via append — set() throws "Unsupported FormDataPart implementation". */
export function appendMultipartFile(formData: FormData, field: string, file: MultipartFile): void {
  if (isBrowserFile(file)) {
    formData.append(field, file);
    return;
  }
  formData.append(field, file as unknown as Blob);
}

export function appendMultipartField(formData: FormData, field: string, value: string): void {
  formData.append(field, value);
}
