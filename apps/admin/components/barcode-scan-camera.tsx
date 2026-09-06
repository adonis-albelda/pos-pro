"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const DETECT_INTERVAL_MS = 300;

const BARCODE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "itf",
  "qr_code",
];

/** Chrome/Edge/Android Chrome only — no Safari or Firefox support. Callers feature-detect and hide the scan button entirely rather than erroring. */
export function canUseBarcodeScanner(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

/**
 * Full-screen rear camera, live-polls for a barcode via the native
 * BarcodeDetector API and returns the first decoded value. Structurally
 * mirrors DocumentScanCamera's getUserMedia/portal/lifecycle shell, minus
 * the document-quality heuristics — a barcode read is binary (found or not),
 * no frame-quality scoring needed.
 */
export function BarcodeScanCamera({
  open,
  onDetected,
  onCancel,
}: {
  open: boolean;
  onDetected: (value: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectingRef = useRef(false);

  const [mounted, setMounted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      setError(null);
      return;
    }

    let cancelled = false;
    setStarting(true);
    setError(null);

    void navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" } },
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
    if (!open || !canUseBarcodeScanner()) return;

    const detector = new BarcodeDetector({ formats: BARCODE_FORMATS });
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || detectingRef.current || video.readyState < 2) return;

      detectingRef.current = true;
      void detector
        .detect(video)
        .then((results) => {
          const value = results[0]?.rawValue;
          if (value) {
            stopStream();
            onDetected(value);
          }
        })
        .catch(() => {
          // A transient decode failure on one frame isn't worth surfacing —
          // the next tick just tries again.
        })
        .finally(() => {
          detectingRef.current = false;
        });
    }, DETECT_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [open, onDetected, stopStream]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-ink">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />

        <div className="pointer-events-none absolute inset-0 bg-ink/25" />

        <div className="pointer-events-none absolute inset-x-10 top-1/2 h-28 -translate-y-1/2 rounded-md border-2 border-white/90 shadow-[0_0_0_4px_rgba(255,255,255,0.15)]" />

        <button
          type="button"
          onClick={onCancel}
          aria-label="Close camera"
          className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full bg-ink/50 text-white"
        >
          <X size={20} />
        </button>

        <div className="absolute bottom-10 left-4 right-4 rounded-md bg-ink/75 px-4 py-2.5 text-center text-body font-medium text-white">
          {starting ? "Opening camera…" : error ? error : "Point the camera at a barcode"}
        </div>
      </div>
    </div>,
    document.body,
  );
}
