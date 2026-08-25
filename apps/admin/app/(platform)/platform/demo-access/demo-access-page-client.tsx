"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Mail, Plus } from "lucide-react";
import { Button, Card, CardHeader, ErrorNote, Field, Input, Table, Td, Th } from "@/components/ui";
import { useDemoAccessCodes } from "@/lib/query/companies";
import { generateDemoAccessCodeAction } from "./actions";

export function DemoAccessPageClient() {
  const codesQuery = useDemoAccessCodes();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState<{ email: string; code: string; validForDate: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter the prospect's email.");
      return;
    }
    setError(null);
    setJustGenerated(null);
    setCopied(false);
    startTransition(async () => {
      const result = await generateDemoAccessCodeAction(trimmed);
      if (result.error || !result.code || !result.email || !result.validForDate) {
        setError(result.error ?? "Could not generate a code.");
        return;
      }
      setJustGenerated({ email: result.email, code: result.code, validForDate: result.validForDate });
      void codesQuery.refetch();
    });
  }

  function copy(code: string) {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const redemptions = codesQuery.data ?? [];

  return (
    <Card>
      <CardHeader
        icon={KeyRound}
        title="Generate a code"
        description="Codes are computed from the prospect's email and today's date — good for one login, for that email only."
      />

      <div className="border-b border-border px-4 py-4 sm:px-6">
        <form onSubmit={generate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Prospect email">
              <Input
                icon={Mail}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="prospect@example.com"
                required
              />
            </Field>
          </div>
          <Button type="submit" icon={Plus} loading={pending}>
            Generate code
          </Button>
        </form>

        {justGenerated ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary-tint px-4 py-3">
            <div>
              <p className="num text-body font-semibold text-ink">{justGenerated.code}</p>
              <p className="text-caption text-ink-muted">
                {justGenerated.email} — valid {justGenerated.validForDate} only
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={copied ? Check : Copy}
              onClick={() => copy(justGenerated.code)}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}
      </div>

      <div className="px-4 py-4 sm:px-6">
        <p className="mb-3 text-caption font-medium text-ink-muted">Redeemed codes</p>
        {codesQuery.isPending ? (
          <p className="text-body text-ink-muted">Loading…</p>
        ) : codesQuery.isError ? (
          <p className="text-body text-danger">
            {codesQuery.error instanceof Error ? codesQuery.error.message : "Could not load redemptions."}
          </p>
        ) : redemptions.length === 0 ? (
          <p className="text-body text-ink-muted">No codes redeemed yet.</p>
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
