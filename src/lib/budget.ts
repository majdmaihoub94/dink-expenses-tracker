import { cycleProgress, daysRemaining, type Cycle } from "@/lib/cycle";
import { money } from "@/lib/format";
import type { Category, HouseholdBudget } from "@/lib/types";

/**
 * The rule-based budgeting engine. Everything here runs from the household's
 * own numbers — no AI required, so the feature still works end to end
 * without an ANTHROPIC_API_KEY. `lib/budget-ai.ts` layers personalised,
 * UK / Isle of Man specific wording on top of the same numbers when a key is
 * available.
 */

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Name fragments that mark a category as a need rather than a want. Matched
 * case-insensitively — good enough across the mixed built-in + custom
 * categories every household ends up with. */
const ESSENTIAL_KEYWORDS = [
  "rent",
  "mortgage",
  "bill",
  "utilit",
  "council tax",
  "rates",
  "grocery",
  "groceries",
  "transport",
  "fuel",
  "petrol",
  "insurance",
  "health",
  "medical",
  "childcare",
  "school",
];

/**
 * A category is essential either because its name says so, or — more
 * reliably — because it has a known fixed/recurring bill against it (rent,
 * a loan repayment, a subscription…) logged in Planned expenses. That data
 * is exact, so it always wins over a name guess: a category called "Loan"
 * would otherwise be read as discretionary just because "loan" isn't in the
 * keyword list.
 */
export function isEssentialCategory(
  category: Pick<Category, "id" | "name">,
  fixedCategoryIds?: Set<string>,
): boolean {
  if (fixedCategoryIds?.has(category.id)) return true;
  const name = category.name.toLowerCase();
  return ESSENTIAL_KEYWORDS.some((kw) => name.includes(kw));
}

/** Resolves the household's savings target to a cash figure for one cycle. */
export function resolveSavingsTarget(budget: HouseholdBudget, income = budget.monthly_income): number {
  if (budget.savings_target_type === "amount") return Math.max(budget.savings_target_value, 0);
  return Math.max((income * budget.savings_target_value) / 100, 0);
}

// ---------------------------------------------------------------------------
// Smart allocation — "here's what to cap each category at"
// ---------------------------------------------------------------------------

export type AllocationRow = {
  category: Category;
  essential: boolean;
  /** Average actual spend in this category over recent cycles. */
  historical: number;
  /** This cycle's suggested cap. */
  suggested: number;
  /** Actual spend so far this cycle. */
  spent: number;
  /**
   * Sum of active Planned expenses (rent, a loan, a subscription…) booked
   * against this category — a known, exact commitment rather than an
   * estimate. 0 if none. When set, it's what `suggested` is built from, not
   * the noisy historical average, and it's never scaled down: a fixed
   * obligation doesn't get cheaper just because the cycle is tight.
   */
  fixedAmount: number;
};

export type Allocation = {
  rows: AllocationRow[];
  spendable: number;
  essentialTotal: number;
  discretionaryTotal: number;
  /** Spendable left over once every suggestion is totalled — a buffer, not a target. */
  unallocated: number;
  /** True when the *variable* portion of essentials had to be scaled down to fit. */
  tight: boolean;
  /** True when known fixed bills alone already exceed what's spendable — no amount of trimming variable spend fixes this. */
  overCommitted: boolean;
  /** Sum of every category's fixedAmount — the household's known, non-negotiable monthly commitment. */
  fixedTotal: number;
};

/**
 * Splits `income - savingsTarget` across categories. Fixed bills (rent, a
 * loan, anything with an active Planned expense) are funded at their exact,
 * known amount — never averaged, never scaled down. Essentials without a
 * fixed bill behind them (groceries, fuel…) are funded close to what they
 * actually cost, scaled down only if fixed bills + those together would
 * exceed what's spendable. Whatever's left after all of that is shared
 * across discretionary categories in proportion to how they've actually
 * been spending — trimmed if that's more than is left, capped at a 10%
 * cushion over history if there's room to spare. A category with a manually
 * set cap always keeps it, overriding everything above.
 */
