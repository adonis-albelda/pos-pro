"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import {
  assessDocumentScan,
  rgbaBrightness,
  rgbaMotion,
  rgbaSharpness,
  scanQualityMessage,
  type ScanQuality,
} from "@double-a/shared-types";

const ANALYSIS_MS = 280;

function documentRect(videoWidth: number, videoHeight: number) {
  const w = Math.round(videoWidth * 0.86);
  const h = Math.round(videoHeight * 0.62);
  return {
    x: Math.round((videoWidth - w) / 2),
    y: Math.round((videoHeight - h) / 2),
    w,
    h,
  };
}

function frameBorderClass(quality: ScanQuality): string {
  if (quality === "ready") return "border-success shadow-[0_0_0_4px_rgba(63,163,77,0.35)]";
  if (quality === "hold_steady" || quality === "blurry") {
    return "border-warning shadow-[0_0_0_4px_rgba(217,164,65,0.25)]";
  }
  if (quality === "too_dark" || quality === "too_bright") {
    return "border-danger/80 shadow-[0_0_0_4px_rgba(193,68,60,0.2)]";
  }
  return "border-white/90 shadow-[0_0_0_4px_rgba(255,255,255,0.15)]";
}

function statusToneClass(quality: ScanQuality): string {
  if (quality === "ready") return "bg-success/90 text-white";
  if (quality === "hold_steady" || quality === "blurry") return "bg-warning/95 text-[#8a6516]";
  if (quality === "too_dark" || quality === "too_bright") return "bg-danger/90 text-white";
  return "bg-ink/75 text-white";
}

/**
 * Full-screen rear camera with document frame and live quality hints —
 * similar to phone OEM text-scan mode (align, light, blur, steady, ready).
 */
export function DocumentScanCamera({
  open,
  onCaptured,
  onCancel,
}: {
  open: boolean;
  onCaptured: (file: File) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const motionRef = useRef<Uint8ClampedArray | null>(null);
  const steadyRef = useRef(0);
  const analysingRef = useRef(false);

  const [mounted, setMounted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<ScanQuality>("align");
  const [frameStyle, setFrameStyle] = useState<{ top: string; left: string; width: string; height: string } | null>(
    null,
  );

  useEffect(() => setMounted(true), []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      motionRef.current = null;
      steadyRef.current = 0;
      setQuality("align");
      setError(null);
      return;
    }

    let cancelled = false;
    setStarting(true);
    setError(null);

    void navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        return video.play();
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not open the camera. Check browser permissions.",
        );
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, stopStream]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = sampleCanvasRef.current;
      if (!video || !canvas || analysingRef.current || video.readyState < 2) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      const rect = documentRect(vw, vh);
      const container = video.parentElement;
      if (container) {
        const displayW = container.clientWidth;
        const displayH = container.clientHeight;
        const scale = Math.max(displayW / vw, displayH / vh);
        const renderedW = vw * scale;
        const renderedH = vh * scale;
        const offsetX = (displayW - renderedW) / 2;
        const offsetY = (displayH - renderedH) / 2;
        setFrameStyle({
          left: `${offsetX + rect.x * scale}px`,
          top: `${offsetY + rect.y * scale}px`,
          width: `${rect.w * scale}px`,
          height: `${rect.h * scale}px`,
        });
      }

      analysingRef.current = true;
      try {
        canvas.width = rect.w;
        canvas.height = rect.h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        const { data } = ctx.getImageData(0, 0, rect.w, rect.h);

        const metrics = {
          brightness: rgbaBrightness(data),
          sharpness: rgbaSharpness(data, rect.w, rect.h),
          motion: rgbaMotion(data, motionRef.current),
        };
        motionRef.current = data.slice();

        const blocking = assessDocumentScan(metrics, 0);
        if (blocking !== "align") {
          steadyRef.current = 0;
          setQuality(blocking);
        } else {
          steadyRef.current += 1;
          setQuality(assessDocumentScan(metrics, steadyRef.current));
        }
      } finally {
        analysingRef.current = false;
      }
    }, ANALYSIS_MS);

    return () => window.clearInterval(timer);
  }, [open]);

  async function capture() {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || capturing) return;

    setCapturing(true);
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) throw new Error("Camera is not ready yet.");

      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(vw, vh));
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not capture the photo.");

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((next) => resolve(next), "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Could not save the photo.");

      stopStream();
      onCaptured(new File([blob], "scan.jpg", { type: "image/jpeg" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not capture the photo.");
    } finally {
      setCapturing(false);
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-ink">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 size-full object-cover"
        />

        <div className="pointer-events-none absolute inset-0 bg-ink/35" />

        {frameStyle ? (
          <div
            className={`pointer-events-none absolute rounded-md border-2 transition-colors duration-200 ${frameBorderClass(quality)}`}
            style={frameStyle}
          >
            <span className="absolute -left-0.5 -top-0.5 size-5 border-l-[3px] border-t-[3px] border-current" />
            <span className="absolute -right-0.5 -top-0.5 size-5 border-r-[3px] border-t-[3px] border-current" />
            <span className="absolute -bottom-0.5 -left-0.5 size-5 border-b-[3px] border-l-[3px] border-current" />
            <span className="absolute -bottom-0.5 -right-0.5 size-5 border-b-[3px] border-r-[3px] border-current" />
            {quality === "ready" ? (
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-success/70" />
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onCancel}
          aria-label="Close camera"
          className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full bg-ink/50 text-white"
        >
          <X size={20} />
        </button>

        <div
          className={`absolute bottom-28 left-4 right-4 rounded-md px-4 py-2.5 text-center text-body font-medium transition-colors duration-200 ${statusToneClass(quality)}`}
        >
          {starting ? "Opening camera…" : scanQualityMessage(quality)}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-3 bg-ink px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {error ? <p className="text-center text-caption text-danger-ink">{error}</p> : null}
        <button
          type="button"
          onClick={() => void capture()}
          disabled={starting || capturing || Boolean(error)}
          aria-label="Capture photo"
          className={
            "relative flex size-[4.5rem] items-center justify-center rounded-full border-4 transition-all duration-200 " +
            (quality === "ready"
              ? "border-success bg-white shadow-[0_0_0_6px_rgba(63,163,77,0.45)]"
              : "border-white/50 bg-white/95 opacity-90")
          }
        >
          <Camera
            size={28}
            className={quality === "ready" ? "text-success" : "text-ink-muted"}
            strokeWidth={2}
          />
        </button>
        <p className="text-center text-caption text-white/70">
          {quality === "ready" ? "Capture when the frame is green" : "Adjust until the hint says ready"}
        </p>
      </div>

      <canvas ref={sampleCanvasRef} className="hidden" aria-hidden />
      <canvas ref={captureCanvasRef} className="hidden" aria-hidden />
    </div>,
    document.body,
  );
}

export function canUseDocumentScanCamera(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}
