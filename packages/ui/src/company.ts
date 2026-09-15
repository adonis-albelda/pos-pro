/** Marketing copy for DOUBLE A Digital Solutions intros (admin + POS). */
export const COMPANY_NAME = "DOUBLE A DIGITAL SOLUTIONS";

/**
 * The name split for the intro lockup. Kept here so admin and POS show the
 * same words.
 */
export const COMPANY_LEAD = "POSPro One";
export const COMPANY_TRADE = "DIGITAL SOLUTIONS";

/** Short product line under the mark — the benefit, not a category label. */
export const COMPANY_PRODUCT = "Your all-in-one POS for smarter business.";

/**
 * The one sentence on the cold-start splash. Quiet credit, not a pitch deck.
 */
export const COMPANY_POWERED_BY =
  "This software is powered by Double A Digital Solutions.";

/** How long the splash holds before continuing on its own (ms). */
export const COMPANY_INTRO_HOLD_MS = 3600;

/**
 * @deprecated Prefer COMPANY_POWERED_BY. Kept as a one-item list so older
 * intro loops that index taglines still compile.
 */
export const COMPANY_TAGLINES = [COMPANY_POWERED_BY] as const;

/** @deprecated Prefer COMPANY_INTRO_HOLD_MS. */
export const COMPANY_TAGLINE_MS = COMPANY_INTRO_HOLD_MS;

/** Unused by the minimal intro; left for any typewriter callers. */
export const COMPANY_TYPE_MS = 90;
