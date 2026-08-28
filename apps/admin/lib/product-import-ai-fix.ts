import "server-only";

import type { ColumnMapping } from "@/lib/product-import-mapping";
import { IMPORT_FIELD_META } from "@/lib/product-import-mapping";
import {
  mappedCellsFromSource,
  sanitiseImportRowFixes,
  sourceCellsForLine,
  type ImportRowFix,
} from "@/lib/product-import-fix";

const FIX_BATCH_SIZE = 15;
const MAX_FIX_ROWS = 120;
const DEFAULT_MODEL = "gpt-4o-mini";

export interface AiFixRejectedRow {
  line: number;
  errors: string[];
  sourceCells: Record<string, string>;
  mapped: Partial<Record<string, string>>;
}

export interface AiFixSampleRow {
  line: number;
  sourceCells: Record<string, string>;
  mapped: Partial<Record<string, string>>;
}

function buildSystemPrompt(): string {
  const fieldGuide = IMPORT_FIELD_META.map(
    (field) => `- ${field.key}: ${field.label}. ${field.hint}`,
  ).join("\n");

  return `You fix bad product-import CSV rows for a hardware store POS.

Catalogue fields:
${fieldGuide}

Common problems:
- SKU and product name merged into one cell while the other column is empty or wrong
- CSV quote errors shifted values into the wrong columns (price in name, name in sku, etc.)
- Price missing because it landed in an unmapped column — recover when obvious from source cells

Rules:
- Return corrected catalogue field values only (keys: name, sku, price, cost_price, unit, etc.)
- SKU is usually a short code (often numeric or alphanumeric like WEP-101, 20528951)
- Product name is the human-readable description, often longer than the SKU
- Do not invent prices — only fix when a numeric price is clearly present in source cells
- If a row cannot be fixed confidently, omit it from the response
- Respond with JSON only: { "fixes": [{ "line": 8, "fields": { "sku": "...", "name": "..." }, "reason": "..." }] }`;
}

function buildUserPrompt(
  mapping: ColumnMapping,
  rejected: AiFixRejectedRow[],
  samples: AiFixSampleRow[],
): string {
  const mappingLines = Object.entries(mapping)
    .filter(([, source]) => source)
    .map(([field, source]) => `${field} <- "${source}"`)
    .join("\n");

  return JSON.stringify(
    {
      column_mapping: mappingLines,
      good_row_examples: samples,
      turned_away_rows: rejected.map((row) => ({
        line: row.line,
        errors: row.errors,
        file_columns: row.sourceCells,
        current_mapping: row.mapped,
      })),
    },
    null,
    2,
  );
}

async function callOpenAiBatch(
  apiKey: string,
  model: string,
  mapping: ColumnMapping,
  rejected: AiFixRejectedRow[],
  samples: AiFixSampleRow[],
): Promise<ImportRowFix[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: `Fix these turned-away rows. Split combined SKU/name when needed and realign shifted columns.\n\n${buildUserPrompt(mapping, rejected, samples)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "{}";

  let parsed: { fixes?: ImportRowFix[] };
  try {
    parsed = JSON.parse(content) as { fixes?: ImportRowFix[] };
  } catch {
    return [];
  }

  return sanitiseImportRowFixes(parsed.fixes ?? []);
}

export async function suggestImportRowFixes(input: {
  mapping: ColumnMapping;
  csv: string;
  rejected: Array<{ line: number; errors: string[] }>;
  acceptedSamples: Array<{ line: number }>;
}): Promise<{ fixes: ImportRowFix[]; attempted: number }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for the admin app.");
  }

  const model = process.env.OPENAI_IMPORT_FIX_MODEL?.trim() || DEFAULT_MODEL;
  const capped = input.rejected.slice(0, MAX_FIX_ROWS);

  const rejected: AiFixRejectedRow[] = capped.map((row) => {
    const sourceCells = sourceCellsForLine(input.csv, row.line);
    return {
      line: row.line,
      errors: row.errors,
      sourceCells,
      mapped: mappedCellsFromSource(sourceCells, input.mapping),
    };
  });

  const samples: AiFixSampleRow[] = input.acceptedSamples.slice(0, 5).map((row) => {
    const sourceCells = sourceCellsForLine(input.csv, row.line);
    return {
      line: row.line,
      sourceCells,
      mapped: mappedCellsFromSource(sourceCells, input.mapping),
    };
  });

  const allFixes: ImportRowFix[] = [];

  for (let index = 0; index < rejected.length; index += FIX_BATCH_SIZE) {
    const batch = rejected.slice(index, index + FIX_BATCH_SIZE);
    const fixes = await callOpenAiBatch(apiKey, model, input.mapping, batch, samples);
    allFixes.push(...fixes);
  }

  const byLine = new Map<number, ImportRowFix>();
  for (const fix of allFixes) byLine.set(fix.line, fix);

  return { fixes: [...byLine.values()], attempted: capped.length };
}
