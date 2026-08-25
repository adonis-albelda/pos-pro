"use client";

import { use } from "react";
import { CompanyDetailPageClient } from "./company-detail-page-client";

/**
 * Client page — stats via useCompanyStats(), users via useCompanyUsers()
 * (GET /superadmin/companies/:id/users — no acting_company_id token in browser).
 * Superadmin gate lives in (platform)/layout.tsx.
 */
export default function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <CompanyDetailPageClient companyId={id} />;
}
