import type { Category } from "@/lib/types";

/**
 * Turns the rows of a bank export into transactions DINX can save.
 *
 * Everything here is pure and runs in the browser — the statement itself is
 * never uploaded. Only the rows you tick are sent to your own database.
 */

export type ColumnMap = {
  date: number;
  description: number;
  /** Single signed amount column. */
  amount: number;
  /** Or a separate debit/credit pair, as many UK banks export. */
  debit: number;
  credit: number;
};

export type ParsedRow = {
  /** Index in the source file, so the review list is stable. */
  index: number;
  date: string | null;
  description: string;
  /** Always positive; `kind` carries the sign. */
  amount: number;
  kind: "expense" | "income";
  categoryId: string | null;
  /** Why that category was chosen, shown in the review list. */
  categorySource: "history" | "keyword" | null;
  /** Matches something already logged, so it defaults to unticked. */
  duplicate: boolean;
  include: boolean;
};

const HEADER_HINTS: Record<keyof ColumnMap, string[]> = {
  date: ["date", "transaction date", "posting date", "completed date", "started date", "value date"],
  description: [
    "description",
    "details",
    "narrative",
    "reference",
    "merchant",
    "payee",
    "transaction",
    "name",
    "memo",
  ],
  amount: ["amount", "value", "transaction amount"],
  debit: ["debit", "money out", "paid out", "withdrawal", "out"],
  credit: ["credit", "money in", "paid in", "deposit", "in"],
};

/** Best-effort mapping of a header row onto the fields we need. */
export function detectColumns(header: string[]): ColumnMap {
  const normalised = header.map((h) => h.trim().toLowerCase());
  const find = (hints: string[]) => {
    // Exact header match first, then a looser contains match.
    for (const hint of hints) {
      const exact = normalised.indexOf(hint);
      if (exact !== -1) return exact;
    }
    for (const hint of hints) {
      const partial = normalised.findIndex((h) => h.includes(hint));
      if (partial !== -1) return partial;
    }
    return -1;
  };

  return {
    date: find(HEADER_HINTS.date),
    description: find(HEADER_HINTS.description),
    amount: find(HEADER_HINTS.amount),
    debit: find(HEADER_HINTS.debit),
    credit: find(HEADER_HINTS.credit),
  };
}

/** True when the row looks like column titles rather than a transaction. */
export function looksLikeHeader(row: string[]): boolean {
  const map = detectColumns(row);
  return map.date !== -1 && (map.description !== -1 || map.amount !== -1);
}

/**
 * Parses a date cell to `yyyy-MM-dd`.
 *
 * Ambiguous numeric dates are read day-first: DINX is built around UK banks,
 * where 03/04/2026 means 3 April. A value above 12 in the first position
 * settles it either way.
 */
export function parseDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  // ISO, already unambiguous.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // 03/04/2026, 3-4-26, 03.04.2026
  const numeric = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (numeric) {
    const [, first, second, year] = numeric;
    let day = Number(first);
    let month = Number(second);

    // A first field above 12 can only be a day; above 12 in second means the
    // file is month-first after all.
    if (day <= 12 && month > 12) [day, month] = [month, day];
    if (month > 12) return null;

    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
    return toIso(fullYear, month, day);
  }

  // 3 Apr 2026 / 03 April 2026
  const named = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{2,4})/);
  if (named) {
    const month = monthFromName(named[2]);
    if (!month) return null;
    const year = named[3].length === 2 ? 2000 + Number(named[3]) : Number(named[3]);
    return toIso(year, month, Number(named[1]));
  }

  // Apr 3, 2026
  const usNamed = raw.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{2,4})/);
  if (usNamed) {
    const month = monthFromName(usNamed[1]);
    if (!month) return null;
    const year = usNamed[3].length === 2 ? 2000 + Number(usNamed[3]) : Number(usNamed[3]);
    return toIso(year, month, Number(usNamed[2]));
  }

  return null;
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function monthFromName(name: string): number | null {
  const index = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return index === -1 ? null : index + 1;
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects impossible dates like 31 February, which roll over.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** Parses an amount cell, coping with currency symbols, commas and (100) negatives. */
export function parseAmountCell(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;

  // Accountancy style: parentheses mean negative.
  const negated = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[()]/g, "").replace(/[^0-9.,\-]/g, "");
  if (!cleaned) return null;

  // Treat "1.234,56" as European when a comma trails the final dot.
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  const normalised =
    lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");

  const parsed = Number.parseFloat(normalised);
  if (!Number.isFinite(parsed)) return null;

  return negated ? -Math.abs(parsed) : parsed;
}

