"use client";

import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  Check,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, Field, Input } from "@/components/ui";

/** Match route page-enter: short enough to read as arrival, not decoration. */
const OVERLAY_MS = 180;

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type OverlayContextValue = { onClose: () => void };

const OverlayContext = createContext<OverlayContextValue | null>(null);

function useOverlayClose() {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error("OverlayCloseButton must sit inside Dialog or Sheet");
  return ctx.onClose;
}

export function OverlayCloseButton({ label = "Close" }: { label?: string }) {
  const onClose = useOverlayClose();
  return (
    <button
      type="button"
      onClick={onClose}
      title={label}
      aria-label={label}
      className={cx(
        "inline-flex size-9 cursor-pointer items-center justify-center rounded-sm text-ink-muted",
        "hover:bg-border/60 hover:text-ink",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
      )}
    >
      <X size={18} strokeWidth={2} />
    </button>
  );
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Keep overlay mounted through exit so close can animate, then unmount. */
function usePresence(open: boolean) {
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (reduced) {
        setEntered(true);
        return;
      }
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(id);
    }

    setEntered(false);
    if (reduced) {
      setMounted(false);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), OVERLAY_MS);
    return () => window.clearTimeout(t);
  }, [open, reduced]);

  return { mounted, entered };
}

/**
 * Escape the page-enter transform. `position: fixed` inside a transformed
 * ancestor is sized to that ancestor — here, the table — not the viewport.
 */
function OverlayPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.body);
  }, []);
  if (!target) return null;
  return createPortal(children, target);
}

const backdropClass =
  "absolute inset-0 bg-ink/40 transition-opacity duration-[180ms] ease-out motion-reduce:transition-none";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const stableClose = useCallback(() => onClose(), [onClose]);
  const { mounted, entered } = usePresence(open);

  useBodyScrollLock(mounted);
  useEscapeToClose(open, stableClose);

  useEffect(() => {
    if (!entered) return;
    panelRef.current?.focus();
  }, [entered]);

  if (!mounted) return null;

  return (
    <OverlayPortal>
    <OverlayContext.Provider value={{ onClose: stableClose }}>
      <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
        <button
          type="button"
          aria-label="Dismiss"
          className={cx(backdropClass, entered ? "opacity-100" : "opacity-0")}
          onClick={stableClose}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-state={entered ? "open" : "closed"}
          className={cx(
            "relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col",
            "rounded-lg border border-border bg-surface shadow-lg outline-none",
            "transition-[opacity,transform] duration-[180ms] ease-out motion-reduce:transition-none",
            entered
              ? "translate-y-0 scale-100 opacity-100"
              : "translate-y-1.5 scale-[0.98] opacity-0",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-heading-sm font-semibold">
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-caption text-ink-muted">{description}</p>
              ) : null}
            </div>
            <OverlayCloseButton />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </div>
      </div>
    </OverlayContext.Provider>
    </OverlayPortal>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  wide,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Wider panel for product forms and dense field grids. */
  wide?: boolean;
  /** Overrides wide's max-w-2xl for panels that need more room still (e.g. a document preview). */
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const stableClose = useCallback(() => onClose(), [onClose]);
  const { mounted, entered } = usePresence(open);

  useBodyScrollLock(mounted);
  useEscapeToClose(open, stableClose);

  useEffect(() => {
    if (!entered) return;
    panelRef.current?.focus();
  }, [entered]);

  if (!mounted) return null;

  return (
    <OverlayPortal>
    <OverlayContext.Provider value={{ onClose: stableClose }}>
      <div className="fixed inset-0 z-50 flex justify-end">
        <button
          type="button"
          aria-label="Dismiss"
          className={cx(backdropClass, entered ? "opacity-100" : "opacity-0")}
          onClick={stableClose}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-state={entered ? "open" : "closed"}
          className={cx(
            "relative z-10 flex h-dvh w-full flex-col border-l border-border bg-surface shadow-lg outline-none",
            "transition-transform duration-[180ms] ease-out motion-reduce:transition-none",
            entered ? "translate-x-0" : "translate-x-full",
            className ?? (wide ? "max-w-2xl" : "max-w-md"),
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-heading-sm font-semibold">
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-caption text-ink-muted">{description}</p>
              ) : null}
            </div>
            <OverlayCloseButton />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </div>
      </div>
    </OverlayContext.Provider>
    </OverlayPortal>
  );
}

