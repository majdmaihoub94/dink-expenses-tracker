import { BudgetView } from "@/components/BudgetView";
import { CycleSwitcher } from "@/components/CycleSwitcher";
import { UK_IOM_TIPS } from "@/lib/budget";
import {
  budgetAiAvailable,
  getCachedBudgetInsights,
  isCacheFresh,
  refreshBudgetInsights,
  type BudgetAiInsights,
} from "@/lib/budget-ai";
import { loadBudgetContext } from "@/lib/budget-context";
import { isCurrentCycle } from "@/lib/cycle";
import { requireContext, resolveCycle } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleKey } = await searchParams;
  const { household, members, categories } = await requireContext();
  const cycle = resolveCycle(household, cycleKey);

  const context = await loadBudgetContext({ household, members, categories, cycle });

  let aiInsights: BudgetAiInsights | null = null;
  let aiStale = false;

  if (context.aiInput) {
    const cached = await getCachedBudgetInsights(household.id);
    const fresh = isCacheFresh(cached, cycle.key, context.aiInput);

    if (fresh) {
      aiInsights = cached;
    } else if (cached) {
      // Numbers have moved since the last read — keep showing it, just flagged stale.
      aiInsights = cached;
      aiStale = true;
    } else if (budgetAiAvailable()) {
      // Never generated for this household. Worth the wait once; every visit
      // after this comes straight from the cache until "Refresh" is tapped.
      aiInsights = await refreshBudgetInsights(household.id, cycle.key, context.aiInput);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-ink">Budget</h1>
      </header>

      <CycleSwitcher
        cycle={cycle}
        labelMode={household.cycle_label_mode}
        basePath="/budget"
        canGoForward={!isCurrentCycle(cycle, household.cycle_start_day)}
      />

      <BudgetView
        currency={household.currency}
        cycleKey={cycle.key}
        cycleLabel={cycle.label}
        cycleRangeLabel={cycle.rangeLabel}
        hasBudget={Boolean(context.budget)}
        monthlyIncome={context.budget?.monthly_income ?? 0}
        savingsTargetType={context.budget?.savings_target_type ?? "percent"}
        savingsTargetValue={context.budget?.savings_target_value ?? 20}
        savingsTargetAmount={context.savingsTarget}
        spentSoFar={context.totals.expense}
        allocation={context.allocation}
        pace={context.pace}
        forecast={context.forecast}
        trend={context.trend}
        aiInsights={aiInsights}
        aiStale={aiStale}
        aiAvailable={budgetAiAvailable()}
        regionalTips={UK_IOM_TIPS}
      />
    </div>
  );
}
