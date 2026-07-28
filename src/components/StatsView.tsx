"use client";

import { useState } from "react";

import { BarChart } from "@/components/BarChart";
import { money, percent } from "@/lib/format";
import type { Insight, Tip } from "@/lib/insights";
import type { Category, Profile } from "@/lib/types";

export type CategoryRow = { category: Category; amount: number; previous: number };
export type PersonRow = { profile: Profile; expense: number; income: number; saved: number };

const TABS = [
  { id: "spending", label: "Spending" },
  { id: "savings", label: "Savings" },
  { id: "tips", label: "Tips" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function StatsView({
  currency,
  expenseTotal,
  incomeTotal,
  savedTotal,
  savedAllTime,
  categoryRows,
  personRows,
  insights,
  tips,
  trend,
  savingsTrend,
  activeCycleKey,
  goalRows,
}: {
  currency: string;
  expenseTotal: number;
  incomeTotal: number;
  savedTotal: number;
  savedAllTime: number;
  categoryRows: CategoryRow[];
  personRows: PersonRow[];
  insights: Insight[];
  tips: Tip[];
  trend: { key: string; label: string; value: number }[];
  savingsTrend: { key: string; label: string; value: number }[];
  activeCycleKey: string;
  goalRows: { id: string; name: string; emoji: string; color: string; saved: number; target: number }[];
}) {
  const [tab, setTab] = useState<TabId>("spending");

  return (
    <div className="space-y-4 pb-6">
      <div className="flex rounded-full bg-card p-1 shadow-[0_6px_20px_-16px_rgba(58,42,79,0.5)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`dinx-tap flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-plum-600 text-white" : "text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "spending" && (
        <SpendingTab
          currency={currency}
          expenseTotal={expenseTotal}
          incomeTotal={incomeTotal}
          savedTotal={savedTotal}
          categoryRows={categoryRows}
          personRows={personRows}
          trend={trend}
          activeCycleKey={activeCycleKey}
        />
      )}

      {tab === "savings" && (
        <SavingsTab
          currency={currency}
          savedTotal={savedTotal}
          savedAllTime={savedAllTime}
          incomeTotal={incomeTotal}
          savingsTrend={savingsTrend}
          activeCycleKey={activeCycleKey}
          goalRows={goalRows}
          personRows={personRows}
        />
      )}

      {tab === "tips" && <TipsTab insights={insights} tips={tips} />}
    </div>
  );
}

