"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Plus } from "lucide-react";
import { Badge, Button, Card, CardHeader, ErrorNote, Table, Td, Th } from "@/components/ui";
import { useDemoAccessCodes } from "@/lib/query/companies";
import { generateDemoAccessCodeAction } from "./actions";

export function DemoAccessPageClient() {
  const codesQuery = useDemoAccessCodes();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function generate() {
    setError(null);
    setJustGenerated(null);
    startTransition(async () => {
      const result = await generateDemoAccessCodeAction();
      if (result.error || !result.code) {
        setError(result.error ?? "Could not generate a code.");
        return;
      }
      setJustGenerated(result.code);
      void codesQuery.refetch();
    });
  }

  function copy(code: string) {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied((current) => (current === code ? null : current)), 2000);
    });
  }

  const codes = codesQuery.data ?? [];

  return (
    <Card>
      <CardHeader
        icon={KeyRound}
        title="Codes"
        description="Each code works once — send it to one prospect, then generate a new one for the next."
        action={
          <Button type="button" icon={Plus} loading={pending} onClick={generate}>
            Generate code
          </Button>
        }
      />

      <div className="px-4 py-4 sm:px-6">
        {justGenerated ? (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary-tint px-4 py-3">
            <span className="num text-body font-semibold text-ink">{justGenerated}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={copied === justGenerated ? Check : Copy}
              onClick={() => copy(justGenerated)}
            >
              {copied === justGenerated ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : null}

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {codesQuery.isPending ? (
          <p className="text-body text-ink-muted">Loading…</p>
        ) : codesQuery.isError ? (
          <p className="text-body text-danger">
            {codesQuery.error instanceof Error ? codesQuery.error.message : "Could not load codes."}
          </p>
        ) : codes.length === 0 ? (
          <p className="text-body text-ink-muted">No codes issued yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Status</Th>
                <Th>Issued</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id}>
                  <Td className="num font-medium">{code.code}</Td>
                  <Td>
                    <Badge tone={code.usedAt ? "neutral" : "success"}>
                      {code.usedAt ? "Used" : "Unused"}
                    </Badge>
                  </Td>
                  <Td className="text-ink-muted">
                    {code.createdAt ? new Date(code.createdAt).toLocaleString("en-PH") : "—"}
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        icon={copied === code.code ? Check : Copy}
                        onClick={() => copy(code.code)}
                      >
                        {copied === code.code ? "Copied" : "Copy"}
                      </Button>
                    </div>
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
