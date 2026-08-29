"use client";

import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import type { Route } from "next";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleAlert,
  Dot,
  Loader2,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { formatMoney, PESO_SIGN } from "@double-a/shared-types";

/**
 * The exact message EnforceDemoReadOnly (Laravel) returns on every blocked
 * update, across every resource — every Server Action's catch block passes
 * an ApiError's `.message` through into FormState.error unprefixed for a
 * non-validation error, so this exact string always reaches an ErrorNote
 * wherever a demo account gets blocked. One check here covers every
 * resource's update form without touching each one individually.
 */
export const DEMO_RESTRICTED_MESSAGE = "This action is restricted for demo accounts.";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Button — one primary, one secondary, one accent reserved for sync-like acts */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "accent" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  secondary: "border border-border bg-surface text-ink hover:border-ink/30 hover:bg-paper",
  accent: "bg-accent text-ink hover:brightness-95",
  danger: "bg-danger text-white hover:brightness-95",
  ghost: "text-ink-muted hover:bg-border/50 hover:text-ink",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-10 px-3 text-caption sm:h-8",
  md: "h-11 px-4 text-body sm:h-10",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cx(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm font-medium transition-all",
    "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
    BUTTON_SIZES[size],
    BUTTON_STYLES[variant],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  loading,
  disabled,
  className,
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
}) {
  const iconSize = size === "sm" ? 14 : 16;

  return (
    <button
      {...props}
      disabled={disabled ?? loading}
      className={buttonClass(variant, size, className)}
    >
      {loading ? (
        <Loader2 size={iconSize} strokeWidth={2} className="animate-spin" />
      ) : Icon ? (
        <Icon size={iconSize} strokeWidth={2} />
      ) : null}
      {children}
    </button>
  );
}

/**
 * A download is a plain link, not a button: the browser fetches the file
 * itself, so there is nothing for React to navigate.
 */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon: Icon,
  className,
  children,
  ...props
}: ComponentProps<"a"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
}) {
  return (
    <a {...props} className={buttonClass(variant, size, className)}>
      {Icon ? <Icon size={size === "sm" ? 14 : 16} strokeWidth={2} /> : null}
      {children}
    </a>
  );
}

type IconActionTone = "neutral" | "primary" | "danger";

const ICON_ACTION_TONES: Record<IconActionTone, string> = {
  neutral: "text-ink-muted hover:bg-border/60 hover:text-ink",
  primary: "text-ink-muted hover:bg-primary/10 hover:text-primary",
  danger: "text-ink-muted hover:bg-danger/10 hover:text-danger",
};

function iconActionClass(tone: IconActionTone, className?: string): string {
  return cx(
    "inline-flex size-10 cursor-pointer items-center justify-center rounded-sm transition-colors sm:size-8",
    "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
    "disabled:pointer-events-none disabled:opacity-50",
    ICON_ACTION_TONES[tone],
    className,
  );
}

/** Square, icon-only action for table rows, where a labelled button would crowd. */
export function IconButton({
  icon: Icon,
  label,
  tone = "neutral",
  type = "button",
  className,
  disabled,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  icon: LucideIcon;
  label: string;
  tone?: IconActionTone;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={iconActionClass(
        tone,
        [className, disabled ? "pointer-events-none opacity-40" : null]
          .filter(Boolean)
          .join(" ") || undefined,
      )}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
}

/** The same row action, where the action is going somewhere rather than doing something. */
export function IconLink({
  icon: Icon,
  label,
  href,
  tone = "neutral",
  className,
}: {
  icon: LucideIcon;
  label: string;
  href: string;
  tone?: IconActionTone;
  className?: string;
}) {
  return (
    <Link
      href={href as Route}
      title={label}
      aria-label={label}
      className={iconActionClass(tone, className)}
    >
      <Icon size={16} strokeWidth={2} />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Page header — one shape for every screen, so titles never drift            */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h1 className="text-heading-md font-semibold sm:text-heading-lg">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-body text-ink-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? (
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end [&_a]:justify-center sm:[&_a]:w-auto [&_button]:w-full sm:[&_button]:w-auto [&_a]:w-full">
          {action}
        </div>
      ) : null}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Card — border and spacing do the separating, not stacked drop shadows      */
/* -------------------------------------------------------------------------- */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cx(
        "rounded-md border border-border bg-surface shadow-xs",
        className,
      )}
    />
  );
}

export function CardHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? (
          <Icon size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-muted" />
        ) : null}
        <div className="min-w-0">
          <h2 className="text-heading-sm font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-caption text-ink-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0 sm:self-start">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx("px-4 py-5 sm:px-6", className)} />;
}

/* -------------------------------------------------------------------------- */
/* Stat — the top row of any dashboard screen                                 */
/* -------------------------------------------------------------------------- */

type StatTone = "neutral" | "primary" | "success" | "warning" | "danger";

