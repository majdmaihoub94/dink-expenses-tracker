import { CycleSwitcher } from "@/components/CycleSwitcher";
import { StatsView, type CategoryRow, type PersonRow } from "@/components/StatsView";
import { cycleBounds, isCurrentCycle, recentCycles, shiftCycle } from "@/lib/cycle";
import {
  getCycleTrend,
  getPlanned,
  getSavingsContributions,
  getSavingsGoals,
  getTransactions,
  requireContext,
  resolveCycle,
  totalsFor,
} from "@/lib/data";
import { buildInsights, SAVING_TIPS } from "@/lib/insights";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleKey } = await searchParams;
  const { household, members, categories } = await requireContext();

  const cycle = resolveCycle(household, cycleKey);
  const previousCycle = shiftCycle(cycle, -1, household.cycle_label_mode);
  const trendCycles = recentCycles(cycle, 6, household.cycle_label_mode);

  const [transactions, previousTransactions, contributions, previousContributions, allContributions, goals, planned, trend] =
    await Promise.all([
      getTransactions(household.id, cycle),
      getTransactions(household.id, previousCycle),
      getSavingsContributions(household.id, cycle),
      getSavingsContributions(household.id, previousCycle),
      getSavingsContributions(household.id),
      getSavingsGoals(household.id),
      getPlanned(household.id, cycle),
      getCycleTrend(household.id, trendCycles),
    ]);

  const totals = totalsFor(transactions, contributions);
  const previousTotals = totalsFor(previousTransactions, previousContributions);

  // Running total per goal, across every cycle — goals are long-lived.
  const goalProgress = new Map<string, number>();
  for (const c of allContributions) {
    goalProgress.set(c.goal_id, (goalProgress.get(c.goal_id) ?? 0) + Number(c.amount));
  }

  const categoryRows: CategoryRow[] = categories
    .filter((c) => c.kind === "expense")
    .map((category) => ({
      category,
      amount: totals.byCategory.get(category.id) ?? 0,
      previous: previousTotals.byCategory.get(category.id) ?? 0,
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const personRows: PersonRow[] = members.map((profile) => {
    const stats = totals.byPerson.get(profile.id);
    return {
      profile,
      expense: stats?.expense ?? 0,
      income: stats?.income ?? 0,
      saved: stats?.saved ?? 0,
    };
  });

  // Savings bars need their own per-cycle totals, bucketed from one fetch.
  const savingsTrend = trendCycles.map((c) => {
    const { from, to } = cycleBounds(c);
    const value = allContributions
      .filter((row) => row.occurred_on >= from && row.occurred_on <= to)
      .reduce((sum, row) => sum + Number(row.amount), 0);
    return { key: c.key, label: c.shortLabel, value: Math.max(value, 0) };
  });

  const insights = buildInsights({
    cycle,
    totals,
    previousTotals,
    categories,
    goals,
    goalProgress,
    planned: planned.expenses,
    plannedPaidIds: new Set(planned.payments.map((p) => p.planned_expense_id)),
    currency: household.currency,
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-ink">Stats</h1>
      </header>

      <CycleSwitcher
        cycle={cycle}
        labelMode={household.cycle_label_mode}
        basePath="/stats"
        canGoForward={!isCurrentCycle(cycle, household.cycle_start_day)}
      />

      <StatsView
        currency={household.currency}
        expenseTotal={totals.expense}
        incomeTotal={totals.income}
        savedTotal={totals.saved}
        savedAllTime={allContributions.reduce((sum, c) => sum + Number(c.amount), 0)}
        categoryRows={categoryRows}
        personRows={personRows}
        insights={insights}
        tips={SAVING_TIPS}
        trend={trend.map((t) => ({ key: t.cycle.key, label: t.cycle.shortLabel, value: t.expense }))}
        savingsTrend={savingsTrend}
        activeCycleKey={cycle.key}
        goalRows={goals.map((g) => ({
          id: g.id,
          name: g.name,
          emoji: g.emoji,
          color: g.color,
          saved: goalProgress.get(g.id) ?? 0,
          target: Number(g.target_amount),
        }))}
      />
    </div>
  );
}
