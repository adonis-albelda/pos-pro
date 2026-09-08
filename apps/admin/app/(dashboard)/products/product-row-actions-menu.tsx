"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Route } from "next";
import Link from "next/link";
import { MoreVertical, type LucideIcon } from "lucide-react";
import { IconButton } from "@/components/ui";

export type ProductRowActionItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  tone?: "neutral" | "danger";
  disabled?: boolean;
  /** Prefer href for navigation so cmd/ctrl-click and open-in-new-tab still work. */
  href?: string;
  onSelect?: () => void;
};

/**
 * One "···" trigger per row — portal menu so overflow-x table scroll
 * does not clip it (same approach as VariantRowActionsMenu).
 */
export function ProductRowActionsMenu({
  label,
  items,
}: {
  label: string;
  items: ProductRowActionItem[];
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function reposition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = menuRef.current?.offsetHeight ?? items.length * 40;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow < menuHeight + 8 && rect.top > menuHeight + 8
          ? rect.top - menuHeight - 4
          : rect.bottom + 4;
      setCoords({ top, right: window.innerWidth - rect.right });
    }
    // Measure after paint so menuHeight is real on second tick when ref exists.
    reposition();
    const raf = requestAnimationFrame(reposition);

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>("[data-menu-item]");
    first?.focus();
  }, [open]);

  const itemClass = (tone?: "neutral" | "danger", disabled?: boolean) =>
    [
      "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-body transition-colors outline-none focus-visible:bg-paper",
      tone === "danger" ? "text-danger hover:bg-danger/5 focus-visible:bg-danger/5" : "text-ink hover:bg-paper",
      disabled ? "pointer-events-none opacity-40" : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div className="inline-block">
      <IconButton
        ref={triggerRef}
        icon={MoreVertical}
        label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      />
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${label}`}
              style={{ top: coords.top, right: coords.right }}
              className="fixed z-[100] min-w-48 rounded-md border border-border bg-surface py-1 shadow-lg"
            >
              {items.map((item) => {
                const Icon = item.icon;
                const iconEl = (
                  <Icon
                    size={15}
                    strokeWidth={2}
                    className={item.tone === "danger" ? "text-danger" : "text-ink-muted"}
                  />
                );

                if (item.href && !item.disabled) {
                  return (
                    <Link
                      key={item.id}
                      href={item.href as Route}
                      role="menuitem"
                      data-menu-item
                      className={itemClass(item.tone)}
                      onClick={() => setOpen(false)}
                    >
                      {iconEl}
                      {item.label}
                    </Link>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    data-menu-item
                    disabled={item.disabled}
                    className={itemClass(item.tone, item.disabled)}
                    onClick={() => {
                      if (item.disabled) return;
                      setOpen(false);
                      item.onSelect?.();
                    }}
                  >
                    {iconEl}
                    {item.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