function ProcessingDots() {
  return (
    <span className="inline-flex w-7 justify-start" aria-hidden>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="animate-bounce text-primary"
          style={{ animationDelay: `${index * 150}ms`, animationDuration: "1s" }}
        >
          .
        </span>
      ))}
    </span>
  );
}

/** Blocks the UI while an AI request is in flight — no dismiss. */
export function AiProcessingOverlay({
  open,
  message = "AI is processing",
}: {
  open: boolean;
  message?: string;
}) {
  const labelId = useId();
  const { mounted, entered } = usePresence(open);

  useBodyScrollLock(mounted);

  if (!mounted) return null;

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        role="presentation"
      >
        <div
          className={cx(backdropClass, "z-0", entered ? "opacity-100" : "opacity-0")}
          aria-hidden
        />
        <div
          role="status"
          aria-live="polite"
          aria-labelledby={labelId}
          data-state={entered ? "open" : "closed"}
          className={cx(
            "relative z-10 flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-surface px-8 py-10 shadow-lg",
            "transition-[opacity,transform] duration-[180ms] ease-out motion-reduce:transition-none",
            entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-1.5 scale-[0.98] opacity-0",
          )}
        >
          <div className="relative flex size-16 items-center justify-center">
            <Sparkles size={36} strokeWidth={1.75} className="text-primary" aria-hidden />
            <Loader2
              size={22}
              className="absolute -right-1 -bottom-1 animate-spin text-ink-muted"
              aria-hidden
            />
          </div>
          <div className="text-center">
            <p id={labelId} className="text-heading-sm font-semibold text-ink">
              {message}
              <ProcessingDots />
            </p>
            <p className="mt-1 text-caption text-ink-muted">This may take a moment.</p>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

/** Blocks the page while list data refetches after a filter change — no dismiss. */
export function FetchingDataOverlay({
  open,
  message = "Fetching data",
}: {
  open: boolean;
  message?: string;
}) {
  const labelId = useId();
  const { mounted, entered } = usePresence(open);

  useBodyScrollLock(mounted);

  if (!mounted) return null;

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        role="presentation"
      >
        <div
          className={cx(backdropClass, "z-0", entered ? "opacity-100" : "opacity-0")}
          aria-hidden
        />
        <div
          role="status"
          aria-live="polite"
          aria-labelledby={labelId}
          data-state={entered ? "open" : "closed"}
          className={cx(
            "relative z-10 flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-surface px-8 py-10 shadow-lg",
            "transition-[opacity,transform] duration-[180ms] ease-out motion-reduce:transition-none",
            entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-1.5 scale-[0.98] opacity-0",
          )}
        >
          <div className="relative flex size-20 items-center justify-center">
            <Image
              src="/logo.png"
              alt=""
              width={64}
              height={64}
              className="size-16 object-contain"
              priority
            />
            <Loader2
              size={22}
              className="absolute -right-1 -bottom-1 animate-spin text-primary"
              aria-hidden
            />
          </div>
          <div className="text-center">
            <p id={labelId} className="text-heading-sm font-semibold text-ink">
              {message}
              <ProcessingDots />
            </p>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

function resolveConfirmIcon(confirmLabel: string, confirmationText?: string): LucideIcon {
  if (confirmationText) return Trash2;

  const lower = confirmLabel.toLowerCase();
  if (lower.includes("void")) return Ban;
  if (lower.includes("test")) return FlaskConical;
  if (lower.includes("hide") || lower.includes("disable")) return EyeOff;
  if (lower.includes("show") || lower.includes("enable")) return Eye;

  return Check;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  confirmationText,
  confirmIcon,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  /** When set, the confirm button stays disabled until this text is typed exactly. */
  confirmationText?: string;
  confirmIcon?: LucideIcon;
  pending?: boolean;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const confirmed = confirmationText ? typed.trim() === confirmationText.trim() : true;
  const ConfirmIcon = confirmIcon ?? resolveConfirmIcon(confirmLabel, confirmationText);

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="space-y-4">
        {confirmationText ? (
          <Field
            label="Type to confirm"
            hint={`Enter "${confirmationText}" to continue.`}
          >
            <Input
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              placeholder={confirmationText}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" icon={X} onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            icon={ConfirmIcon}
            loading={pending}
            disabled={!confirmed}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
