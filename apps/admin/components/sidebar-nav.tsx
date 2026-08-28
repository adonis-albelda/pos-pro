"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { filterNavGroupsByFeatures, NAV_GROUPS } from "@/lib/nav";
import { useNavFeatureEnabled } from "@/lib/query/nav-features";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isEnabled } = useNavFeatureEnabled();
  const groups = filterNavGroupsByFeatures(NAV_GROUPS, isEnabled);

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3 lg:py-1">
      {groups.map((group) => (
        <div key={group.label ?? "top"} className="space-y-1">
          {group.label ? (
            <p className="px-3 pb-0.5 text-[0.6875rem] font-medium tracking-wide text-ink-muted/80 uppercase">
              {group.label}
            </p>
          ) : null}
          {group.items.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={[
                  "flex min-h-10 items-center gap-3 rounded-sm px-3 py-1.5 text-body transition-colors lg:min-h-0",
                  active
                    ? "bg-primary font-medium text-white"
                    : "text-ink hover:bg-border/50",
                ].join(" ")}
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
