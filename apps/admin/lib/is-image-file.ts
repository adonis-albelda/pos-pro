/**
 * `accept="image/*"` on a file input is a picker hint, not a block — drag-
 * and-drop and "All files" bypass it. The backend rejects a non-image with
 * its own `image` validation rule regardless, but callers should reject
 * before ever uploading, not just find out on the network round-trip.
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export const NOT_AN_IMAGE_MESSAGE = "That file isn't an image. Choose a photo instead.";
