import Link from "next/link";

import { AvatarStack } from "@/components/Avatar";
import { CycleSwitcher } from "@/components/CycleSwitcher";
import { HeroCard } from "@/components/HeroCard";
import { PushManager } from "@/components/PushManager";
import { TransactionList } from "@/components/TransactionList";
import { isCurrentCycle, recentCycles, shiftCycle } from "@/lib/cycle";
import {
  getCycleTrend,
  getPlanned,
  getSavingsContributions,
  getSavingsGoals,
  getTransactions,
  requireContext,
  resolveCycle,
  settlementBalance,
  totalsFor,
} from "@/lib/data";
import { compactMoney, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleKey } = await searchParams;
  const { profile, household, members, categories } = await requireContext();
  const cycle = resolveCycle(household, cycleKey);

  const [transactions, contributions, goals, planned, trend, allContributions] = await Promise.all([
    getTransactions(household.id, cycle),
    getSavingsContributions(household.id, cycle),
    getSavingsGoals(household.id),
    getPlanned(household.id, cycle),
    getCycleTrend(household.id, recentCycles(cycle, 6, household.cycle_label_mode)),
    getSavingsContributions(household.id),
  ]);

  const totals = totalsFor(transactions, contributions);
  const balance = settlementBalance(transactions, members);
  const currency = household.currency;

  const unpaidPlanned = planned.expenses.filter(
    (p) => !planned.payments.some((pay) => pay.planned_expense_id === p.id),
  );
  const unpaidTotal = unpaidPlanned.reduce((sum, p) => sum + Number(p.amount), 0);

  const savedTotal = allContributions.reduce((sum, c) => sum + Number(c.amount), 0);
  const goalTarget = goals.reduce((sum, g) => sum + Number(g.target_amount), 0);

  const topCategories = [...totals.byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, amount]) => ({ category: categories.find((c) => c.id === id), amount }))
    .filter((row) => row.category);

  return (
    <div className="space-y-5 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Hello,</p>
          <h1 className="text-2xl font-bold text-ink">{profile.display_name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <AvatarStack profiles={members} />
          <Link
            href="/profile"
            aria-label="Settings"
            className="dinx-tap flex h-10 w-10 items-center justify-center rounded-full bg-card text-ink-soft shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </header>

      <CycleSwitcher
        cycle={cycle}
        labelMode={household.cycle_label_mode}
        basePath="/"
        canGoForward={!isCurrentCycle(cycle, household.cycle_start_day)}
      />

      <HeroCard
        title="Outcome"
        amount={totals.expense}
        currency={currency}
        rangeLabel={cycle.rangeLabel}
        cycleLabel={cycle.label}
        activeKey={cycle.key}
        trend={trend.map((t) => ({
          key: t.cycle.key,
          label: t.cycle.shortLabel,
          value: t.expense,
        }))}
      />

      {/* Income / saved / left ------------------------------------------- */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Income" value={compactMoney(totals.income, currency)} tone="mint" />
        <Stat label="Saved" value={compactMoney(totals.saved, currency)} tone="plum" />
        <Stat
          label="Left"
          value={compactMoney(totals.net, currency)}
          tone={totals.net < 0 ? "rose" : "ink"}
        />
      </div>

      <PushManager vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />

      {/* Who owes who ----------------------------------------------------- */}
      {balance && (
        <div className="dinx-tile flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            🤝
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              {balance.from.id === profile.id ? "You owe" : `${balance.from.display_name} owes`}{" "}
              {balance.to.id === profile.id ? "you" : balance.to.display_name}
            </p>
            <p className="text-xs text-muted">Based on shared costs this cycle</p>
          </div>
          <span className="shrink-0 text-base font-bold text-plum-600">
            {money(balance.amount, currency)}
          </span>
        </div>
      )}

      {/* Planned + savings shortcuts -------------------------------------- */}
      <div className="grid grid-cols-2 gap-3">
        <ShortcutTile
          href={`/planned?cycle=${cycle.key}`}
          emoji="📌"
          title="Expected"
          value={unpaidPlanned.length === 0 ? "All paid" : money(unpaidTotal, currency)}
          caption={
            unpaidPlanned.length === 0
              ? `${planned.expenses.length} bill${planned.expenses.length === 1 ? "" : "s"}`
              : `${unpaidPlanned.length} still to pay`
          }
        />
        <ShortcutTile
          href="/savings"
          emoji="🐖"
          title="Savings"
          value={compactMoney(savedTotal, currency)}
          caption={
            goalTarget > 0
              ? `of ${compactMoney(goalTarget, currency)} target`
              : "Set your first goal"
          }
        />
      </div>

      {/* Top categories --------------------------------------------------- */}
      {topCategories.length > 0 && (
        <section className="dinx-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Where it went</h2>
            <Link href={`/stats?cycle=${cycle.key}`} className="text-xs font-medium text-plum-600">
              See all
            </Link>
          </div>
          <div className="space-y-3">
            {topCategories.map(({ category, amount }) => {
              const share = totals.expense > 0 ? amount / totals.expense : 0;
              return (
                <div key={category!.id} className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-base"
                    style={{ backgroundColor: category!.color }}
                    aria-hidden
                  >
                    {category!.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{category!.name}</span>
                      <span className="shrink-0 text-sm font-semibold text-ink">
                        {money(amount, currency)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-page">
                      <div
                        className="h-full rounded-full bg-plum-500"
                        style={{ width: `${Math.max(share * 100, 3)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent activity -------------------------------------------------- */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Recent</h2>
          <Link
            href={`/transactions?cycle=${cycle.key}`}
            className="text-xs font-medium text-plum-600"
          >
            View all
          </Link>
        </div>
        <TransactionList
          transactions={transactions.slice(0, 8)}
          members={members}
          currency={currency}
          emptyLabel={`Nothing logged for ${cycle.label} yet. Tap + to start.`}
        />
      </section>

      {/* Previous cycle nudge --------------------------------------------- */}
      {transactions.length > 0 && (
        <Link
          href={`/stats?cycle=${shiftCycle(cycle, -1, household.cycle_label_mode).key}`}
          className="dinx-tap block rounded-2xl bg-plum-50 px-4 py-3 text-center text-sm font-medium text-plum-600"
        >
          Compare with {shiftCycle(cycle, -1, household.cycle_label_mode).label}
        </Link>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "mint" | "plum" | "rose" | "ink";
}) {
  const colors = {
    mint: "text-mint",
    plum: "text-plum-600",
    rose: "text-rose",
    ink: "text-ink",
  } as const;

  return (
    <div className="dinx-tile text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-bold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function ShortcutTile({
  href,
  emoji,
  title,
  value,
  caption,
}: {
  href: string;
  emoji: string;
  title: string;
  value: string;
  caption: string;
}) {
  return (
    <Link href={href} className="dinx-tile dinx-tap block">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg" aria-hidden>
          {emoji}
        </span>
        <span className="text-sm font-semibold text-ink">{title}</span>
      </div>
      <p className="truncate text-lg font-bold text-ink">{value}</p>
      <p className="truncate text-xs text-muted">{caption}</p>
    </Link>
  );
}
