/**
 * Demo accounts run photo AI on Gemini's free tier instead of OpenAI (see
 * VisionExtractionFailover on the API) — slower, and occasionally falls back
 * to a second provider on the spot. Say so, or a demo user just sees a
 * plain photo-read take noticeably longer with no explanation.
 */
export function visionProcessingHint(isDemo: boolean): string {
  return isDemo
    ? "This is a demo account, so this may take a bit longer than usual."
    : "This may take a moment.";
}
