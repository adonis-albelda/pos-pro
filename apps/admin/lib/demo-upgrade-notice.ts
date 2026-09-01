"use client";

/**
 * Fired when a demo account hits the team-member cap (403 from
 * DemoUserRoleLimit). DemoUpgradeBanner listens so the message lands at
 * the top of the dashboard instead of buried in a sheet.
 */
const DEMO_UPGRADE_EVENT = "double-a:demo-upgrade-limit";

export function notifyDemoUpgradeLimit(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DEMO_UPGRADE_EVENT));
}

export function onDemoUpgradeLimit(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(DEMO_UPGRADE_EVENT, callback);
  return () => window.removeEventListener(DEMO_UPGRADE_EVENT, callback);
}
