"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { canPermission } from "@/lib/authz";
import { filterNavGroupsByFeatures, filterNavGroupsByPermissions, NAV_GROUPS } from "@/lib/nav";
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
  const groups = filterNavGroupsByPermissions(
    filterNavGroupsByFeatures(NAV_GROUPS, isEnabled),
    (key) => canPermission(user, key),
  );

  const navRef = useRef<HTMLElement>(null);
  const [motion, setMotion] = useState<ReadonlyMap<string, RowMotion>>(() => new Map());

  const itemKeys = groups.flatMap((group) => [
    ...(group.label ? [`group:${group.label}`] : []),
    ...group.items.map((item) => `item:${item.href}`),
  ]);
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

  return (
    <nav
      ref={navRef}
      className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3 lg:py-1"
    >
      {groups.map((group) => (
        <div key={group.label ?? "top"} className="space-y-1">
          {group.label ? (
            <p
              data-nav-id={`group:${group.label}`}
              {...rowProps(motion.get(`group:${group.label}`))}
              className={rowClass(
                motion.get(`group:${group.label}`),
                "px-3 pb-0.5 text-[0.6875rem] font-medium tracking-wide text-ink-muted/80 uppercase",
              )}
            >
              {group.label}
            </p>
          ) : null}
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
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
                      ? "bg-primary font-medium text-white"
                      : "text-ink hover:bg-border/50",
                  ].join(" "),
                )}
              >
                <Icon
                  size={17}
                  strokeWidth={2}
                  className={active ? "text-white" : "text-ink-muted"}
                />
                {label}
                <NavPending active={active} />
              </Link>
            );
          })}
        </div>
      ))}
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
      className={[
        "ml-auto animate-spin",
        active ? "text-white" : "text-primary",
      ].join(" ")}
    />
  );
}
