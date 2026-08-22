"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";

const CONTROL_STYLES =
  "w-full rounded-sm border border-border bg-surface px-3 text-body outline-none transition-colors placeholder:text-ink-muted/70 hover:border-ink/20 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Same look as ui.tsx's plain `Input`, but always `type="password"` with a
 * trailing eye toggle to reveal what was typed — split into its own small
 * client file rather than added to `Input` itself, since ui.tsx has no "use
 * client" today and most of what it exports (Card, Badge, StatCard, ...) is
 * fine rendered server-side; giving the whole file client-only status just
 * for this would be a much bigger blast radius than the feature needs.
 */
export function PasswordInput({
  className,
  icon: Icon,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { icon?: LucideIcon }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span className="relative block">
      {Icon ? (
        <Icon
          size={16}
          strokeWidth={2}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
        />
      ) : null}
      <input
        {...props}
        type={revealed ? "text" : "password"}
        className={cx(CONTROL_STYLES, "h-11 pr-9 sm:h-10", Icon && "pl-9", className)}
      />
      <button
        type="button"
        onClick={() => setRevealed((value) => !value)}
        aria-label={revealed ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted transition-colors hover:text-ink"
      >
        {revealed ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
      </button>
    </span>
  );
}