export function buildSmartAllocation({
  income,
  savingsTarget,
  categories,
  historicalByCategory,
  spentByCategory,
  fixedByCategory = new Map(),
}: {
  income: number;
  savingsTarget: number;
  categories: Category[];
  historicalByCategory: Map<string, number>;
  spentByCategory: Map<string, number>;
  /** category id → sum of active Planned expenses' amount for that category. */
  fixedByCategory?: Map<string, number>;
}): Allocation {
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const spendable = Math.max(income - savingsTarget, 0);
  const fixedCategoryIds = new Set(fixedByCategory.keys());

  const essentials = expenseCategories.filter((c) => isEssentialCategory(c, fixedCategoryIds));
  const discretionary = expenseCategories.filter((c) => !isEssentialCategory(c, fixedCategoryIds));

  const fixedEssentials = essentials.filter((c) => (fixedByCategory.get(c.id) ?? 0) > 0);
  const variableEssentials = essentials.filter((c) => (fixedByCategory.get(c.id) ?? 0) === 0);

  const fixedTotal = fixedEssentials.reduce((sum, c) => sum + (fixedByCategory.get(c.id) ?? 0), 0);
  const variableEssentialHistoricalTotal = variableEssentials.reduce(
    (sum, c) => sum + (historicalByCategory.get(c.id) ?? 0),
    0,
  );
  const discretionaryHistoricalTotal = discretionary.reduce(
    (sum, c) => sum + (historicalByCategory.get(c.id) ?? 0),
    0,
  );

  // Fixed bills are paid first, in full, no matter what — they're not a
  // guess to trim. Only the variable-essential portion ever gets scaled.
  const overCommitted = fixedTotal > spendable;
  const roomForVariableEssentials = Math.max(spendable - fixedTotal, 0);
  const tight =
    variableEssentialHistoricalTotal > 0 &&
    variableEssentialHistoricalTotal > roomForVariableEssentials * 0.9;
  const variableEssentialScale = tight
    ? (roomForVariableEssentials * 0.9) / variableEssentialHistoricalTotal
    : 1;
  const variableEssentialSuggestedTotal = variableEssentialHistoricalTotal * variableEssentialScale;

  const discretionarySpendable = Math.max(
    spendable - fixedTotal - variableEssentialSuggestedTotal,
    0,
  );
  const discretionaryScale =
    discretionaryHistoricalTotal > 0
      ? Math.min(discretionarySpendable / discretionaryHistoricalTotal, 1.1)
      : 1;

  const round = (n: number) => Math.round(n * 100) / 100;

  const rows: AllocationRow[] = expenseCategories.map((category) => {
    const essential = isEssentialCategory(category, fixedCategoryIds);
    const historical = historicalByCategory.get(category.id) ?? 0;
    const fixedAmount = fixedByCategory.get(category.id) ?? 0;
    const scale = essential ? variableEssentialScale : discretionaryScale;
    const suggested = category.monthly_budget
      ? Number(category.monthly_budget)
      : fixedAmount > 0
        ? fixedAmount
        : round(historical * scale);
    return {
      category,
      essential,
      historical,
      suggested,
      spent: spentByCategory.get(category.id) ?? 0,
      fixedAmount,
    };
  });

  const essentialTotal = rows.filter((r) => r.essential).reduce((s, r) => s + r.suggested, 0);
  const discretionaryTotal = rows.filter((r) => !r.essential).reduce((s, r) => s + r.suggested, 0);

  return {
    rows: rows.sort((a, b) => b.suggested - a.suggested),
    spendable,
    essentialTotal,
    discretionaryTotal,
    unallocated: Math.max(spendable - essentialTotal - discretionaryTotal, 0),
    tight,
    overCommitted,
    fixedTotal,
  };
}

// ---------------------------------------------------------------------------
// Adaptive pace + recovery — "you've spent more this weekend, do this"
// ---------------------------------------------------------------------------

export type PaceStatus = "ahead" | "onpace" | "behind";

export type RecoveryAction = {
  id: string;
  emoji: string;
  title: string;
  body: string;
};

export type BudgetPace = {
  status: PaceStatus;
  elapsed: number;
  daysLeft: number;
  idealSpendSoFar: number;
  actualSpendSoFar: number;
  /** actual − ideal. Positive = behind pace, negative = ahead. */
  overspend: number;
  /** What's left to spend, spread evenly over the days remaining. */
  safeToSpendPerDay: number;
  actions: RecoveryAction[];
};

/** How far off pace (as a share of what's spendable) before it counts as "behind". */
const PACE_TOLERANCE = 0.06;

