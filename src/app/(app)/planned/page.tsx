import Link from "next/link";

import { CycleSwitcher } from "@/components/CycleSwitcher";
import { PlannedView } from "@/components/PlannedView";
import { isCurrentCycle } from "@/lib/cycle";
import { getPlanned, requireContext, resolveCycle } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PlannedPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleKey } = await searchParams;
  const { profile, household, members, categories, paymentMethods } = await requireContext();
  const cycle = resolveCycle(household, cycleKey);
  const { expenses, payments } = await getPlanned(household.id, cycle);

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
        <h1 className="text-2xl font-bold text-ink">Expected</h1>
      </header>

      <CycleSwitcher
        cycle={cycle}
        labelMode={household.cycle_label_mode}
        basePath="/planned"
        canGoForward={!isCurrentCycle(cycle, household.cycle_start_day)}
      />

      <PlannedView
        expenses={expenses}
        payments={payments}
        categories={categories}
        paymentMethods={paymentMethods}
        members={members}
        currency={household.currency}
        cycle={cycle}
        profileId={profile.id}
      />
    </div>
  );
}
