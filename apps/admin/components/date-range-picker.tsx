"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
} from "lucide-react";
import { Button } from "@/components/ui";
import {
  dayOfMonth,
  describeDayWindow,
  firstOfMonth,
  formatStoreDay,
  isSameMonth,
  monthGrid,
  monthLabel,
  shiftDays,
  shiftMonths,
  startOfWeek,
  storeToday,
  WEEKDAY_LABELS,
} from "@/lib/date-range";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export interface DayWindowValue {
  fromDay: string | null;
  toDay: string | null;
}

interface Preset {
  label: string;
  window: (today: string) => DayWindowValue;
}

/**
 * Both ends of the range come from one calendar: the first click sets the
 * start, the second sets the end. Two date inputs let someone submit a
 * backwards range and read an empty table as "no movements".
 */
const PRESETS: Preset[] = [
  { label: "Today", window: (today) => ({ fromDay: today, toDay: today }) },
  {
    label: "Yesterday",
    window: (today) => ({ fromDay: shiftDays(today, -1), toDay: shiftDays(today, -1) }),
  },
  {
    label: "This week",
    window: (today) => ({ fromDay: startOfWeek(today), toDay: today }),
  },
  {
    label: "Last 7 days",
    window: (today) => ({ fromDay: shiftDays(today, -6), toDay: today }),
  },
  {
    label: "Last 30 days",
    window: (today) => ({ fromDay: shiftDays(today, -29), toDay: today }),
  },
  {
    label: "This month",
    window: (today) => ({ fromDay: firstOfMonth(today), toDay: today }),
  },
  {
    label: "Last month",
    window: (today) => {
      const lastDay = shiftDays(firstOfMonth(today), -1);
      return { fromDay: firstOfMonth(lastDay), toDay: lastDay };
    },
  },
  { label: "All time", window: () => ({ fromDay: null, toDay: null }) },
];

export function DateRangePicker({
  fromDay,
  toDay,
  onApply,
  /** Nothing recorded in the future, so later days are not offered. */
  maxDay = storeToday(),
  className,
}: {
  fromDay: string | null;
  toDay: string | null;
  onApply: (next: DayWindowValue) => void;
  maxDay?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(fromDay);
  const [draftTo, setDraftTo] = useState(toDay);
  const [hovered, setHovered] = useState<string | null>(null);
  const [month, setMonth] = useState(() => firstOfMonth(fromDay ?? toDay ?? maxDay));
  const [alignEnd, setAlignEnd] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Reopening starts from what the URL currently says, not from an abandoned draft.
  useEffect(() => {
    if (!open) return;
    setDraftFrom(fromDay);
    setDraftTo(toDay);
    setHovered(null);
    setMonth(firstOfMonth(fromDay ?? toDay ?? maxDay));
  }, [open, fromDay, toDay, maxDay]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !rootRef.current) return;

    const rect = rootRef.current.getBoundingClientRect();
    const menuWidth = 312; // w-[19.5rem]
    const viewportPadding = 16;
    setAlignEnd(rect.left + menuWidth > window.innerWidth - viewportPadding);
  }, [open]);

  const today = storeToday();
  const picking = draftFrom !== null && draftTo === null;
  const previewTo = picking && hovered ? hovered : draftTo;
  const start = draftFrom && previewTo && previewTo < draftFrom ? previewTo : draftFrom;
  const end = draftFrom && previewTo && previewTo < draftFrom ? draftFrom : previewTo;

  function pick(day: string) {
    if (!picking) {
      setDraftFrom(day);
      setDraftTo(null);
      return;
    }
    if (draftFrom && day < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(day);
      return;
    }
    setDraftTo(day);
  }

  function apply(next: DayWindowValue) {
    setOpen(false);
    onApply(next);
  }

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cx(
          "flex h-11 w-full cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface px-3 text-body sm:h-10",
          "transition-colors hover:border-ink/20 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:outline-none",
          open && "border-primary ring-2 ring-primary/20",
        )}
      >
        <CalendarRange size={16} strokeWidth={2} className="shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate text-left">
          {describeDayWindow(fromDay, toDay)}
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Pick a date range"
          className={cx(
            "absolute top-[calc(100%+6px)] z-40 w-[min(19.5rem,calc(100vw-2rem))] rounded-md border border-border bg-surface p-3 shadow-lg",
            alignEnd ? "right-0" : "left-0",
          )}
        >
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => {
              const next = preset.window(today);
              const active = next.fromDay === draftFrom && next.toDay === draftTo;

              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setDraftFrom(next.fromDay);
                    setDraftTo(next.toDay);
                    setMonth(firstOfMonth(next.fromDay ?? today));
                  }}
                  className={cx(
                    "cursor-pointer rounded-sm px-2 py-1 text-caption font-medium transition-colors",
                    active
                      ? "bg-primary text-white"
                      : "bg-paper text-ink-muted hover:bg-border/60 hover:text-ink",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(shiftMonths(month, -1))}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-border/60 hover:text-ink"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <span className="text-body font-semibold">{monthLabel(month)}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(shiftMonths(month, 1))}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-border/60 hover:text-ink"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-y-0.5">
            {WEEKDAY_LABELS.map((weekday) => (
              <span
                key={weekday}
                className="py-1 text-center text-caption font-medium text-ink-muted"
              >
                {weekday}
              </span>
            ))}

            {monthGrid(month).map((day) => {
              const outside = !isSameMonth(day, month);
              const disabled = day > maxDay;
              const isStart = day === start;
              const isEnd = day === end;
              const inside = Boolean(start && end && day > start && day < end);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(day)}
                  onMouseEnter={() => setHovered(day)}
                  onMouseLeave={() => setHovered(null)}
                  aria-label={formatStoreDay(day)}
                  aria-pressed={isStart || isEnd}
                  className={cx(
                    "num h-9 cursor-pointer text-body transition-colors",
                    // Square ends, tinted middle: the range reads as one band.
                    isStart && isEnd
                      ? "rounded-sm bg-primary font-semibold text-white"
                      : isStart
                        ? "rounded-l-sm bg-primary font-semibold text-white"
                        : isEnd
                          ? "rounded-r-sm bg-primary font-semibold text-white"
                          : inside
                            ? "bg-primary-soft text-primary"
                            : "rounded-sm hover:bg-border/60",
                    outside && !isStart && !isEnd && !inside && "text-ink-muted/50",
                    day === today && !isStart && !isEnd && "font-semibold text-primary",
                    disabled && "cursor-not-allowed text-ink-muted/30 hover:bg-transparent",
                  )}
                >
                  {dayOfMonth(day)}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-caption text-ink-muted">
            {picking
              ? "Now pick the last day."
              : draftFrom
                ? describeDayWindow(draftFrom, draftTo)
                : "Pick the first day, then the last."}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={Eraser}
              onClick={() => apply({ fromDay: null, toDay: null })}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              icon={Check}
              onClick={() =>
                apply({ fromDay: draftFrom, toDay: draftTo ?? draftFrom })
              }
            >
              Apply
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
