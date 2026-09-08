"use client";

import { ImagePlus, MoveLeft, MoveRight, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isImageFile, NOT_AN_IMAGE_MESSAGE } from "@/lib/is-image-file";
import {
  useDeleteVariantPhoto,
  useReorderVariantPhotos,
  useUploadVariantPhoto,
  useVariantPhotos,
} from "@/lib/query/attributes";

function AddPhotosTile({ onPick }: { onPick: (files: FileList | null) => void }) {
  return (
    <label className="flex size-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-ink-muted transition-colors hover:border-primary hover:text-primary">
      <ImagePlus size={18} strokeWidth={2} />
      <span className="text-[11px]">Add photos</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          onPick(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function pickImageFiles(list: FileList | null): File[] {
  if (!list) return [];
  const picked: File[] = [];
  for (const file of Array.from(list)) {
    if (!isImageFile(file)) {
      toast.error(NOT_AN_IMAGE_MESSAGE);
      continue;
    }
    picked.push(file);
  }
  return picked;
}

/**
 * Live gallery for a variant that already exists — every action (upload,
 * delete, reorder, promote a cover) hits the server immediately. Move-left/
 * move-right buttons instead of drag-and-drop — keeps this dependency-free
 * for what's already a large feature surface.
 */
export function VariantPhotoGallery({ variantId }: { variantId: string }) {
  const photosQuery = useVariantPhotos(variantId);
  const upload = useUploadVariantPhoto(variantId);
  const remove = useDeleteVariantPhoto(variantId);
  const reorder = useReorderVariantPhotos(variantId);
  const photos = photosQuery.data ?? [];

  function onPick(list: FileList | null) {
    for (const file of pickImageFiles(list)) {
      upload.mutate(file, {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Could not upload this photo."),
      });
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...photos];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= next.length) return;
    [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
    reorder.mutate({ photoIds: next.map((photo) => photo.id) });
  }

  return (
    <div className="flex flex-wrap gap-3">
      {photos.map((photo, index) => (
        <div
          key={photo.id}
          className="group relative size-24 shrink-0 overflow-hidden rounded-md border border-border bg-paper"
        >
          {/* Plain img: the URL is an arbitrary S3/R2 host, same reasoning as the product photo. */}
          <img src={photo.url} alt="" className="size-full object-cover" />
          {photo.isCover ? (
            <span className="absolute left-1 top-1 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-medium text-white">
              Cover
            </span>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              aria-label="Move earlier"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              className="text-white disabled:opacity-30"
            >
              <MoveLeft size={13} strokeWidth={2} />
            </button>
            {!photo.isCover ? (
              <button
                type="button"
                aria-label="Make cover photo"
                onClick={() => reorder.mutate({ photoIds: photos.map((p) => p.id), setCoverId: photo.id })}
                className="text-white"
              >
                <Star size={13} strokeWidth={2} />
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() =>
                remove.mutate(photo.id, {
                  onError: (error) =>
                    toast.error(error instanceof Error ? error.message : "Could not remove this photo."),
                })
              }
              className="text-white"
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="Move later"
              disabled={index === photos.length - 1}
              onClick={() => move(index, 1)}
              className="text-white disabled:opacity-30"
            >
              <MoveRight size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      ))}
      <AddPhotosTile onPick={onPick} />
    </div>
  );
}

/**
 * Create flow only — no variant id exists yet, so picked files are just
 * held locally and ride `createFullProduct` as multipart `photos[]` (product)
 * or `variant_photos[N][]` (per generated variant).
 */
export function PendingPhotoGallery({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  function onPick(list: FileList | null) {
    const picked = pickImageFiles(list);
    if (picked.length) onChange([...files, ...picked]);
  }

  function remove(index: number) {
    onChange(files.filter((_, entryIndex) => entryIndex !== index));
  }

  return (
    <div className="flex flex-wrap gap-3">
      {files.map((file, index) => (
        <div
          key={`${file.name}-${index}`}
          className="group relative size-24 shrink-0 overflow-hidden rounded-md border border-border bg-paper"
        >
          <img src={URL.createObjectURL(file)} alt="" className="size-full object-cover" />
          {index === 0 ? (
            <span className="absolute left-1 top-1 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-medium text-white">
              Cover
            </span>
          ) : null}
          <button
            type="button"
            aria-label="Remove photo"
            onClick={() => remove(index)}
            className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/60 py-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        </div>
      ))}
      <AddPhotosTile onPick={onPick} />
    </div>
  );
}
