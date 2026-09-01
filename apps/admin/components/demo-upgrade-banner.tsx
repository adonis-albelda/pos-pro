"use client";

import { useEffect, useState } from "react";
import { ArrowUpCircle, X } from "lucide-react";
import { DemoAccount } from "@double-a/shared-types";
import { onDemoUpgradeLimit } from "@/lib/demo-upgrade-notice";

export function DemoUpgradeBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return onDemoUpgradeLimit(() => setVisible(true));
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-primary/40 bg-primary/10 px-3 py-2.5 sm:px-4 lg:px-5"
    >
      <ArrowUpCircle size={16} className="mt-0.5 shrink-0 text-primary" strokeWidth={2} />
      <p className="flex-1 text-caption leading-relaxed text-ink">
        {DemoAccount.TEAM_LIMIT_MESSAGE} For plan details, visit{" "}
        <a
          href={DemoAccount.UPGRADE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2"
        >
          our website
        </a>{" "}
        or email us at{" "}
        <a
          href={`mailto:${DemoAccount.SUPPORT_EMAIL}`}
          className="font-medium text-primary underline underline-offset-2"
        >
          {DemoAccount.SUPPORT_EMAIL}
        </a>
        .
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="shrink-0 rounded-sm p-1 text-ink-muted hover:bg-surface hover:text-ink"
        aria-label="Dismiss upgrade notice"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