/**
 * Keyword rules, applied only when the household's own history has nothing to
 * say. Keys are matched against the description, values against the names of
 * categories that actually exist.
 */
/*
 * Short tokens are anchored with word boundaries. Without them "NETFLIX"
 * contains the letters "tfl" and was being filed under Transport.
 */
const KEYWORD_RULES: { pattern: RegExp; category: string }[] = [
  { pattern: /\b(netflix|spotify|disney\+?|hbo|prime\s?video|itunes|xbox|playstation|youtube|audible|chatgpt|openai|anthropic|claude|ionos|supabase)\b|apple\.com\/bill/i, category: "Subscriptions" },
  { pattern: /\b(tesco|sainsbur\w*|asda|aldi|lidl|morrisons?|waitrose|co-?op|iceland|ocado)\b/i, category: "Groceries" },
  { pattern: /\b(uber\s?eats|deliveroo|just\s?eat|mcdonalds?|greggs|costa|starbucks|pret|nandos?|dominos?)\b/i, category: "Food & Drink" },
  { pattern: /\b(uber|bolt|lyft|tfl|trainline|national\s?rail|lner|gwr|shell|bp|esso|texaco|parking|ringgo)\b/i, category: "Transport" },
  { pattern: /\b(rent|mortgage|council\s?tax|british\s?gas|octopus|edf|eon|thames\s?water|virgin\s?media|sky|vodafone|o2|three|ee|bt)\b/i, category: "Rent & Bills" },
  { pattern: /\b(boots|superdrug|pharmacy|nhs|dentist|optic\w*|bupa)\b/i, category: "Health" },
  { pattern: /\b(h&m|zara|primark|next|asos|uniqlo|nike|adidas|sports\s?direct)\b/i, category: "Clothing" },
  { pattern: /\b(gym|puregym|fitness|leisure)\b/i, category: "Subscriptions" },
  { pattern: /\b(amazon|argos|ebay|etsy|ikea|currys|john\s?lewis)\b/i, category: "Other" },
];

export type HistoryEntry = { merchant: string; categoryId: string };

/**
 * Removes identifiers a statement carries that a budget app has no business
 * storing: card numbers, sort codes, account numbers, IBANs. Applied before a
 * description is ever persisted or returned to the client.
 */
export function redact(value: string): string {
  return value
    // 13-19 digit card numbers, spaced or grouped. The separator sits between
    // digits rather than after the last one, so trailing whitespace survives.
    .replace(/\b\d(?:[ -]?\d){12,18}\b/g, (match) => {
      const digits = match.replace(/\D/g, "");
      return digits.length >= 13 ? `••••${digits.slice(-4)}` : match;
    })
    // Sort code 12-34-56.
    .replace(/\b\d{2}-\d{2}-\d{2}\b/g, "••-••-••")
    // IBAN.
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, "••••")
    // A bare 8-digit account number.
    .replace(/\b\d{8}\b/g, "••••")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalised for comparison: lowercase, no card noise, no punctuation. */
export function normaliseDescription(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(card|payment|purchase|pos|contactless|visa|mastercard|ref|on)\b/g, " ")
    .replace(/\d{2}[/\-.]\d{2}([/\-.]\d{2,4})?/g, " ")
    .replace(/\*+/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chooses a category: the household's own history first, since it reflects how
 * these two people actually classify things, then generic keyword rules.
 */
export function categorise(
  description: string,
  categories: Category[],
  history: HistoryEntry[],
): { categoryId: string | null; source: ParsedRow["categorySource"] } {
  const normalised = normaliseDescription(description);
  if (!normalised) return { categoryId: null, source: null };

  for (const entry of history) {
    const merchant = normaliseDescription(entry.merchant);
    if (!merchant) continue;
    if (normalised === merchant || normalised.includes(merchant) || merchant.includes(normalised)) {
      return { categoryId: entry.categoryId, source: "history" };
    }
  }

  for (const rule of KEYWORD_RULES) {
    if (!rule.pattern.test(description)) continue;
    const match = categories.find(
      (c) => c.kind === "expense" && c.name.toLowerCase() === rule.category.toLowerCase(),
    );
    if (match) return { categoryId: match.id, source: "keyword" };
  }

  return { categoryId: null, source: null };
}

/** Same day, same amount, same-ish description — almost certainly already logged. */
export function duplicateKey(date: string, amount: number, description: string): string {
  return `${date}|${amount.toFixed(2)}|${normaliseDescription(description).slice(0, 24)}`;
}

const LINE_DATE =
  /^(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,}\.?\s*\d{0,4})/;

