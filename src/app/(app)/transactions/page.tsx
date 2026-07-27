import { CycleSwitcher } from "@/components/CycleSwitcher";
import { TransactionsView } from "@/components/TransactionsView";
import { isCurrentCycle, recentCycles } from "@/lib/cycle";
import { getCycleTrend, getTransactions, requireContext, resolveCycle } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleKey } = await searchParams;
  const { household, members, categories, paymentMethods } = await requireContext();
  const cycle = resolveCycle(household, cycleKey);

  const [transactions, trend] = await Promise.all([
    getTransactions(household.id, cycle),
    getCycleTrend(household.id, recentCycles(cycle, 6, household.cycle_label_mode)),
  ]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Receipts</h1>
      </header>

      <CycleSwitcher
        cycle={cycle}
        labelMode={household.cycle_label_mode}
        basePath="/transactions"
        canGoForward={!isCurrentCycle(cycle, household.cycle_start_day)}
      />

      <TransactionsView
        transactions={transactions}
        categories={categories}
        paymentMethods={paymentMethods}
        members={members}
        currency={household.currency}
        cycle={cycle}
        trend={trend.map((t) => ({
          key: t.cycle.key,
          label: t.cycle.shortLabel,
          value: t.expense,
        }))}
      />
    </div>
  );
}