const STAT_ICON_STYLES: Record<StatTone, string> = {
  neutral: "bg-border/60 text-ink-muted",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/16 text-[#8a6516]",
  danger: "bg-danger/12 text-danger",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
}) {
  return (
    <Card className="flex items-start gap-3 px-4 py-4 sm:gap-4 sm:px-5 sm:py-5">
      <span
        className={cx(
          "flex size-10 shrink-0 items-center justify-center rounded-md",
          STAT_ICON_STYLES[tone],
        )}
      >
        <Icon size={20} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-caption font-medium tracking-wide text-ink-muted uppercase">
          {label}
        </p>
        <p
          className={cx(
            "num mt-1 text-heading-md font-semibold",
            tone === "danger" && "text-danger",
          )}
        >
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-caption text-ink-muted">{hint}</p> : null}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Status badge — paired icon and label, never colour alone                    */
/* -------------------------------------------------------------------------- */

type BadgeTone = "success" | "warning" | "danger" | "neutral";

const BADGE_STYLES: Record<BadgeTone, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/16 text-[#8a6516]",
  danger: "bg-danger/12 text-danger",
  neutral: "bg-border/60 text-ink-muted",
};

const BADGE_ICONS: Record<BadgeTone, LucideIcon> = {
  success: Check,
  warning: AlertTriangle,
  danger: X,
  neutral: Dot,
};

export function Badge({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  const Icon = icon ?? BADGE_ICONS[tone];

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-medium whitespace-nowrap",
        BADGE_STYLES[tone],
      )}
    >
      <Icon size={13} strokeWidth={2.5} aria-hidden />
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Numbers are first-class content: tabular figures everywhere                 */
/* -------------------------------------------------------------------------- */

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cx("num", className)}>{formatMoney(value)}</span>;
}

export function Num({ value, className }: { value: number; className?: string }) {
  return <span className={cx("num", className)}>{value}</span>;
}

/* -------------------------------------------------------------------------- */
/* Table primitives                                                           */
/* -------------------------------------------------------------------------- */

export function Table({
  className,
  fetching = false,
  fetchingMessage = "Fetching data that matches your keyword…",
  children,
  ...props
}: Omit<ComponentProps<"table">, "children"> & {
  fetching?: boolean;
  fetchingMessage?: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative min-h-[10rem]">
      {fetching ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-surface/75 px-4 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <Loader2 size={28} strokeWidth={2} className="animate-spin text-primary" aria-hidden />
            <p className="text-body text-ink-muted">{fetchingMessage}</p>
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        <table
          {...props}
          className={cx(
            "w-full text-body",
            // Rows highlight on hover so the eye can hold a line across a wide table.
            "[&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-paper",
            "[&_tbody_tr:last-child_td]:border-b-0",
            className,
          )}
        >
          {children}
        </table>
      </div>
    </div>
  );
}

export function Th({ className, numeric, ...props }: ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      {...props}
      className={cx(
        "border-b border-border bg-paper/60 px-3 py-2.5 text-caption font-semibold tracking-wide text-ink-muted uppercase sm:px-6 sm:py-3",
        numeric ? "text-right" : "text-left",
        className,
      )}
    />
  );
}

export function Td({ className, numeric, ...props }: ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      {...props}
      className={cx(
        "border-b border-border px-3 py-2.5 align-middle sm:px-6 sm:py-3",
        numeric && "num text-right",
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  /** Shows a "Required"/"Optional" tag next to the label — pass the same value the field's own `required` prop has. */
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-caption font-medium text-ink-muted">{label}</span>
        {required === undefined ? null : (
          <span
            className={cx(
              "text-[11px] font-medium tracking-wide uppercase",
              required ? "text-danger/70" : "text-ink-muted/60",
            )}
          >
            {required ? "Required" : "Optional"}
          </span>
        )}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-caption text-ink-muted">{hint}</span> : null}
    </label>
  );
}

const CONTROL_STYLES =
  "w-full rounded-sm border border-border bg-surface px-3 text-body outline-none transition-colors placeholder:text-ink-muted/70 hover:border-ink/20 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

export function Input({
  className,
  icon: Icon,
  ...props
}: ComponentProps<"input"> & { icon?: LucideIcon }) {
  const input = (
    <input
      {...props}
      className={cx(CONTROL_STYLES, "h-11 sm:h-10", Icon && "pl-9", className)}
    />
  );

  if (!Icon) return input;

  return (
    <span className="relative block">
      <Icon
        size={16}
        strokeWidth={2}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
      />
      {input}
    </span>
  );
}

export function MoneyInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <span className="relative block">
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-ink-muted"
      >
        {PESO_SIGN}
      </span>
      <input
        {...props}
        className={cx(CONTROL_STYLES, "num h-11 pl-8 sm:h-10", className)}
      />
    </span>
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cx(CONTROL_STYLES, "h-11 cursor-pointer sm:h-10", className)}
    />
  );
}

export interface ComboboxOption {
  value: string;
  label: string;
  /** Shown muted, right-aligned next to the label — e.g. a SKU or category path. */
  sublabel?: string;
}