export function buildBudgetPace({
  cycle,
  currency,
  spendable,
  spentSoFar,
  allocation,
}: {
  cycle: Cycle;
  currency: string;
  spendable: number;
  spentSoFar: number;
  allocation: Allocation;
}): BudgetPace {
  const elapsed = cycleProgress(cycle);
  const daysLeft = daysRemaining(cycle);
  const idealSpendSoFar = spendable * elapsed;
  const overspend = spentSoFar - idealSpendSoFar;
  const tolerance = Math.max(spendable * PACE_TOLERANCE, 10);

  const status: PaceStatus = overspend > tolerance ? "behind" : overspend < -tolerance ? "ahead" : "onpace";

  const remaining = Math.max(spendable - spentSoFar, 0);
  const safeToSpendPerDay = daysLeft > 0 ? remaining / daysLeft : 0;

  const actions: RecoveryAction[] = [];
  const m = (n: number) => money(n, currency);

  if (status === "behind" && elapsed > 0) {
    const overCategories = allocation.rows
      .filter((r) => r.suggested > 0)
      .map((r) => ({ row: r, over: r.spent - r.suggested * elapsed }))
      .filter((x) => x.over > Math.max(x.row.suggested * 0.15, 5))
      .sort((a, b) => b.over - a.over)
      .slice(0, 2);

    for (const { row, over } of overCategories) {
      actions.push({
        id: `trim-${row.category.id}`,
        emoji: row.category.emoji,
        title: `Ease off ${row.category.name} for the rest of the cycle`,
        body: `${m(row.spent)} spent against a ${m(row.suggested)} guide for the full cycle — about ${m(
          over,
        )} ahead of where today's pace should have it. Holding off here recovers fastest.`,
      });
    }

    const headroom = allocation.rows
      .filter((r) => !r.essential && r.suggested > 0)
      .map((r) => ({ row: r, room: r.suggested * elapsed - r.spent }))
      .filter((x) => x.room > 5)
      .sort((a, b) => b.room - a.room)[0];

    if (headroom) {
      actions.push({
        id: `headroom-${headroom.row.category.id}`,
        emoji: "🧭",
        title: `${headroom.row.category.name} still has room`,
        body: `${m(
          headroom.room,
        )} of this cycle's guide is unused there — a better place for anything discretionary than a category that's already over.`,
      });
    }

    if (daysLeft > 0) {
      actions.push({
        id: "daily-recover",
        emoji: "🎯",
        title: `${m(safeToSpendPerDay)} a day gets you back on track`,
        body: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left to close a ${m(
          overspend,
        )} gap. Sticking to that daily figure still lands the savings target by the end of the cycle.`,
      });
    }
  }

  return { status, elapsed, daysLeft, idealSpendSoFar, actualSpendSoFar: spentSoFar, overspend, safeToSpendPerDay, actions };
}

// ---------------------------------------------------------------------------
// Long-term forecast — "here's where this is heading"
// ---------------------------------------------------------------------------

export type CycleSample = { cycle: Cycle; income: number; expense: number; saved: number };

export type CategoryTrend = {
  category: Category;
  recentAverage: number;
  priorAverage: number;
  changeRatio: number | null;
};

export type Forecast = {
  cyclesSampled: number;
  averageIncome: number;
  averageExpense: number;
  averageSaved: number;
  projectedAnnualSavings: number;
  /** Recent-half savings rate minus prior-half — positive means improving. */
  savingsRateTrend: number | null;
  risingCategories: CategoryTrend[];
  fallingCategories: CategoryTrend[];
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * A deliberately simple trend: split the sampled cycles in half and compare
 * "lately" against "further back". No regression library required, and it
 * reads the same way a person would eyeball six bars on a chart.
 */
export function buildForecast({
  samples,
  categories,
  categoryHistory,
}: {
  /** Completed cycles, oldest first. */
  samples: CycleSample[];
  categories: Category[];
  /** cycle key → category id → expense total for that cycle. */
  categoryHistory: Map<string, Map<string, number>>;
}): Forecast {
  const n = samples.length;
  const averageIncome = average(samples.map((s) => s.income));
  const averageExpense = average(samples.map((s) => s.expense));
  const averageSaved = average(samples.map((s) => s.saved));

  const half = Math.floor(n / 2);
  const priorSamples = samples.slice(0, half);
  const recentSamples = samples.slice(half);

  const rate = (rows: CycleSample[]) => {
    const income = rows.reduce((s, c) => s + c.income, 0);
    const saved = rows.reduce((s, c) => s + c.saved, 0);
    return income > 0 ? saved / income : null;
  };

  const priorRate = priorSamples.length ? rate(priorSamples) : null;
  const recentRate = recentSamples.length ? rate(recentSamples) : null;
  const savingsRateTrend = priorRate !== null && recentRate !== null ? recentRate - priorRate : null;

  const trends: CategoryTrend[] = categories
    .filter((c) => c.kind === "expense")
    .map((category) => {
      const priorAverage = average(
        priorSamples.map((s) => categoryHistory.get(s.cycle.key)?.get(category.id) ?? 0),
      );
      const recentAverage = average(
        recentSamples.map((s) => categoryHistory.get(s.cycle.key)?.get(category.id) ?? 0),
      );
      const changeRatio = priorAverage > 0 ? (recentAverage - priorAverage) / priorAverage : null;
      return { category, recentAverage, priorAverage, changeRatio };
    })
    .filter((t) => t.recentAverage > 0 || t.priorAverage > 0);

  const risingCategories = trends
    .filter((t) => t.changeRatio !== null && t.changeRatio > 0.12 && t.recentAverage > 10)
    .sort((a, b) => (b.changeRatio ?? 0) - (a.changeRatio ?? 0))
    .slice(0, 3);

  const fallingCategories = trends
    .filter((t) => t.changeRatio !== null && t.changeRatio < -0.12 && t.priorAverage > 10)
    .sort((a, b) => (a.changeRatio ?? 0) - (b.changeRatio ?? 0))
    .slice(0, 3);

  return {
    cyclesSampled: n,
    averageIncome,
    averageExpense,
    averageSaved,
    projectedAnnualSavings: averageSaved * 12,
    savingsRateTrend,
    risingCategories,
    fallingCategories,
  };
}

// ---------------------------------------------------------------------------
// UK / Isle of Man habits — evergreen, shown even without AI
// ---------------------------------------------------------------------------

export type Tip = { id: string; emoji: string; title: string; body: string };

export const UK_IOM_TIPS: Tip[] = [
  {
    id: "manx-utilities",
    emoji: "💡",
    title: "Check your electricity rate directly",
    body: "The Isle of Man sits outside Ofgem's UK price cap — Manx Utilities sets its own tariffs. Review the rate at each renewal rather than assuming a cap is protecting you.",
  },
  {
    id: "regular-saver",
    emoji: "🏦",
    title: "A regular saver beats an ISA here",
    body: "ISAs are a UK tax wrapper most Manx residents can't hold. A bank regular-saver (Isle of Man Bank, Nationwide IOM, Cumberland) often pays a better guaranteed rate for a fixed monthly amount.",
  },
  {
    id: "tax-code-check",
    emoji: "🧾",
    title: "Recheck your tax code every April",
    body: "Isle of Man income tax bands and personal allowances are set separately from the UK's and change with each Budget. A quick check on gov.im after April catches over- or under-payment early.",
  },
  {
    id: "ni-record",
    emoji: "📇",
    title: "Isle of Man National Insurance is its own scheme",
    body: "If either of you has worked on both sides of the water, check your contribution record on gov.im — qualifying years can slip through the gap between the two systems.",
  },
  {
    id: "no-cgt-iht",
    emoji: "📈",
    title: "No local capital gains or inheritance tax",
    body: "That changes the maths on where extra savings should go — a plain high-interest account can outperform UK products whose main selling point is a tax shelter that doesn't apply here.",
  },
  {
    id: "ferry-flights",
    emoji: "🚢",
    title: "Book travel 6–8 weeks ahead",
    body: "Steam Packet fares and flights on and off the Island are usually cheapest booked early and off-peak. If travel is a recurring line for you both, this is one of the largest single savings available.",
  },
  {
    id: "supermarket-compare",
    emoji: "🛒",
    title: "Compare the on-island supermarkets on your basket",
    body: "Shoprite, Tesco, Robinsons and the Co-op price differently. A few cycles of receipts logged here shows which is actually cheapest for what you buy, not just which feels cheapest.",
  },
  {
    id: "onisland-rates",
    emoji: "🔍",
    title: "Re-shop savings rates twice a year",
    body: "Isle of Man Bank, Nationwide IOM, Cumberland and Conister move their regular-saver rates periodically. A five-minute check every six months is often worth more than switching current accounts.",
  },
];
