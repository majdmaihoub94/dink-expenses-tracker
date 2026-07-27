import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { redact } from "@/lib/import/statement";

/**
 * AI fallback for statement layouts the deterministic parser can't read.
 *
 * Only runs when the rule-based parser finds nothing, so the common case —
 * CSV exports and statements with a recognisable date/amount structure —
 * never leaves the server. When it does run, the text is redacted first: card
 * numbers, sort codes, account numbers and IBANs are stripped before the
 * request is built.
 *
 * Uses Claude Haiku 4.5 — the cheapest model, chosen deliberately. Extraction
 * from text that has already been laid out is a shallow task, and a statement
 * costs a fraction of a penny.
 */

const MODEL = "claude-haiku-4-5";

/** Statement text sent per request. Haiku 4.5 has a 200K context window. */
const MAX_LINES = 900;

export type AiRow = {
  date: string;
  description: string;
  amount: number;
  direction: "in" | "out";
};

const SCHEMA = {
  type: "object" as const,
  properties: {
    transactions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          date: { type: "string" as const, description: "ISO date, yyyy-MM-dd" },
          description: { type: "string" as const, description: "Merchant or payee" },
          amount: { type: "number" as const, description: "Positive amount" },
          direction: {
            type: "string" as const,
            enum: ["in", "out"],
            description: "'out' for money leaving the account, 'in' for money arriving",
          },
        },
        required: ["date", "description", "amount", "direction"],
        additionalProperties: false,
      },
    },
  },
  required: ["transactions"],
  additionalProperties: false,
};

const SYSTEM = `You extract transactions from bank statement text.

Rules:
- Return every transaction row. Ignore headers, footers, page numbers, opening
  and closing balance lines, and marketing text.
- Dates must be yyyy-MM-dd. Statements are UK unless clearly otherwise, so
  ambiguous numeric dates are day-first: 03/04/2026 is 3 April 2026. Infer the
  year from the statement period when a row omits it.
- amount is always positive. Use direction to say which way the money moved.
- Many statements print a running balance after the amount. The balance is not
  a transaction — use it only to work out direction: if the balance fell, the
  money went out.
- Do not invent rows, and do not guess at a value you cannot read. Returning
  fewer accurate rows is better than filling gaps.`;

export function aiExtractionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Returns rows in the same `[date, description, signedAmount]` shape as the
 * deterministic parser, so both paths flow through one review pipeline.
 */
export async function extractWithAi(lines: string[]): Promise<string[][]> {
  if (!aiExtractionAvailable()) return [];

  const client = new Anthropic();

  // Redact before the text is ever put in a request body.
  const text = lines
    .slice(0, MAX_LINES)
    .map((line) => redact(line))
    .join("\n");

  if (!text.trim()) return [];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `Extract every transaction:\n\n${text}` }],
  });

  if (response.stop_reason === "refusal") return [];

  const body = response.content.find((block) => block.type === "text");
  if (!body || body.type !== "text") return [];

  let parsed: { transactions?: AiRow[] };
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return [];
  }

  return (parsed.transactions ?? [])
    .filter(
      (row) =>
        row &&
        /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
        Number.isFinite(row.amount) &&
        row.amount > 0,
    )
    .map((row) => [
      row.date,
      redact(String(row.description ?? "")).slice(0, 120) || "Imported",
      row.direction === "in" ? String(row.amount) : `-${row.amount}`,
    ]);
}
