import { NextResponse } from "next/server";

import { parseCsv } from "@/lib/import/csv";
import { extractPdfLines } from "@/lib/import/pdf";
import {
  buildRows,
  detectColumns,
  looksLikeHeader,
  parseStatementLines,
  TEXT_COLUMNS,
  type ColumnMap,
} from "@/lib/import/statement";
import { readXlsxRows } from "@/lib/import/xlsx";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";

/**
 * Parses an uploaded statement and returns reviewable rows.
 *
 * Security posture, in order of importance:
 *
 *  1. The file is held in memory for the life of this request and is never
 *     written to disk, never put in object storage, and never logged. When the
 *     response is sent there is nothing left to leak.
 *  2. No third party sees it. Parsing is deterministic code running in our own
 *     container — no AI provider, no external API.
 *  3. Nothing is saved by this endpoint. It only returns candidate rows; the
 *     user reviews them and a separate action does the writing.
 *  4. Card numbers, sort codes, account numbers and IBANs are redacted before
 *     anything is returned.
 *  5. Auth, size, type and rate limits are enforced before parsing begins.
 */

export const runtime = "nodejs";
// Parsing is CPU-bound; keep it well inside Railway's request ceiling.
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ROWS = 2000;

/** Uploads allowed per user per window — enough for real use, not for abuse. */
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = attempts.get(userId);

  if (!entry || now > entry.resetAt) {
    attempts.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

/** Sniffs the real format from magic bytes — the client's MIME type is a hint, not proof. */
function detectFormat(bytes: Uint8Array, filename: string): "pdf" | "xlsx" | "text" | null {
  if (bytes.length >= 5) {
    const header = String.fromCharCode(...bytes.slice(0, 5));
    if (header.startsWith("%PDF-")) return "pdf";
    // XLSX is a ZIP container.
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05)) {
      return "xlsx";
    }
  }

  // Legacy .xls is a compound binary we do not support — say so explicitly
  // rather than producing nonsense.
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf) return null;

  const name = filename.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) return "text";

  // Treat anything that decodes cleanly as text; binary junk will not.
  return looksTextual(bytes) ? "text" : null;
}

function looksTextual(bytes: Uint8Array): boolean {
  const sample = bytes.slice(0, 1024);
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) control++;
  }
  return control / Math.max(sample.length, 1) < 0.05;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (rateLimited(user.id)) {
    return NextResponse.json(
      { error: "Too many imports in a short time. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) {
    return NextResponse.json({ error: "No household" }, { status: 400 });
  }

  // --- Read the upload ------------------------------------------------------
  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return NextResponse.json({ error: "Could not read the upload" }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is over ${MAX_BYTES / 1024 / 1024}MB. Export a shorter date range.` },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectFormat(bytes, file.name);

  if (!format) {
    return NextResponse.json(
      { error: "Unsupported file. Use a PDF statement, or a CSV/Excel export." },
      { status: 415 },
    );
  }

  // --- Household reference data, for categorising --------------------------
  const [categoriesRes, historyRes] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("household_id", profile.household_id)
      .eq("archived", false),
    supabase
      .from("transactions")
      .select("merchant, category_id")
      .eq("household_id", profile.household_id)
      .eq("kind", "expense")
      .not("merchant", "is", null)
      .not("category_id", "is", null)
      .order("occurred_on", { ascending: false })
      .limit(400),
  ]);

  const categories = (categoriesRes.data ?? []) as Category[];
  const history = (historyRes.data ?? [])
    .map((row) => ({ merchant: String(row.merchant), categoryId: String(row.category_id) }))
    .filter((row) => row.merchant && row.categoryId);

  // --- Parse ---------------------------------------------------------------
  let rows: string[][] = [];
  let columns: ColumnMap;
  let hasHeader = false;

  try {
    if (format === "pdf") {
      rows = parseStatementLines(await extractPdfLines(bytes));
      columns = TEXT_COLUMNS;
    } else {
      const grid =
        format === "xlsx"
          ? await readXlsxRows(bytes)
          : parseCsv(new TextDecoder("utf-8").decode(bytes));

      if (grid.length === 0) {
        return NextResponse.json({ error: "That file appears to be empty." }, { status: 422 });
      }

      hasHeader = looksLikeHeader(grid[0]);
      columns = hasHeader ? detectColumns(grid[0]) : { date: 0, description: 1, amount: 2, debit: -1, credit: -1 };
      rows = grid;
    }
  } catch (error) {
    // Deliberately generic: never echo file contents back in an error.
    console.error("[import] parse failed", (error as Error)?.name);
    return NextResponse.json(
      { error: "Could not read that file. If it is a scanned PDF, export a CSV from your bank instead." },
      { status: 422 },
    );
  }

  // --- Existing transactions, so duplicates can be flagged ------------------
  const parsed = buildRows({
    rows,
    columns,
    hasHeader,
    categories,
    history,
    existingKeys: new Set(),
  });

  if (parsed.length === 0) {
    return NextResponse.json(
      {
        error:
          format === "pdf"
            ? "No transactions found. PDF layouts vary a lot — a CSV export from your bank is far more reliable."
            : "No transactions found. Check the file has date, description and amount columns.",
      },
      { status: 422 },
    );
  }

  const dates = parsed.map((r) => r.date!).filter(Boolean).sort();
  const { data: existing } = await supabase
    .from("transactions")
    .select("occurred_on, amount, merchant")
    .eq("household_id", profile.household_id)
    .gte("occurred_on", dates[0])
    .lte("occurred_on", dates[dates.length - 1]);

  const { duplicateKey } = await import("@/lib/import/statement");
  const existingKeys = new Set(
    (existing ?? []).map((t) =>
      duplicateKey(String(t.occurred_on), Number(t.amount), String(t.merchant ?? "")),
    ),
  );

  const withDuplicates = buildRows({
    rows,
    columns,
    hasHeader,
    categories,
    history,
    existingKeys,
  }).slice(0, MAX_ROWS);

  return NextResponse.json(
    {
      rows: withDuplicates,
      truncated: parsed.length > MAX_ROWS,
      format,
    },
    // The response contains transaction data — never let it be cached.
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