/**
 * A searchable drop-in for `<Select>` where the option list is long/dynamic
 * enough that scrolling a native dropdown is worse than typing to filter —
 * product, supplier, category pickers. Short fixed enums (status, unit,
 * role) stay plain `Select`; search adds nothing there.
 *
 * Owns its own selection state so it works both controlled (`value` +
 * `onChange`, e.g. create-po-form.tsx's plain useState fields) and as a
 * native form field (`name` + `defaultValue`, read back via FormData in a
 * Server Action) — a hidden input mirrors the selection whenever `name` is
 * given, since a custom listbox can't participate in native form
 * submission the way a real `<select>` does.
 */
export function Combobox({
  name,
  value,
  defaultValue,
  onChange,
  options,
  placeholder = "Search…",
  emptyLabel = "No matches.",
  disabled,
  required,
  className,
}: {
  name?: string;
  /** Controlled selection — when given, this is authoritative over defaultValue. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  const [internal, setInternal] = useState(value ?? defaultValue ?? "");
  const selected = value ?? internal;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The dropdown panel is portaled to document.body (see below), so it's no
  // longer a DOM descendant of rootRef — needs its own ref or the
  // click-outside handler fires on mousedown, closing (and unmounting) the
  // panel before the option's click ever reaches it, so nothing gets
  // selected.
  const panelRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((option) => option.value === selected) ?? null;

  useEffect(() => {
    if (value !== undefined) setInternal(value);
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // A plain `absolute` panel only escapes ancestors within its own stacking
  // context — any ancestor with overflow-hidden/auto (a scrollable table
  // wrapper, a Card, a Sheet) still clips it no matter the z-index. Portal
  // to document.body and position by the input's real screen coordinates
  // instead, same fix OverlayPortal uses for Dialog/Sheet.
  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        (option.sublabel ?? "").toLowerCase().includes(needle),
    );
  }, [options, query]);

  function commit(nextValue: string) {
    setInternal(nextValue);
    onChange?.(nextValue);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlighted((index) => Math.min(index + 1, filtered.length - 1));
      return;
    }
    // Everything below only makes sense once the list is actually open —
    // otherwise a bare Enter (e.g. submitting the surrounding form) would
    // silently commit whatever option index 0 happens to be.
    if (!open) return;

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[highlighted];
      if (option) commit(option.value);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {name ? <input type="hidden" name={name} value={selected} required={required} /> : null}
      <div className="relative">
        {open ? (
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
          />
        ) : null}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={undefined}
          disabled={disabled}
          value={open ? query : (selectedOption?.label ?? "")}
          placeholder={selectedOption ? undefined : placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setHighlighted(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cx(
            CONTROL_STYLES,
            "h-11 cursor-text pr-9 sm:h-10",
            open ? "pl-9" : undefined,
            className,
          )}
        />
        <ChevronDown
          size={16}
          className={cx(
            "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </div>

      {open && panelRect ? (
        <ComboboxPortal>
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
            }}
            className="z-50 max-h-64 overflow-y-auto rounded-sm border border-border bg-surface p-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-caption text-ink-muted">{emptyLabel}</p>
            ) : (
              filtered.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => commit(option.value)}
                  className={cx(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-body",
                    index === highlighted ? "bg-primary-tint text-ink" : "text-ink hover:bg-paper",
                    option.value === selected && "font-medium",
                  )}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {option.sublabel ? (
                    <span className="shrink-0 text-caption text-ink-muted">{option.sublabel}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </ComboboxPortal>
      ) : null}
    </div>
  );
}

/** Escapes any ancestor's overflow-hidden/auto clipping — same reason Dialog/Sheet portal to document.body. */
function ComboboxPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.body), []);
  if (!target) return null;
  return createPortal(children, target);
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cx(CONTROL_STYLES, "num min-h-28 resize-y py-2 leading-6", className)}
    />
  );
}

export const FileInput = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  function FileInput({ className, ...props }, ref) {
    return (
      <input
        {...props}
        ref={ref}
        type="file"
        className={cx(
          CONTROL_STYLES,
          "cursor-pointer py-2",
          "file:mr-3 file:cursor-pointer file:rounded-sm file:border-0 file:bg-primary/10",
          "file:px-3 file:py-1 file:text-body file:font-medium file:text-primary",
          className,
        )}
      />
    );
  },
);

/* -------------------------------------------------------------------------- */
/* Empty state — always says what to do next                                  */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  instruction,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  instruction: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-12 text-center sm:px-6 sm:py-14">
      {Icon ? (
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-dashed border-border text-ink-muted">
          <Icon size={22} strokeWidth={1.75} />
        </span>
      ) : null}
      <p className="text-body-lg font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-body text-ink-muted">{instruction}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (children === DEMO_RESTRICTED_MESSAGE) {
      toast.error(DEMO_RESTRICTED_MESSAGE);
    }
  }, [children]);

  return (
    <p className="flex items-start gap-2 rounded-sm border border-danger/40 bg-danger/8 px-3 py-2 text-body text-danger">
      <CircleAlert size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-sm border border-success/40 bg-success/8 px-3 py-2 text-body text-success">
      <Check size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
