"use client";

import { PlatformPageClient } from "./platform-page-client";

/**
 * Client page — company list via useCompanyStats() in PlatformPageClient.
 * Superadmin gate lives in (platform)/layout.tsx.
 */
export default function PlatformPage() {
  return <PlatformPageClient />;
}
