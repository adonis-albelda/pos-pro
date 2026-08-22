"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Pencil, Users } from "lucide-react";
import type { Customer } from "@double-a/shared-types";
import { Badge, Card, EmptyState, IconButton, Money, Table, Td, Th } from "@/components/ui";
import { Sheet } from "@/components/overlay";
import { Pagination, RecordToolbar } from "@/components/record-list";
import { CustomerForm } from "./customer-form";

export function CustomersPanel({
  customers,
  saleCounts,
  balances,
  query,
  page,
  pageCount,
  total,
  pageSize,
}: {
  customers: Customer[];
  saleCounts: Record<string, number>;
  balances: Record<string, number>;
  query: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  return (
    <>
      <Card>
        <RecordToolbar
          searchPlaceholder="Search name, contact, address…"
          query={query}
          addLabel="Add customer"
          onAdd={() => setCreating(true)}
          exportHref="/api/export/customers"
        />

        {total === 0 ? (
          <EmptyState
            icon={Users}
            title={query ? "Nothing matches that search" : "No customers yet"}
            instruction={
              query
                ? "Try a different name or contact."
                : "Add one here, or the POS will create them when a cashier saves details on a sale."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Address</Th>
                <Th numeric>Sales</Th>
                <Th numeric>Balance owed</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const balance = balances[customer.id] ?? 0;
                return (
                <tr key={customer.id}>
                  <Td className="font-medium">{customer.name}</Td>
                  <Td className="num text-ink-muted">{customer.contact ?? "—"}</Td>
                  <Td className="text-ink-muted">{customer.address ?? "—"}</Td>
                  <Td numeric>
                    <Badge tone="neutral">{saleCounts[customer.id] ?? 0}</Badge>
                  </Td>
                  <Td numeric>
                    <Money
                      value={balance}
                      className={balance > 0 ? "font-semibold text-warning-ink" : "text-ink-muted"}
                    />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <IconButton
                        icon={Pencil}
                        label="Edit customer"
                        onClick={() => setEditing(customer)}
                      />
                      <Link
                        href={`/customers/${customer.id}` as Route}
                        className="inline-flex size-10 items-center justify-center rounded-sm text-ink-muted hover:bg-border/60 hover:text-ink sm:size-8"
                        title="Open customer"
                        aria-label="Open customer"
                      >
                        <ChevronRight size={16} strokeWidth={2} />
                      </Link>
                    </div>
                  </Td>
                </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          basePath="/customers"
          query={{ q: query || undefined }}
        />
      </Card>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Add a customer"
        description="Reusable accounts linked from the counter."
      >
        <CustomerForm onDone={() => setCreating(false)} />
      </Sheet>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : "Edit customer"}
      >
        {editing ? (
          <CustomerForm
            key={editing.id}
            customer={editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}
