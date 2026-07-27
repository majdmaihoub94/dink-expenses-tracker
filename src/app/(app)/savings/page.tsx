import Link from "next/link";

import { SavingsView, type GoalRow } from "@/components/SavingsView";
import { cycleBounds } from "@/lib/cycle";
import {
  getSavingsContributions,
  getSavingsGoals,
  requireContext,
  resolveCycle,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SavingsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleKey } = await searchParams;
  const { profile, household, members, paymentMethods } = await requireContext();
  const cycle = resolveCycle(household, cycleKey);
  const { from, to } = cycleBounds(cycle);

  const [goals, contributions] = await Promise.all([
    getSavingsGoals(household.id),
    getSavingsContributions(household.id),
  ]);

  const rows: GoalRow[] = goals.map((goal) => {
    const mine = contributions.filter((c) => c.goal_id === goal.id);
    return {
      goal,
      saved: mine.reduce((sum, c) => sum + Number(c.amount), 0),
      thisCycle: mine
        .filter((c) => c.occurred_on >= from && c.occurred_on <= to)
        .reduce((sum, c) => sum + Number(c.amount), 0),
    };
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back"
          className="dinx-tap flex h-9 w-9 items-center justify-center rounded-full bg-card text-ink-soft shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-ink">Savings</h1>
      </header>

      <SavingsView
        rows={rows}
        contributions={contributions}
        members={members}
        paymentMethods={paymentMethods}
        currency={household.currency}
        profileId={profile.id}
      />
    </div>
  );
}
