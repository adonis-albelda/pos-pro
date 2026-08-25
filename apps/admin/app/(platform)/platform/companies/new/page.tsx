"use client";

import { Building2 } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { CreateCompanyForm } from "./create-company-form";

/**
 * Client page — create still Server Action (scoped bootstrap token stays server-side).
 * Superadmin gate lives in (platform)/layout.tsx.
 */
export default function NewCompanyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        title="New company"
        description="Creates the shop account and the first admin login."
      />
      <Card>
        <CardHeader title="Company and first admin" />
        <CardBody>
          <CreateCompanyForm />
        </CardBody>
      </Card>
    </div>
  );
}
