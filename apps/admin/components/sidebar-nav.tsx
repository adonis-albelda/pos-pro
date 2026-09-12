"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LoaderCircle } from "lucide-react";
import { canPermission } from "@/lib/authz";
import {
  filterNavSectionsByFeatures,
  filterNavSectionsByPermissions,
  NAV_SECTIONS,
  type NavItem,
} from "@/lib/nav";
import { useNavFeatureEnabled } from "@/lib/query/nav-features";
import { useCurrentUser } from "@/lib/query/session";

/** Gap between each row in the mount cascade (ms). */
const STAGGER_MS = 48;

type RowMotion =
  | { kind: "idle" }
  | { kind: "slide-in"; delayMs: number }
  | { kind: "pending" }
  | { kind: "slide-up" };

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isEnabled } = useNavFeatureEnabled();
  const { data: user } = useCurrentUser();
  const sections = filterNavSectionsByPermissions(
    filterNavSectionsByFeatures(NAV_SECTIONS, isEnabled),
    (key) => canPermission(user, key),
  );

  const navRef = useRef<HTMLElement>(null);
  const [motion, setMotion] = useState<ReadonlyMap<string, RowMotion>>(() => new Map());

  function isItemActive(href: string): boolean {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  // Collapsed on first load — only the group holding the current page opens
  // automatically, so landing on a page still shows where it lives. Keyed by
  // "section:group" since two different sections could reuse a group label.
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => {
    const keys: string[] = [];
    for (const section of sections) {
      for (const group of section.groups) {
        if (group.label && group.items.some((item) => isItemActive(item.href))) {
          keys.push(`${section.label}:${group.label}`);
        }
      }
    }
    return new Set(keys);
  });

  function toggleGroup(key: string) {
    setOpenGroups((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const itemKeys = sections.flatMap((section) =>
    section.groups.flatMap((group) => [
      ...(group.label ? [`group:${section.label}:${group.label}`] : []),
      ...group.items.map((item) => `item:${item.href}`),
    ]),
  );
  const itemKeysSig = itemKeys.join("|");

  useLayoutEffect(() => {
    const root = navRef.current;
    if (!root) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMotion(new Map());
      return;
    }

    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-nav-id]"));
    const rootRect = root.getBoundingClientRect();
    const next = new Map<string, RowMotion>();
    let slideInIndex = 0;

    for (const el of nodes) {
      const id = el.dataset.navId;
      if (!id) continue;
      const rect = el.getBoundingClientRect();
      const inView = rect.top < rootRect.bottom && rect.bottom > rootRect.top;
      if (inView) {
        next.set(id, { kind: "slide-in", delayMs: slideInIndex++ * STAGGER_MS });
      } else {
        // Below the fold only — stays layout-sized but invisible until scroll.
        next.set(id, { kind: "pending" });
      }
    }

    setMotion(next);

    const observer = new IntersectionObserver(
      (entries) => {
        const unlocked: string[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.navId;
          if (!id) continue;
          unlocked.push(id);
          observer.unobserve(entry.target);
        }
        if (unlocked.length === 0) return;

        setMotion((prev) => {
          const updated = new Map(prev);
          for (const id of unlocked) {
            if (updated.get(id)?.kind === "pending") {
              updated.set(id, { kind: "slide-up" });
            }
          }
          return updated;
        });
      },
      {
        root,
        // Trigger just before the row fully clears the bottom edge.
        rootMargin: "0px 0px -6% 0px",
        threshold: 0.2,
      },
    );

    for (const el of nodes) {
      const id = el.dataset.navId;
      if (!id || next.get(id)?.kind !== "pending") continue;
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [itemKeysSig]);

  function renderItem({ href, label, icon: Icon }: NavItem) {
    const active = isItemActive(href);
    const id = `item:${href}`;
    const row = motion.get(id);

    return (
      <Link
        key={href}
        href={href}
        data-nav-id={id}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        {...rowProps(row)}
        className={rowClass(
          row,
          [
            "flex min-h-10 items-center gap-3 rounded-sm px-3 py-1.5 text-body transition-colors lg:min-h-0",
            active
              ? "bg-primary/10 font-medium text-primary ring-1 ring-primary/15"
              : "text-ink hover:bg-border/50",
          ].join(" "),
        )}
      >
        <Icon size={17} strokeWidth={2} className={active ? "text-primary" : "text-ink-muted"} />
        {label}
        <NavPending active={active} />
      </Link>
    );
  }

  return (
    <nav
      ref={navRef}
      className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3 lg:py-1"
    >
      {sections.map((section) => {
        const body = section.groups.map((group) => {
          if (!group.label) {
            // Bare group — no sub-heading, nothing to collapse.
            return (
              <div key="bare" className="space-y-1">
                {group.items.map(renderItem)}
              </div>
            );
          }

          const groupKey = `${section.label}:${group.label}`;
          const isOpen = openGroups.has(groupKey);

          return (
            <div key={group.label} className="space-y-1">
              <button
                type="button"
                data-nav-id={`group:${groupKey}`}
                aria-expanded={isOpen}
                onClick={() => toggleGroup(groupKey)}
                {...rowProps(motion.get(`group:${groupKey}`))}
                className={rowClass(
                  motion.get(`group:${groupKey}`),
                  "flex w-full items-center justify-between rounded-sm px-3 pb-0.5 text-[0.6875rem] font-medium tracking-wide text-ink-muted uppercase transition-colors hover:text-ink",
                )}
              >
                {group.label}
                <ChevronRight
                  size={13}
                  strokeWidth={2.5}
                  className={`transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                />
              </button>
              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none ${
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="space-y-1 overflow-hidden">{group.items.map(renderItem)}</div>
              </div>
            </div>
          );
        });

        return (
          <div key={section.label ?? "top"} className="space-y-1">
            {section.label ? (
              <p className="px-3 pb-0.5 text-[0.6875rem] font-medium tracking-wide text-ink-muted/60 uppercase">
                {section.label}
              </p>
            ) : null}
            <div className="space-y-3">{body}</div>
          </div>
        );
      })}
    </nav>
  );
}

function rowProps(row: RowMotion | undefined): { style?: { animationDelay: string } } {
  if (row?.kind === "slide-in") {
    return { style: { animationDelay: `${row.delayMs}ms` } };
  }
  return {};
}

function rowClass(row: RowMotion | undefined, base: string): string {
  if (!row || row.kind === "idle") return base;
  if (row.kind === "pending") return `${base} opacity-0 translate-y-3`;
  if (row.kind === "slide-in") return `${base} motion-safe:animate-nav-slide-in`;
  return `${base} motion-safe:animate-nav-slide-up`;
}

/**
 * A page's data is fetched on the server, so a click on a heavy report can sit
 * for a second with nothing to show for it. This says the click landed. It has
 * to be a child of `Link` — that is where `useLinkStatus` reads from.
 */
function NavPending({ active }: { active: boolean }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <LoaderCircle
      size={14}
      strokeWidth={2.5}
      aria-label="Loading"
      className={["ml-auto animate-spin", active ? "text-primary" : "text-primary"].join(" ")}
    />
  );
}
