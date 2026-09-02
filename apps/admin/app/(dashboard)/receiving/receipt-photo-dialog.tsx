"use client";

import { Dialog } from "@/components/overlay";

export function ReceiptPhotoDialog({
  open,
  onClose,
  photoUrl,
  title = "Receipt photo",
}: {
  open: boolean;
  onClose: () => void;
  photoUrl: string | null;
  title?: string;
}) {
  if (!photoUrl) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      className="max-h-[92vh] w-full sm:max-w-[min(92vw,1100px)]"
    >
      <div className="flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt="Delivery receipt"
          className="max-h-[min(78vh,900px)] w-full rounded-md object-contain"
        />
      </div>
    </Dialog>
  );
}
