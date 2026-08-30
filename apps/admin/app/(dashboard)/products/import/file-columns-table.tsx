import { ChevronRight } from "lucide-react";
import { Badge, Table, Td, Th } from "@/components/ui";

function formatHeader(header: string): string {
  return header.replace(/_/g, " ");
}

export function FileColumnsTable({
  headers,
  sampleRow,
  mappedHeaders,
}: {
  headers: string[];
  sampleRow: Record<string, string>;
  mappedHeaders: Set<string>;
}) {
  if (headers.length === 0) return null;

  return (
    <details className="group space-y-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={16}
          className="shrink-0 text-ink-muted transition-transform group-open:rotate-90"
        />
        <p className="text-body font-medium text-ink">Columns in your file</p>
        <Badge tone="neutral">{headers.length} columns</Badge>
      </summary>

      <div className="mt-3 overflow-hidden rounded-md border border-border">
        <Table>
          <thead>
            <tr>
              <Th>Your file column</Th>
              <Th>Sample value</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header) => {
              const connected = mappedHeaders.has(header);
              return (
                <tr key={header}>
                  <Td className="font-medium">{formatHeader(header)}</Td>
                  <Td className="max-w-xs truncate text-ink-muted" title={sampleRow[header] ?? ""}>
                    {sampleRow[header] || "—"}
                  </Td>
                  <Td>
                    {connected ? (
                      <Badge tone="success">Connected</Badge>
                    ) : (
                      <Badge tone="neutral">Not connected</Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </details>
  );
}
