import type { TxnKind } from "@/lib/types";

/** A name you have used before, with the details you usually pair with it. */
export type MerchantSuggestion = {
  name: string;
  count: number;
  /** Amounts used for this name, most frequent first. */
  amounts: number[];
  categoryId: string | null;
  paymentMethodId: string | null;
};

export type SuggestionIndex = {
  merchants: MerchantSuggestion[];
  /** Common amounts per category id, most frequent first. */
  amountsByCategory: Record<string, number[]>;
  /** Common amounts across everything, for when nothing is selected yet. */
  topAmounts: number[];
};

export const EMPTY_SUGGESTIONS: SuggestionIndex = {
  merchants: [],
  amountsByCategory: {},
  topAmounts: [],
};

export type SuggestionRow = {
  merchant: string | null;
  amount: number | string;
  category_id: string | null;
  payment_method_id: string | null;
  kind: TxnKind;
  occurred_on: string;
};

/** Most frequent first, ties broken by whichever was seen most recently. */
function rankByFrequency<T>(entries: Map<T, { count: number; lastSeen: number }>, limit: number): T[] {
  return [...entries.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].lastSeen - a[1].lastSeen)
    .slice(0, limit)
    .map(([value]) => value);
}

function bump<T>(map: Map<T, { count: number; lastSeen: number }>, key: T, index: number) {
  const current = map.get(key);
  if (current) {
    current.count += 1;
    // Rows arrive newest first, so a lower index means more recent.
    current.lastSeen = Math.max(current.lastSeen, -index);
  } else {
    map.set(key, { count: 1, lastSeen: -index });
  }
}

/**
 * Folds recent expenses into the autocomplete index. Kept pure so it can run
 * anywhere and be reasoned about without a database.
 *
 * `rows` must be newest first — recency breaks frequency ties.
 */
export function buildSuggestions(rows: SuggestionRow[]): SuggestionIndex {
  type Bucket = {
    name: string;
    count: number;
    amounts: Map<number, { count: number; lastSeen: number }>;
    categories: Map<string, { count: number; lastSeen: number }>;
    methods: Map<string, { count: number; lastSeen: number }>;
    lastSeen: number;
  };

  const byName = new Map<string, Bucket>();
  const amountsByCategory = new Map<string, Map<number, { count: number; lastSeen: number }>>();
  const allAmounts = new Map<number, { count: number; lastSeen: number }>();

  rows.forEach((row, index) => {
    if (row.kind !== "expense") return;

    const amount = Math.round(Number(row.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return;

    bump(allAmounts, amount, index);

    if (row.category_id) {
      if (!amountsByCategory.has(row.category_id)) amountsByCategory.set(row.category_id, new Map());
      bump(amountsByCategory.get(row.category_id)!, amount, index);
    }

    const raw = row.merchant?.trim();
    if (!raw) return;

    // Case-insensitive key, but keep the most recent spelling for display.
    const key = raw.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, {
        name: raw,
        count: 0,
        amounts: new Map(),
        categories: new Map(),
        methods: new Map(),
        lastSeen: -index,
      });
    }

    const bucket = byName.get(key)!;
    bucket.count += 1;
    bump(bucket.amounts, amount, index);
    if (row.category_id) bump(bucket.categories, row.category_id, index);
    if (row.payment_method_id) bump(bucket.methods, row.payment_method_id, index);
  });

  const merchants: MerchantSuggestion[] = [...byName.values()]
    .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
    .slice(0, 60)
    .map((bucket) => ({
      name: bucket.name,
      count: bucket.count,
      amounts: rankByFrequency(bucket.amounts, 4),
      categoryId: rankByFrequency(bucket.categories, 1)[0] ?? null,
      paymentMethodId: rankByFrequency(bucket.methods, 1)[0] ?? null,
    }));

  return {
    merchants,
    amountsByCategory: Object.fromEntries(
      [...amountsByCategory.entries()].map(([id, amounts]) => [id, rankByFrequency(amounts, 5)]),
    ),
    topAmounts: rankByFrequency(allAmounts, 5),
  };
}

/**
 * Names matching what has been typed. Prefix matches rank above mid-string
 * ones, so typing "co" offers "Costa" before "Tesco".
 */
export function matchMerchants(
  suggestions: MerchantSuggestion[],
  query: string,
  limit = 6,
): MerchantSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return suggestions.slice(0, limit);

  return suggestions
    .map((suggestion) => {
      const name = suggestion.name.toLowerCase();
      if (name === q) return { suggestion, rank: 0 };
      if (name.startsWith(q)) return { suggestion, rank: 1 };
      if (name.includes(q)) return { suggestion, rank: 2 };
      return null;
    })
    .filter((entry): entry is { suggestion: MerchantSuggestion; rank: number } => entry !== null)
    .sort((a, b) => a.rank - b.rank || b.suggestion.count - a.suggestion.count)
    .slice(0, limit)
    .map((entry) => entry.suggestion);
}

/** The amounts worth offering, narrowing as the form gets more specific. */
export function suggestedAmounts(
  index: SuggestionIndex,
  { merchant, categoryId }: { merchant?: MerchantSuggestion | null; categoryId?: string | null },
): number[] {
  if (merchant?.amounts.length) return merchant.amounts;
  if (categoryId && index.amountsByCategory[categoryId]?.length) {
    return index.amountsByCategory[categoryId];
  }
  return index.topAmounts;
}