function SpendingTab({
  currency,
  expenseTotal,
  incomeTotal,
  savedTotal,
  categoryRows,
  personRows,
  trend,
  activeCycleKey,
}: {
  currency: string;
  expenseTotal: number;
  incomeTotal: number;
  savedTotal: number;
  categoryRows: CategoryRow[];
  personRows: PersonRow[];
  trend: { key: string; label: string; value: number }[];
  activeCycleKey: string;
}) {
  // Savings are tracked as their own isolated thing — never subtracted here.
  const net = incomeTotal - expenseTotal;

  return (
    <div className="space-y-4">
      <section className="dinx-card">
        <h2 className="mb-3 text-base font-semibold text-ink">Last 6 cycles</h2>
        <BarChart data={trend} activeKey={activeCycleKey} variant="light" currency={currency} height={120} />
      </section>

      <section className="dinx-card space-y-3">
        <SummaryRow label="Income" value={money(incomeTotal, currency)} tone="mint" />
        <SummaryRow label="Spent" value={money(expenseTotal, currency)} tone="ink" />
        <SummaryRow label="Saved" value={money(savedTotal, currency)} tone="plum" />
        <div className="border-t border-line pt-3">
          <SummaryRow
            label="Left over"
            value={money(net, currency)}
            tone={net < 0 ? "rose" : "mint"}
            bold
          />
        </div>
      </section>

      {personRows.length > 1 && (
        <section className="dinx-card">
          <h2 className="mb-3 text-base font-semibold text-ink">By person</h2>
          <div className="space-y-4">
            {personRows.map((row) => {
              const share = expenseTotal > 0 ? row.expense / expenseTotal : 0;
              return (
                <div key={row.profile.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      <span aria-hidden>{row.profile.emoji}</span>
                      {row.profile.display_name}
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      {money(row.expense, currency)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-page">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(share * 100, 2)}%`,
                        backgroundColor: row.profile.color,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {percent(share)} of spending · {money(row.income, currency)} in ·{" "}
                    {money(row.saved, currency)} saved
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="dinx-card">
        <h2 className="mb-3 text-base font-semibold text-ink">By category</h2>
        {categoryRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No spending in this cycle.</p>
        ) : (
          <div className="space-y-3">
            {categoryRows.map(({ category, amount, previous }) => {
              const share = expenseTotal > 0 ? amount / expenseTotal : 0;
              const delta = previous > 0 ? (amount - previous) / previous : null;
              const cap = category.monthly_budget ? Number(category.monthly_budget) : null;
              const overCap = cap !== null && amount > cap;

              return (
                <div key={category.id} className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base"
                    style={{ backgroundColor: category.color }}
                    aria-hidden
                  >
                    {category.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{category.name}</span>
                      <span
                        className={`shrink-0 text-sm font-semibold ${overCap ? "text-rose" : "text-ink"}`}
                      >
                        {money(amount, currency)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-page">
                      <div
                        className={`h-full rounded-full ${overCap ? "bg-rose" : "bg-plum-500"}`}
                        style={{ width: `${Math.max(share * 100, 2)}%` }}
                      />
                    </div>
                    <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
                      <span>{percent(share)}</span>
                      {cap !== null && (
                        <span className={overCap ? "text-rose" : undefined}>
                          · cap {money(cap, currency)}
                        </span>
                      )}
                      {delta !== null && Math.abs(delta) >= 0.05 && (
                        <span className={delta > 0 ? "text-rose" : "text-mint"}>
                          · {delta > 0 ? "↑" : "↓"} {percent(Math.abs(delta))}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SavingsTab({
  currency,
  savedTotal,
  savedAllTime,
  incomeTotal,
  savingsTrend,
  activeCycleKey,
  goalRows,
  personRows,
}: {
  currency: string;
  savedTotal: number;
  savedAllTime: number;
  incomeTotal: number;
  savingsTrend: { key: string; label: string; value: number }[];
  activeCycleKey: string;
  goalRows: { id: string; name: string; emoji: string; color: string; saved: number; target: number }[];
  personRows: PersonRow[];
}) {
  const rate = incomeTotal > 0 ? savedTotal / incomeTotal : 0;

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-card)] bg-gradient-to-br from-plum-800 to-plum-900 p-5 text-white">
        <p className="text-xs font-medium tracking-wide text-white/60 uppercase">Saved all time</p>
        <p className="mt-1 text-[2rem] leading-none font-semibold">{money(savedAllTime, currency)}</p>
        <p className="mt-2 text-xs text-white/60">
          {money(savedTotal, currency)} this cycle
          {incomeTotal > 0 && ` · ${percent(rate)} of income`}
        </p>
        <div className="mt-4">
          <BarChart
            data={savingsTrend}
            activeKey={activeCycleKey}
            variant="dark"
            currency={currency}
            height={92}
          />
        </div>
      </section>

      {incomeTotal > 0 && (
        <section className="dinx-card">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-ink">Savings rate</h2>
            <span
              className={`text-sm font-bold ${
                rate >= 0.2 ? "text-mint" : rate >= 0.1 ? "text-ink" : "text-coral"
              }`}
            >
              {percent(rate)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-page">
            <div
              className={`h-full rounded-full ${rate >= 0.2 ? "bg-mint" : "bg-coral"}`}
              style={{ width: `${Math.min(rate * 100, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            20% is the usual benchmark. The marker moves as you add contributions.
          </p>
        </section>
      )}

      {goalRows.length > 0 && (
        <section className="dinx-card">
          <h2 className="mb-3 text-base font-semibold text-ink">Goal progress</h2>
          <div className="space-y-4">
            {goalRows.map((goal) => {
              const ratio = goal.target > 0 ? goal.saved / goal.target : 0;
              return (
                <div key={goal.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      <span aria-hidden>{goal.emoji}</span>
                      {goal.name}
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      {money(goal.saved, currency)}{" "}
                      <span className="text-muted">/ {money(goal.target, currency)}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-page">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(ratio * 100, 100)}%`,
                        backgroundColor: ratio >= 1 ? "#2FBF87" : goal.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {personRows.length > 1 && personRows.some((p) => p.saved !== 0) && (
        <section className="dinx-card">
          <h2 className="mb-3 text-base font-semibold text-ink">Who saved what</h2>
          <div className="space-y-2">
            {personRows.map((row) => (
              <div key={row.profile.id} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-ink">
                  <span aria-hidden>{row.profile.emoji}</span>
                  {row.profile.display_name}
                </span>
                <span className="text-sm font-semibold text-ink">{money(row.saved, currency)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const TONES: Record<Insight["tone"], string> = {
  good: "bg-mint-soft",
  warn: "bg-coral-soft",
  bad: "bg-rose/10",
  info: "bg-plum-50",
};

function TipsTab({ insights, tips }: { insights: Insight[]; tips: Tip[] }) {
  return (
    <div className="space-y-4">
      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">What your numbers say</h2>
        {insights.length === 0 ? (
          <p className="dinx-card text-center text-sm text-muted">
            Log a few transactions and DINX will start spotting patterns here.
          </p>
        ) : (
          <div className="space-y-2">
            {insights.map((insight) => (
              <div key={insight.id} className={`flex gap-3 rounded-[var(--radius-tile)] p-4 ${TONES[insight.tone]}`}>
                <span className="text-xl leading-none" aria-hidden>
                  {insight.emoji}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{insight.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{insight.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">Habits that work</h2>
        <div className="space-y-2">
          {tips.map((tip) => (
            <div key={tip.id} className="dinx-tile flex gap-3">
              <span className="text-xl leading-none" aria-hidden>
                {tip.emoji}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{tip.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{tip.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone: "mint" | "plum" | "rose" | "ink";
  bold?: boolean;
}) {
  const colors = { mint: "text-mint", plum: "text-plum-600", rose: "text-rose", ink: "text-ink" };
  return (
    <div className="flex items-baseline justify-between">
      <span className={`text-sm ${bold ? "font-semibold text-ink" : "text-muted"}`}>{label}</span>
      <span className={`${bold ? "text-lg" : "text-base"} font-bold ${colors[tone]}`}>{value}</span>
    </div>
  );
}
