"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Banknote,
  CircleDollarSign,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { formatMoney } from "@double-a/shared-types";
import type { CashFlowLedgerEntry, CashMovementType } from "@double-a/shared-types";
import { resolveRange } from "@/lib/date-range";
import { DateRangePicker, type DayWindowValue } from "@/components/date-range-picker";
import type { Route } from "next";
import {
  Badge,
  Button,
  Card,
  Combobox,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  StatCardSkeleton,
  Table,
  TableSkeleton,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { Dialog } from "@/components/overlay";
import { AdminGate } from "@/components/admin-gate";
import { useLocations } from "@/lib/query/locations";
import { useTerminals } from "@/lib/query/employees";
import { useCashFlowLedger, useCashFlowSummary, useCreateCashMovement } from "@/lib/query/cash-flow";

const TYPE_LABEL: Record<CashFlowLedgerEntry["type"], string> = {
  sale: "Sale",
  refund: "Refund",
  expense: "Expense",
  adjustment_in: "Adjustment (in)",
  adjustment_out: "Adjustment (out)",
  other_income: "Other income",
};

export default function CashFlowPage() {
  return (
    <AdminGate
      icon={Wallet}
      title="Cash Flow"
      forbiddenTitle="Cash Flow is for the owner's account"
      instruction="Only an admin can view cash flow."
    >
      <CashFlowPageClient />
    </AdminGate>
  );
}

function CashFlowPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };
  const { fromDay, toDay, range } = resolveRange(params);

  const [locationId, setLocationId] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [type, setType] = useState<"" | CashFlowLedgerEntry["type"]>("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const locationsQuery = useLocations({ includeInactive: false });
  const terminalsQuery = useTerminals();

  const filter = {
    from: range.from,
    to: range.to,
    locationId: locationId || undefined,
    terminalId: terminalId || undefined,
  };

  const summaryQuery = useCashFlowSummary(filter);
  const ledgerQuery = useCashFlowLedger({
    ...filter,
    direction: direction || undefined,
    type: type || undefined,
    page,
    pageSize: 25,
  });

  function applyWindow(window: DayWindowValue) {
    const next = new URLSearchParams(searchParams.toString());
    if (window.fromDay) next.set("from", window.fromDay);
    else next.delete("from");
    if (window.toDay) next.set("to", window.toDay);
    else next.delete("to");
    next.delete("preset");
    setPage(1);
    router.push(`/cash-flow?${next.toString()}` as Route);
  }

  const summary = summaryQuery.data;
  const ledger = ledgerQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          icon={Wallet}
          title="Cash Flow"
          description="Where cash came from, where it went, and what's expected on hand."
        />
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker fromDay={fromDay} toDay={toDay} onApply={applyWindow} className="sm:w-64" />
          <Button type="button" icon={Plus} onClick={() => setAddOpen(true)}>
            Add entry
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Direction" required={false}>
          <Select
            value={direction}
            onChange={(event) => {
              setDirection(event.target.value as typeof direction);
              setPage(1);
            }}
          >
            <option value="">Cash in &amp; out</option>
            <option value="in">Cash in</option>
            <option value="out">Cash out</option>
          </Select>
        </Field>
        <Field label="Location" required={false}>
          <Combobox
            value={locationId}
            onChange={(value) => {
              setLocationId(value);
              setPage(1);
            }}
            placeholder="All locations"
            options={[
              { value: "", label: "All locations" },
              ...(locationsQuery.data ?? []).map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
        </Field>
        <Field label="Terminal" required={false}>
          <Combobox
            value={terminalId}
            onChange={(value) => {
              setTerminalId(value);
              setPage(1);
            }}
            placeholder="All terminals"
            options={[
              { value: "", label: "All terminals" },
              ...(terminalsQuery.data ?? []).map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </Field>
        <Field label="Type" required={false}>
          <Select
            value={type}
            onChange={(event) => {
              setType(event.target.value as typeof type);
              setPage(1);
            }}
          >
            <option value="">Every type</option>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {summaryQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
      ) : summaryQuery.isError || !summary ? (
        <Card className="px-4 py-8 text-center text-body text-danger">Could not load the summary.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={CircleDollarSign}
            label="Expected cash"
            value={formatMoney(summary.expectedCash)}
            hint={`Opening ${formatMoney(summary.openingCash)}`}
            tone="primary"
          />
          <StatCard
            icon={TrendingUp}
            label="Cash in"
            value={formatMoney(summary.cashIn)}
            tone="success"
          />
          <StatCard
            icon={TrendingDown}
            label="Cash out"
            value={formatMoney(summary.cashOut)}
            tone="danger"
          />
          <StatCard
            icon={Banknote}
            label="Net cash flow"
            value={formatMoney(summary.netCashFlow)}
            tone={summary.netCashFlow >= 0 ? "success" : "danger"}
          />
        </div>
      )}

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-2 p-4">
            <h2 className="text-body font-semibold text-ink">Cash in</h2>
            {Object.entries(summary.cashInByType).length === 0 ? (
              <p className="text-caption text-ink-muted">Nothing yet.</p>
            ) : (
              Object.entries(summary.cashInByType).map(([key, value]) => (
                <div key={key} className="flex justify-between text-body">
                  <span className="text-ink-muted">{TYPE_LABEL[key as CashFlowLedgerEntry["type"]] ?? key}</span>
                  <span className="font-medium text-ink">{formatMoney(value ?? 0)}</span>
                </div>
              ))
            )}
          </Card>
          <Card className="space-y-2 p-4">
            <h2 className="text-body font-semibold text-ink">Cash out</h2>
            {Object.entries(summary.cashOutByType).length === 0 ? (
              <p className="text-caption text-ink-muted">Nothing yet.</p>
            ) : (
              Object.entries(summary.cashOutByType).map(([key, value]) => (
                <div key={key} className="flex justify-between text-body">
                  <span className="text-ink-muted">{TYPE_LABEL[key as CashFlowLedgerEntry["type"]] ?? key}</span>
                  <span className="font-medium text-ink">{formatMoney(value ?? 0)}</span>
                </div>
              ))
            )}
          </Card>
        </div>
      ) : null}

      <Card>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-body font-semibold text-ink">Ledger</h2>
        </div>
        {ledgerQuery.isPending ? (
          <TableSkeleton columns={["w-24", "w-20", "w-48", "w-24", "w-24"]} />
        ) : ledgerQuery.isError || !ledger ? (
          <p className="px-4 py-8 text-center text-body text-danger">Could not load the ledger.</p>
        ) : ledger.entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-body text-ink-muted">No cash movements in this period.</p>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Description</Th>
                  <Th>Location</Th>
                  <Th>Terminal</Th>
                  <Th numeric>Cash in</Th>
                  <Th numeric>Cash out</Th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((entry, index) => (
                  <tr key={`${entry.referenceType}-${entry.referenceId}-${index}`}>
                    <Td className="whitespace-nowrap text-ink-muted">
                      {new Date(entry.date).toLocaleDateString()}
                    </Td>
                    <Td>
                      <Badge tone={entry.direction === "in" ? "success" : "danger"}>
                        {TYPE_LABEL[entry.type] ?? entry.type}
                      </Badge>
                    </Td>
                    <Td>{entry.description}</Td>
                    <Td className="text-ink-muted">{entry.locationName ?? "—"}</Td>
                    <Td className="text-ink-muted">{entry.terminalName ?? "—"}</Td>
                    <Td numeric className="font-medium">
                      {entry.direction === "in" ? formatMoney(entry.amount) : "—"}
                    </Td>
                    <Td numeric className="font-medium">
                      {entry.direction === "out" ? formatMoney(entry.amount) : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {ledger.lastPage > 1 ? (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-caption text-ink-muted">
                  Page {page} of {ledger.lastPage}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page >= ledger.lastPage}
                  onClick={() => setPage((p) => Math.min(ledger.lastPage, p + 1))}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <AddCashMovementDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        locations={locationsQuery.data ?? []}
        terminals={terminalsQuery.data ?? []}
      />
    </div>
  );
}

function AddCashMovementDialog({
  open,
  onClose,
  locations,
  terminals,
}: {
  open: boolean;
  onClose: () => void;
  locations: { id: string; name: string }[];
  terminals: { id: string; name: string }[];
}) {
  const createMovement = useCreateCashMovement();
  const [type, setType] = useState<CashMovementType>("adjustment_in");
  const [locationId, setLocationId] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setType("adjustment_in");
    setLocationId("");
    setTerminalId("");
    setAmount("");
    setReason("");
    setError(null);
  }

  function submit() {
    setError(null);
    if (!locationId) {
      setError("Pick a location.");
      return;
    }
    if (!reason.trim()) {
      setError("Every manual entry needs a reason.");
      return;
    }
    const value = Number(amount);
    if (!(value > 0)) {
      setError("Enter an amount greater than zero.");
      return;
    }

    createMovement.mutate(
      { type, locationId, terminalId: terminalId || null, amount: value, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success("Recorded.");
          reset();
          onClose();
        },
        onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not save this entry."),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add cash entry"
      description="A manual adjustment or other income — never a sale, expense, or refund."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" loading={createMovement.isPending} onClick={submit}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Field label="Type" required>
          <Select value={type} onChange={(event) => setType(event.target.value as CashMovementType)}>
            <option value="adjustment_in">Cash adjustment (in)</option>
            <option value="adjustment_out">Cash adjustment (out)</option>
            <option value="other_income">Other income</option>
          </Select>
        </Field>
        <Field label="Location" required>
          <Combobox
            value={locationId}
            onChange={setLocationId}
            placeholder="Select location"
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
          />
        </Field>
        <Field label="Terminal" required={false} hint="Optional.">
          <Combobox
            value={terminalId}
            onChange={setTerminalId}
            placeholder="No terminal"
            options={[{ value: "", label: "No terminal" }, ...terminals.map((t) => ({ value: t.id, label: t.name }))]}
          />
        </Field>
        <Field label="Amount" required>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Reason" required hint="Required for every manual entry.">
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
        </Field>
      </div>
    </Dialog>
  );
}
