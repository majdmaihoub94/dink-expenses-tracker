import "server-only";

import { cycleBounds, cycleProgress, recentCycles, type Cycle } from "@/lib/cycle";
import {
  buildBudgetPace,
  buildForecast,
  buildSmartAllocation,
  resolveSavingsTarget,
  type Allocation,
  type BudgetPace,
  type CycleSample,
  type Forecast,
} from "@/lib/budget";
import { buildBudgetAiInput, type BudgetAiInput } from "@/lib/budget-ai";
import {
  getCycleCategoryTrend,
  getCycleTrend,
  getHouseholdBudget,
  getPlanned,
  getSavingsContributions,
  getTransactions,
  totalsFor,
  type CycleTotals,
} from "@/lib/data";
import type { Category, Household, HouseholdBudget, PaymentMethod, Profile } from "@/lib/types";

/**
 * Everything the budget page (and the "refresh insights" action) need,
 * assembled in one place so both compute the exact same numbers from the
 * exact same queries. Pure calculation lives in `lib/budget.ts`; this file's
 * only job is fetching and wiring it together.
 */

/** Completed cycles sampled for history/forecast, on top of the one being viewed. */
const FORECAST_CYCLES = 6;
/**
 * How many samples the smart allocation averages per category — completed
 * cycles plus, once there's enough of it to extrapolate, the current cycle
 * itself. A household with little or no cycle history yet still gets a
 * sensible suggestion from what's actually happening right now, rather than
 * a near-zero average of almost nothing.
 */
const ALLOCATION_SAMPLES = 3;
/** Don't extrapolate the current cycle to a full-cycle figure until it's at least this far along. */
const CURRENT_CYCLE_MIN_ELAPSED = 0.15;

export type BudgetContext = {
  budget: HouseholdBudget | null;
  income: number;
  savingsTarget: number;
  totals: CycleTotals;
  allocation: Allocation;
  pace: BudgetPace;
  forecast: Forecast;
  /** null when the household hasn't set up a budget yet — nothing meaningful to send the model. */
  aiInput: BudgetAiInput | null;
  trend: { key: string; label: string; expense: number; income: number; saved: number }[];
};

