"use client";

import { useEffect, useState } from "react";

const BRAND_SITE = "https://www.doubleadigitalsolutions.store/";
const APP_LOGO = "/logo.png";
const SERVICE_LINES = [
  "Custom software built for your business",
  "We build websites for your business",
  "Web apps your team and customers can use every day",
  "Automation that takes repetitive work off your plate",
] as const;
const ROTATE_MS = 4500;

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function RotatingServices() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % SERVICE_LINES.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-ink-muted">Our services:</span>
      <span key={index} className="font-medium text-ink motion-safe:animate-tagline-in">
        {SERVICE_LINES[index]}
      </span>
    </span>
  );
}

export function BrandFooter({
  className,
  userEmail,
}: {
  className?: string;
  userEmail?: string | null;
}) {
  const year = new Date().getFullYear();

  return (
    <div
      className={cx(
        "grid w-full min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-2 overflow-x-auto text-caption whitespace-nowrap",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3 justify-self-start">
        <span className="inline-flex items-center gap-2">
          <img src={APP_LOGO} alt="" className="size-5 shrink-0 object-contain" />
          <span className="font-medium text-ink">POSPro</span>
        </span>
        {userEmail ? <span className="hidden text-ink-muted sm:inline">{userEmail}</span> : null}
      </div>
      <span className="justify-self-center text-ink-muted">
        © {year}{" "}
        <a
          href={BRAND_SITE}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-muted underline decoration-border underline-offset-2 transition-colors hover:text-ink hover:decoration-ink-muted"
        >
          Double A Digital Solutions
        </a>
        . All rights reserved.
      </span>
      <div className="justify-self-end">
        <RotatingServices />
      </div>
    </div>
  );
}
