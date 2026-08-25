"use client";

import { KeyRound } from "lucide-react";
import { Card, CardHeader, Table, Td, Th } from "@/components/ui";
import { useDemoAccessCodes } from "@/lib/query/companies";

export function DemoAccessPageClient() {
  const codesQuery = useDemoAccessCodes();
  const redemptions = codesQuery.data ?? [];

  return (
    <Card>
      <CardHeader
        icon={KeyRound}
        title="Issued codes"
        description="Codes are generated and sent to prospects by the external site that hands out demo access — this is a read-only record of every email one has been issued to."
      />

      <div className="px-4 py-4 sm:px-6">
        {codesQuery.isPending ? (
          <p className="text-body text-ink-muted">Loading…</p>
        ) : codesQuery.isError ? (
          <p className="text-body text-danger">
            {codesQuery.error instanceof Error ? codesQuery.error.message : "Could not load issued codes."}
          </p>
        ) : redemptions.length === 0 ? (
          <p className="text-body text-ink-muted">No codes issued yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Used</Th>
              </tr>
            </thead>
            <tbody>
              {redemptions.map((redemption) => (
                <tr key={redemption.id}>
                  <Td className="font-medium">{redemption.email}</Td>
                  <Td className="text-ink-muted">
                    {redemption.usedAt ? new Date(redemption.usedAt).toLocaleString("en-PH") : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}
