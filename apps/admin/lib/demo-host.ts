const DEFAULT_DEMO_HOSTS = ["pospro-demo.doubleadigitalsolutions.store"];

function demoHosts(): string[] {
  const raw = process.env.NEXT_PUBLIC_DEMO_HOSTS;
  const source =
    raw === undefined || raw.trim() === ""
      ? DEFAULT_DEMO_HOSTS.join(",")
      : raw;
  return source
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== "");
}

export function isDemoAdminHost(host: string): boolean {
  const normalized = host.toLowerCase().split(":")[0] ?? "";
  return demoHosts().includes(normalized);
}

/** Tells the Tally API to use the demo database (see Laravel DemoDatabase). */
export function demoDatabaseHeaders(
  host: string,
  demoModeCookie = false,
): Record<string, string> {
  return isDemoAdminHost(host) || demoModeCookie ? { "X-Demo-Database": "1" } : {};
}

export function demoDatabaseHeadersForBrowser(
  demoModeCookie = false,
): Record<string, string> {
  if (typeof window === "undefined") return {};
  return demoDatabaseHeaders(window.location.hostname, demoModeCookie);
}
