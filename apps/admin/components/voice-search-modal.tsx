"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/overlay";

type Phase = "listening" | "error";

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True only in browsers that implement the Web Speech API (Chrome/Edge). */
export function voiceSearchSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

/**
 * Web Speech API equivalent of the mobile POS's voice search
 * (apps/mobile/components/voice-search-modal.tsx). No permission-request
 * step to mirror — calling `.start()` is what triggers the browser's own mic
 * prompt, and a denial surfaces through `onerror` instead.
 */
export function VoiceSearchModal({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("listening");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finishedRef = useRef(false);
  // onend's callback is bound once per start() call and would otherwise close
  // over a stale (empty) `transcript` from that render — read the ref instead.
  const transcriptRef = useRef("");

  function finish(text: string) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const trimmed = text.trim();
    if (trimmed) onResult(trimmed);
    onClose();
  }

  function start() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setPhase("error");
      setErrorMessage("Voice search isn't supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      const results = Array.from(event.results);
      const last = results.at(-1);
      const heard = last?.[0]?.transcript ?? "";
      transcriptRef.current = heard;
      setTranscript(heard);
      if (last?.isFinal) finish(heard);
    };

    recognition.onerror = (event) => {
      finishedRef.current = true;
      setPhase("error");
      setErrorMessage(
        event.error === "not-allowed" || event.error === "permission-denied"
          ? "Microphone access is blocked for this site. Allow it in your browser settings."
          : event.error === "no-speech"
            ? "Didn't catch that. Try again, closer to the mic."
            : "Voice search could not start. Type the search instead.",
      );
    };

    recognition.onend = () => {
      if (!finishedRef.current && transcriptRef.current.trim()) finish(transcriptRef.current);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  useEffect(() => {
    if (!open) return;
    finishedRef.current = false;
    transcriptRef.current = "";
    setPhase("listening");
    setTranscript("");
    setErrorMessage(null);
    start();

    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start() closes over transcript/finish; only `open` should retrigger this
  }, [open]);

  function retry() {
    finishedRef.current = false;
    transcriptRef.current = "";
    setTranscript("");
    setErrorMessage(null);
    setPhase("listening");
    start();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Voice search" description="Say a product name, e.g. “PVC pipe”.">
      {phase === "error" ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-danger/10">
            <TriangleAlert size={30} className="text-danger" strokeWidth={2} />
          </div>
          <p className="text-body text-ink-muted">{errorMessage}</p>
          <div className="flex w-full gap-2">
            <Button type="button" onClick={retry} className="flex-1">
              Try again
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="relative flex size-20 items-center justify-center">
            <span className="absolute inline-flex size-20 animate-ping rounded-full bg-primary/30" />
            <span className="relative flex size-16 items-center justify-center rounded-full bg-primary">
              <Mic size={28} className="text-on-primary" strokeWidth={2} />
            </span>
          </div>
          <p className="min-h-6 text-body-lg text-ink">
            {transcript || <span className="text-ink-muted">Listening…</span>}
          </p>
          <Button type="button" variant="secondary" icon={MicOff} onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    </Dialog>
  );
}
