import { isDemoAdminHost } from "./demo-host";

/**
 * Demo traffic runs photo AI on Gemini's free tier instead of OpenAI (see
 * VisionExtractionFailover on the API) — slower, and occasionally falls back
 * to a second provider on the spot. Say so on demo hosts and demo-flagged
 * users, or the wait looks unexplained.
 *
 * Host check matters after a prod→demo DB clone: cloned shop users keep
 * `is_demo = false`, but they are still on the demo subdomain.
 */
export function visionProcessingHint(isDemoUser: boolean): string {
  const onDemoHost =
    typeof window !== "undefined" && isDemoAdminHost(window.location.hostname);

  return isDemoUser || onDemoHost
    ? "This is a demo environment, so this may take a bit longer than usual."
    : "This may take a moment.";
}
