"use client";

import { useRef, useState } from "react";
import { Crop, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** Where object-contain actually paints the photo inside the <img> box. */
function getRenderedImageMetrics(img: HTMLImageElement) {
  const { naturalWidth, naturalHeight, clientWidth, clientHeight } = img;
  if (!naturalWidth || !naturalHeight || !clientWidth || !clientHeight) {
    return { offsetX: 0, offsetY: 0, width: clientWidth, height: clientHeight, scale: 1 };
  }

  const naturalAspect = naturalWidth / naturalHeight;
  const elementAspect = clientWidth / clientHeight;

  let width: number;
  let height: number;
  let offsetX: number;
  let offsetY: number;

  if (naturalAspect > elementAspect) {
    width = clientWidth;
    height = clientWidth / naturalAspect;
    offsetX = 0;
    offsetY = (clientHeight - height) / 2;
  } else {
    height = clientHeight;
    width = clientHeight * naturalAspect;
    offsetX = (clientWidth - width) / 2;
    offsetY = 0;
  }

  return {
    offsetX,
    offsetY,
    width,
    height,
    scale: naturalWidth / width,
  };
}

/**
 * Draw one rectangle over the photo, then crop to it — not a full editor
 * (no resize handles, no rotate). A notebook photo just needs the table's
 * receipt or the phone's own chrome cut out before OCR sees it.
 */
export function CropPhoto({
  src,
  onCropped,
  onCancel,
}: {
  src: string;
  onCropped: (file: File) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const [rect, setRect] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pointerPos(event: React.PointerEvent): { x: number; y: number } {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const bounds = img.getBoundingClientRect();
    return {
      x: Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width),
      y: Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height),
    };
  }

  function onPointerDown(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPos(event);
    dragStart.current = point;
    setDragging(true);
    setRect({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!dragging || !dragStart.current) return;
    setRect(normalizeRect(dragStart.current, pointerPos(event)));
  }

  function onPointerUp() {
    setDragging(false);
    dragStart.current = null;
  }

  function resetSelection() {
    setRect(null);
    setError(null);
  }

  async function applyCrop() {
    const img = imgRef.current;
    if (!img || !rect || rect.width < 8 || rect.height < 8) {
      setError("Drag a box around the part of the photo to keep.");
      return;
    }

    setCropping(true);
    setError(null);
    try {
      const metrics = getRenderedImageMetrics(img);

      const selLeft = Math.max(rect.x, metrics.offsetX);
      const selTop = Math.max(rect.y, metrics.offsetY);
      const selRight = Math.min(rect.x + rect.width, metrics.offsetX + metrics.width);
      const selBottom = Math.min(rect.y + rect.height, metrics.offsetY + metrics.height);
      const selWidth = selRight - selLeft;
      const selHeight = selBottom - selTop;

      if (selWidth < 8 || selHeight < 8) {
        setError("Drag a box over the photo itself, not the empty margins.");
        return;
      }

      const sourceX = (selLeft - metrics.offsetX) * metrics.scale;
      const sourceY = (selTop - metrics.offsetY) * metrics.scale;
      const sourceWidth = selWidth * metrics.scale;
      const sourceHeight = selHeight * metrics.scale;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sourceWidth);
      canvas.height = Math.round(sourceHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available.");

      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((next) => resolve(next), "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("Could not crop the photo.");

      onCropped(new File([blob], "cropped.jpg", { type: "image/jpeg" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not crop the photo.");
    } finally {
      setCropping(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative touch-none select-none overflow-hidden rounded-sm border border-border bg-paper"
        style={{ cursor: "crosshair" }}
      >
        <img
          ref={imgRef}
          src={src}
          alt="Notebook photo — drag to select the area to crop"
          className="block max-h-96 w-full object-contain"
          draggable={false}
        />
        {rect ? (
          <div
            aria-hidden
            className="absolute border-2 border-primary bg-primary/15"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
        ) : null}
      </div>

      <p className="text-caption text-ink-muted">
        Drag a box around the part of the photo to keep, then crop. Skip this to read the
        whole photo as-is.
      </p>

      {error ? <p className="text-caption text-danger-ink">{error}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" icon={Crop} loading={cropping} disabled={!rect} onClick={applyCrop}>
          Crop and use this
        </Button>
        <Button
          type="button"
          variant="secondary"
          icon={RotateCcw}
          disabled={!rect || cropping}
          onClick={resetSelection}
        >
          Reset selection
        </Button>
        <Button type="button" variant="ghost" disabled={cropping} onClick={onCancel}>
          Use full photo
        </Button>
      </div>
    </div>
  );
}