export async function loadBudgetContext({
  household,
  members,
  categories,
  paymentMethods,
  cycle,
}: {
  household: Household;
  members: Profile[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  cycle: Cycle;
}): Promise<BudgetContext> {
  const labelMode = household.cycle_label_mode;
  // Oldest first, current cycle last.
  const historyCycles = recentCycles(cycle, FORECAST_CYCLES + 1, labelMode);
  const completedCycles = historyCycles.slice(0, -1);

  const [budget, transactions, allContributions, categoryTrend, cycleTrend, planned] = await Promise.all([
    getHouseholdBudget(household.id),
    getTransactions(household.id, cycle),
    getSavingsContributions(household.id),
    getCycleCategoryTrend(household.id, historyCycles),
    getCycleTrend(household.id, historyCycles),
    getPlanned(household.id, cycle),
  ]);

  // Known, exact recurring bills — rent, a loan, a subscription — rather
  // than a guess from noisy history. These are what "fixed" means on the
  // Budget page: Planned expenses is the household's own source of truth.
  const fixedByCategory = new Map<string, number>();
  for (const expense of planned.expenses) {
    if (!expense.category_id) continue;
    fixedByCategory.set(
      expense.category_id,
      (fixedByCategory.get(expense.category_id) ?? 0) + Number(expense.amount),
    );
  }

  const bounds = cycleBounds(cycle);
  const contributions = allContributions.filter(
    (c) => c.occurred_on >= bounds.from && c.occurred_on <= bounds.to,
  );
  const totals = totalsFor(transactions, contributions);
  const elapsed = cycleProgress(cycle);

  // Prefer what's actually landed this cycle over a number typed into the
  // setup form once — income is real data the moment it's logged, and a
  // stale manual figure is worse than the truth. The manual figure only
  // covers the gap before anything has been logged yet (e.g. the first few
  // days before payday).
  const income = totals.income > 0 ? totals.income : (budget?.monthly_income ?? 0);
  const savingsTarget = budget ? resolveSavingsTarget(budget, income) : 0;

  // Averaged from recent completed cycles, plus — once it's far enough along
  // to extrapolate sensibly — this cycle's own pace, projected to a full
  // cycle. That keeps a brand new household (with little or no completed
  // history) from getting a near-zero suggestion while real spending is
  // already happening; it converges toward pure history as more cycles land.
  const completedSampleCount = elapsed >= CURRENT_CYCLE_MIN_ELAPSED ? ALLOCATION_SAMPLES - 1 : ALLOCATION_SAMPLES;
  const recentForAllocation = completedCycles.slice(-completedSampleCount);

  const historicalByCategory = new Map<string, number>();
  for (const category of categories) {
    const samples = recentForAllocation.map((c) => categoryTrend.get(c.key)?.get(category.id) ?? 0);
    if (elapsed >= CURRENT_CYCLE_MIN_ELAPSED) {
      const spentThisCycle = totals.byCategory.get(category.id) ?? 0;
      samples.push(spentThisCycle / elapsed);
    }
    const average = samples.length ? samples.reduce((sum, v) => sum + v, 0) / samples.length : 0;
    historicalByCategory.set(category.id, average);
  }

  const allocation = buildSmartAllocation({
    income,
    savingsTarget,
    categories,
    historicalByCategory,
    spentByCategory: totals.byCategory,
    fixedByCategory,
  });

  const pace = buildBudgetPace({
    cycle,
    currency: household.currency,
    spendable: allocation.spendable,
    spentSoFar: totals.expense,
    allocation,
  });

  const savedByCycle = new Map<string, number>();
  for (const c of historyCycles) {
    const b = cycleBounds(c);
    const saved = allContributions
      .filter((row) => row.occurred_on >= b.from && row.occurred_on <= b.to)
      .reduce((sum, row) => sum + Number(row.amount), 0);
    savedByCycle.set(c.key, saved);
  }

  const samples: CycleSample[] = completedCycles.map((c) => {
    const row = cycleTrend.find((t) => t.cycle.key === c.key);
    return {
      cycle: c,
      income: row?.income ?? 0,
      expense: row?.expense ?? 0,
      saved: savedByCycle.get(c.key) ?? 0,
    };
  });

  const forecast = buildForecast({ samples, categories, categoryHistory: categoryTrend });

  // Average transaction size per category this cycle — lets the model
  // translate a cash figure into "about N more of these" instead of just a £.
  const categoryStats = new Map<string, { count: number; avgAmount: number }>();
  for (const t of transactions) {
    if (t.kind !== "expense" || !t.category_id) continue;
    const amount = Number(t.amount);
    const existing = categoryStats.get(t.category_id);
    if (existing) {
      existing.avgAmount = (existing.avgAmount * existing.count + amount) / (existing.count + 1);
      existing.count += 1;
    } else {
      categoryStats.set(t.category_id, { count: 1, avgAmount: amount });
    }
  }

  // Credit cards, with how much of their limit is currently drawn — so the
  // model can tell "the limit reset" apart from "there's more to spend".
  const creditCards = paymentMethods
    .filter((m) => m.type === "credit" && !m.archived)
    .map((m) => {
      const spentThisCycle = totals.byPaymentMethod.get(m.id) ?? 0;
      const limit = m.credit_limit ? Number(m.credit_limit) : null;
      return {
        name: m.name,
        limit,
        spentThisCycle,
        utilizationPercent: limit && limit > 0 ? Math.round((spentThisCycle / limit) * 1000) / 10 : null,
      };
    });

  const aiInput = budget
    ? buildBudgetAiInput({
        currency: household.currency,
        cycleLabel: cycle.label,
        today: new Date().toISOString().slice(0, 10),
        cycleEnd: bounds.to,
        income,
        budget,
        spentSoFar: totals.expense,
        allocation,
        pace,
        forecast,
        categoryStats,
        creditCards,
        partnerCount: members.length,
      })
    : null;

  const trend = cycleTrend.map((t) => ({
    key: t.cycle.key,
    label: t.cycle.shortLabel,
    expense: t.expense,
    income: t.income,
    saved: savedByCycle.get(t.cycle.key) ?? 0,
  }));

  return { budget, income, savingsTarget, totals, allocation, pace, forecast, aiInput, trend };
}