/** A trailing money value, optionally signed or marked CR/DR. */
const TRAILING_MONEY = /(-?£?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?£?\s?\d+\.\d{2})\s*(CR|DR)?$/i;

/**
 * Reshapes the text lines of a PDF statement into [date, description, amount]
 * rows, so they flow through exactly the same review pipeline as a CSV.
 *
 * PDF statements have no schema — this is deliberately conservative. A line is
 * only taken when it starts with a date and ends with a money value; anything
 * else is skipped rather than guessed at. Whatever it does produce still goes
 * through the review screen before a single row is saved.
 */
export function parseStatementLines(lines: string[]): string[][] {
  const rows: string[][] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const dateMatch = line.match(LINE_DATE);
    if (!dateMatch) continue;
    if (!parseDate(dateMatch[1])) continue;

    let rest = line.slice(dateMatch[1].length).trim();

    // Statements usually print "amount balance". Peel the trailing figures off;
    // the last one is the running balance whenever two are present.
    const figures: { value: string; credit: boolean }[] = [];
    for (let i = 0; i < 2; i++) {
      const money = rest.match(TRAILING_MONEY);
      if (!money) break;
      figures.unshift({ value: money[1], credit: /CR/i.test(money[2] ?? "") });
      rest = rest.slice(0, money.index).trim();
    }

    if (figures.length === 0) continue;
    const chosen = figures[0];

    const description = redact(rest) || "Imported";
    if (!description || description === "Imported") {
      // A line with a date and a number but no payee is almost always a
      // balance brought-forward row.
      continue;
    }

    // Statements print outgoings unsigned, so default to an expense unless the
    // line is explicitly marked as a credit. The review screen can flip it.
    // The trailing-money pattern only matches comma-as-thousands, so stripping
    // commas here is safe.
    const amount = chosen.value.replace(/[£\s,]/g, "");
    const signed = chosen.credit || amount.startsWith("-") ? amount.replace("-", "") : `-${amount}`;

    rows.push([dateMatch[1], description, signed]);
  }

  return rows;
}

/** Fixed layout produced by parseStatementLines. */
export const TEXT_COLUMNS: ColumnMap = {
  date: 0,
  description: 1,
  amount: 2,
  debit: -1,
  credit: -1,
};

export type BuildArgs = {
  rows: string[][];
  columns: ColumnMap;
  hasHeader: boolean;
  categories: Category[];
  history: HistoryEntry[];
  existingKeys: Set<string>;
};

/** Folds raw spreadsheet rows into reviewable transactions. */
export function buildRows({
  rows,
  columns,
  hasHeader,
  categories,
  history,
  existingKeys,
}: BuildArgs): ParsedRow[] {
  const body = hasHeader ? rows.slice(1) : rows;
  const out: ParsedRow[] = [];
  const seen = new Set<string>();

  body.forEach((row, index) => {
    const cell = (i: number) => (i >= 0 && i < row.length ? row[i] : "");

    const date = parseDate(cell(columns.date));
    // Redacted here as well as in the PDF path, so a CSV carrying card numbers
    // in its description column is cleaned before it can be stored.
    const description = redact(cell(columns.description)) || "Imported";

    // Either one signed column, or a debit/credit pair.
    let signed: number | null = null;
    if (columns.amount >= 0) signed = parseAmountCell(cell(columns.amount));

    if (signed === null || signed === 0) {
      const debit = columns.debit >= 0 ? parseAmountCell(cell(columns.debit)) : null;
      const credit = columns.credit >= 0 ? parseAmountCell(cell(columns.credit)) : null;
      if (debit) signed = -Math.abs(debit);
      else if (credit) signed = Math.abs(credit);
    }

    if (signed === null || signed === 0 || !date) return;

    const kind = signed < 0 ? "expense" : "income";
    const amount = Math.abs(signed);
    const { categoryId, source } = categorise(description, categories, history);

    const key = duplicateKey(date, amount, description);
    // Guard against the same line appearing twice in one file, too.
    const duplicate = existingKeys.has(key) || seen.has(key);
    seen.add(key);

    out.push({
      index,
      date,
      description: description.slice(0, 120),
      amount,
      kind,
      categoryId,
      categorySource: source,
      duplicate,
      // Expenses are the point of the import; income and duplicates are
      // opt-in so nothing unexpected lands in the totals.
      include: !duplicate && kind === "expense",
    });
  });

  return out;
}
