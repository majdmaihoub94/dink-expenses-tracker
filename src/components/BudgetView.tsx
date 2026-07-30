"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  applySuggestedCapsAction,
  refreshBudgetInsightsAction,
  saveBudgetSettingsAction,
} from "@/app/actions";
import { BarChart } from "@/components/BarChart";
import { Sheet } from "@/components/Sheet";
import type { AiTip, BudgetAiInsights } from "@/lib/budget-ai";
import type { Allocation, BudgetPace, Forecast, PaceStatus, Tip } from "@/lib/budget";
import { money, percent } from "@/lib/format";
import type { SavingsTargetType } from "@/lib/types";

export type BudgetViewProps = {
  currency: string;
  cycleKey: string;
  cycleLabel: string;
  cycleRangeLabel: string;
  hasBudget: boolean;
  monthlyIncome: number;
  savingsTargetType: SavingsTargetType;
  savingsTargetValue: number;
  savingsTargetAmount: number;
  spentSoFar: number;
  allocation: Allocation;
  pace: BudgetPace;
  forecast: Forecast;
  trend: { key: string; label: string; expense: number; income: number; saved: number }[];
  aiInsights: BudgetAiInsights | null;
  aiStale: boolean;
  aiAvailable: boolean;
  regionalTips: Tip[];
};

const TABS = [
  { id: "cycle", label: "This cycle" },
  { id: "forecast", label: "Forecast" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const PACE_COPY: Record<PaceStatus, { label: string; tone: string }> = {
  ahead: { label: "Ahead of pace", tone: "text-mint" },
  onpace: { label: "On pace", tone: "text-ink" },
  behind: { label: "Behind pace", tone: "text-coral" },
};

export function BudgetView(props: BudgetViewProps) {
  const [tab, setTab] = useState<TabId>("cycle");
  const [setupOpen, setSetupOpen] = useState(!props.hasBudget);

  return (
    <div className="space-y-4 pb-6">
      {!props.hasBudget ? (
        <div className="dinx-card text-center">
          <p className="text-3xl" aria-hidden>
            🎯
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">Set up your budget</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
            Enter what comes in and what you want to put away — DINX works out the rest and adapts as
            you spend.
          </p>
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="dinx-tap mt-4 rounded-2xl bg-plum-600 px-6 py-3 text-sm font-semibold text-white"
          >
            Get started
          </button>
        </div>
      ) : (
        <>
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

          {tab === "cycle" && <CycleTab {...props} />}
          {tab === "forecast" && <ForecastTab {...props} />}
        </>
      )}

      <SetupSheet
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        currency={props.currency}
        monthlyIncome={props.monthlyIncome}
        savingsTargetType={props.savingsTargetType}
        savingsTargetValue={props.savingsTargetValue}
      />

      {props.hasBudget && (
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="dinx-tap block w-full rounded-2xl bg-page py-3 text-center text-xs font-semibold text-ink-soft"
        >
          Edit income &amp; savings target
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// This cycle
// ---------------------------------------------------------------------------

function CycleTab(props: BudgetViewProps) {
  const { currency, pace, allocation, spentSoFar } = props;
  const paceCopy = PACE_COPY[pace.status];
  const spendableRatio = allocation.spendable > 0 ? Math.min(spentSoFar / allocation.spendable, 1) : 0;

  const allocationRows = allocation.rows.filter((r) => r.suggested > 0 || r.spent > 0);
  const allocationsPayload = JSON.stringify(
    allocationRows.filter((r) => r.suggested > 0).map((r) => ({ id: r.category.id, amount: r.suggested })),
  );

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-plum-800 to-plum-900 p-5 text-white">
        <span
          className="pointer-events-none absolute -top-10 -right-8 h-32 w-32 rounded-full bg-plum-500/30 blur-xl"
          aria-hidden
        />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-white/60 uppercase">Spendable left</p>
            <p className="mt-1 text-[2rem] leading-none font-semibold">
              {money(Math.max(allocation.spendable - spentSoFar, 0), currency)}
            </p>
            <p className="mt-1 text-xs text-white/55">
              {props.cycleLabel} · {props.cycleRangeLabel}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              pace.status === "behind" ? "bg-coral/25 text-coral" : "bg-white/15 text-white"
            }`}
          >
            {paceCopy.label}
          </span>
        </div>

        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className={`h-full rounded-full ${pace.status === "behind" ? "bg-coral" : "bg-mint"}`}
            style={{ width: `${Math.max(spendableRatio * 100, 2)}%` }}
          />
        </div>
        <p className="relative mt-2 text-xs text-white/60">
          {money(spentSoFar, currency)} spent of {money(allocation.spendable, currency)} ·{" "}
          {pace.daysLeft} day{pace.daysLeft === 1 ? "" : "s"} left ·{" "}
          {money(pace.safeToSpendPerDay, currency)}/day to stay on track
        </p>
      </section>

      <RecoverySection {...props} />

      <section className="dinx-card">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Smart allocation</h2>
          <span className="text-xs text-muted">Averaged from recent cycles</span>
        </div>
        <p className="mb-3 text-xs text-muted">
          Essentials are funded close to what they actually cost; what&apos;s left is shared across
          everything else, capped so a good cycle doesn&apos;t quietly become the new normal.
        </p>

        {allocationRows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            Log a few cycles of spending and DINX will suggest a cap per category here.
          </p>
        ) : (
          <div className="space-y-3">
            {allocationRows.map((row) => {
              const ratio = row.suggested > 0 ? row.spent / row.suggested : row.spent > 0 ? 1 : 0;
              const over = row.suggested > 0 && row.spent > row.suggested;
              return (
                <div key={row.category.id} className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
                    style={{ backgroundColor: row.category.color }}
                    aria-hidden
                  >
                    {row.category.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {row.category.name}
                        <span className="ml-1.5 text-[10px] font-normal text-muted">
                          {row.essential ? "need" : "want"}
                        </span>
                      </span>
                      <span className={`shrink-0 text-sm font-semibold ${over ? "text-rose" : "text-ink"}`}>
                        {money(row.spent, currency)}
                        {row.suggested > 0 && (
                          <span className="text-muted"> / {money(row.suggested, currency)}</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-page">
                      <div
                        className={`h-full rounded-full ${over ? "bg-rose" : "bg-plum-500"}`}
                        style={{ width: `${Math.max(Math.min(ratio, 1) * 100, 2)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {allocationRows.some((r) => r.suggested > 0) && (
          <ApplyCapsForm allocationsPayload={allocationsPayload} />
        )}
      </section>

      <AiRefreshCard {...props} />
    </div>
  );
}

function ApplyCapsForm({ allocationsPayload }: { allocationsPayload: string }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        setError(null);
        const result = await applySuggestedCapsAction(formData);
        if (!result.ok) setError(result.error);
      }}
      className="mt-4"
    >
      <input type="hidden" name="allocations" value={allocationsPayload} />
      <ApplyCapsButton />
      {error && <p className="mt-2 text-xs text-rose">{error}</p>}
    </form>
  );
}

function RecoverySection({ pace, aiInsights }: BudgetViewProps) {
  const hasAi = Boolean(aiInsights && aiInsights.recommendations.length > 0);

  if (pace.status !== "behind" && !hasAi) {
    return (
      <section className={`flex gap-3 rounded-[var(--radius-tile)] p-4 ${pace.status === "ahead" ? "bg-mint-soft" : "bg-plum-50"}`}>
        <span className="text-xl leading-none" aria-hidden>
          {pace.status === "ahead" ? "🌱" : "🧮"}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {pace.status === "ahead" ? "Comfortably ahead" : "Right on pace"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            Keep spending at today&apos;s rate and you&apos;ll land on target by the end of the cycle.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-ink">
        {pace.status === "behind" ? "Recovery plan" : "Where the spare money could go"}
      </h2>

      {pace.actions.map((action) => (
        <div key={action.id} className="flex gap-3 rounded-[var(--radius-tile)] bg-coral-soft p-4">
          <span className="text-xl leading-none" aria-hidden>
            {action.emoji}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{action.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{action.body}</p>
          </div>
        </div>
      ))}

      {hasAi &&
        aiInsights!.recommendations.map((rec) => (
          <div key={rec.id} className="flex gap-3 rounded-[var(--radius-tile)] bg-plum-50 p-4">
            <span className="text-xl leading-none" aria-hidden>
              ✨
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{rec.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{rec.action}</p>
              {rec.impact && <p className="mt-1 text-xs font-semibold text-plum-600">{rec.impact}</p>}
            </div>
          </div>
        ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

function ForecastTab(props: BudgetViewProps) {
  const { currency, forecast, trend, aiInsights, regionalTips } = props;

  const savedTrend = trend.map((t) => ({ key: t.key, label: t.label, value: Math.max(t.saved, 0) }));

  return (
    <div className="space-y-4">
      <section className="dinx-card">
        <h2 className="mb-3 text-base font-semibold text-ink">Saved per cycle</h2>
        <BarChart data={savedTrend} activeKey={props.cycleKey} variant="light" currency={currency} height={110} />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <ForecastStat label="Avg. income" value={money(forecast.averageIncome, currency)} />
        <ForecastStat label="Avg. spent" value={money(forecast.averageExpense, currency)} />
        <ForecastStat label="Avg. saved" value={money(forecast.averageSaved, currency)} tone="plum" />
        <ForecastStat
          label="Projected / year"
          value={money(forecast.projectedAnnualSavings, currency)}
          tone="mint"
        />
      </section>

      {forecast.savingsRateTrend !== null && Math.abs(forecast.savingsRateTrend) >= 0.02 && (
        <div className={`flex gap-3 rounded-[var(--radius-tile)] p-4 ${forecast.savingsRateTrend > 0 ? "bg-mint-soft" : "bg-coral-soft"}`}>
          <span className="text-xl leading-none" aria-hidden>
            {forecast.savingsRateTrend > 0 ? "📈" : "📉"}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              Savings rate is {forecast.savingsRateTrend > 0 ? "improving" : "slipping"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              {percent(Math.abs(forecast.savingsRateTrend))} {forecast.savingsRateTrend > 0 ? "better" : "worse"} than
              earlier cycles, based on {forecast.cyclesSampled} of history.
            </p>
          </div>
        </div>
      )}

      {(forecast.risingCategories.length > 0 || forecast.fallingCategories.length > 0) && (
        <section className="dinx-card">
          <h2 className="mb-3 text-base font-semibold text-ink">Habits creeping in — and out</h2>
          <div className="space-y-2">
            {forecast.risingCategories.map((t) => (
              <div key={t.category.id} className="flex items-center gap-3">
                <span className="text-lg" aria-hidden>
                  {t.category.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{t.category.name}</p>
                  <p className="text-xs text-rose">
                    Up {percent(Math.abs(t.changeRatio ?? 0))} lately, averaging {money(t.recentAverage, currency)}
                    /cycle
                  </p>
                </div>
              </div>
            ))}
            {forecast.fallingCategories.map((t) => (
              <div key={t.category.id} className="flex items-center gap-3">
                <span className="text-lg" aria-hidden>
                  {t.category.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{t.category.name}</p>
                  <p className="text-xs text-mint">
                    Down {percent(Math.abs(t.changeRatio ?? 0))} lately, averaging {money(t.recentAverage, currency)}
                    /cycle
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {aiInsights?.forecast.summary && (
        <section className="dinx-card">
          <div className="mb-2 flex items-center gap-2">
            <span aria-hidden>✨</span>
            <h2 className="text-base font-semibold text-ink">Where this is heading</h2>
          </div>
          <p className="text-xs leading-relaxed text-ink-soft">{aiInsights.forecast.summary}</p>
        </section>
      )}

      {aiInsights?.forecast.tips.map((tip, i) => <TipCard key={`ai-forecast-${i}`} tip={tip} ai />)}

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">UK &amp; Isle of Man habits</h2>
        <div className="space-y-2">
          {aiInsights?.regionalTips.map((tip, i) => <TipCard key={`ai-regional-${i}`} tip={tip} ai />)}
          {regionalTips.map((tip) => (
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
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          General information, not financial advice — rates, tax bands and allowances change, so check the
          current figure on gov.im or with your provider before acting on it.
        </p>
      </section>

      <AiRefreshCard {...props} />
    </div>
  );
}

function TipCard({ tip, ai }: { tip: AiTip; ai?: boolean }) {
  return (
    <div className="dinx-tile flex gap-3">
      <span className="text-xl leading-none" aria-hidden>
        {ai ? "✨" : "💡"}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{tip.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{tip.body}</p>
      </div>
    </div>
  );
}

function ForecastStat({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "plum" | "mint" }) {
  const colors = { ink: "text-ink", plum: "text-plum-600", mint: "text-mint" } as const;
  return (
    <div className="dinx-tile text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-bold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI refresh
// ---------------------------------------------------------------------------

function AiRefreshCard({ cycleKey, aiInsights, aiStale, aiAvailable }: BudgetViewProps) {
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="dinx-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <span aria-hidden>✨</span> AI insights
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {aiInsights
              ? `Last updated ${new Date(aiInsights.generatedAt).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}${aiStale ? " · numbers have moved on" : ""}`
              : aiAvailable
                ? "Not generated yet for this cycle."
                : "Add ANTHROPIC_API_KEY on the server to enable this."}
          </p>
        </div>
        {aiAvailable && (
          <form
            action={async (formData) => {
              setError(null);
              const result = await refreshBudgetInsightsAction(formData);
              if (!result.ok) setError(result.error);
            }}
          >
            <input type="hidden" name="cycle_key" value={cycleKey} />
            <RefreshButton />
          </form>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose">{error}</p>}
    </section>
  );
}

function RefreshButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="dinx-tap shrink-0 rounded-full bg-plum-50 px-4 py-2 text-xs font-semibold text-plum-600 disabled:opacity-60"
    >
      {pending ? "Thinking…" : "Refresh"}
    </button>
  );
}

function ApplyCapsButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="dinx-tap w-full rounded-2xl bg-plum-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Applying…" : "Apply suggested caps to categories"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function SetupSheet({
  open,
  onClose,
  currency,
  monthlyIncome,
  savingsTargetType,
  savingsTargetValue,
}: {
  open: boolean;
  onClose: () => void;
  currency: string;
  monthlyIncome: number;
  savingsTargetType: SavingsTargetType;
  savingsTargetValue: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<SavingsTargetType>(savingsTargetType);
  const [income, setIncome] = useState(monthlyIncome > 0 ? String(monthlyIncome) : "");
  const [targetValue, setTargetValue] = useState(
    savingsTargetValue > 0 ? String(savingsTargetValue) : targetType === "percent" ? "20" : "",
  );

  const previewAmount = useMemo(() => {
    const incomeNum = Number.parseFloat(income) || 0;
    const targetNum = Number.parseFloat(targetValue) || 0;
    return targetType === "percent" ? (incomeNum * targetNum) / 100 : targetNum;
  }, [income, targetValue, targetType]);

  return (
    <Sheet open={open} onClose={onClose} title="Income & savings target">
      <form
        action={async (formData) => {
          const result = await saveBudgetSettingsAction(formData);
          if (result.ok) onClose();
          else setError(result.error);
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="budget-income" className="dinx-label">
            Combined income per cycle ({currency})
          </label>
          <input
            id="budget-income"
            name="monthly_income"
            type="text"
            inputMode="decimal"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            placeholder="3800"
            required
            className="dinx-field text-xl font-semibold"
          />
          <p className="mt-1 text-xs text-muted">What lands between the two of you each cycle, after tax.</p>
        </div>

        <div>
          <span className="dinx-label">Savings target</span>
          <div className="mb-2 flex rounded-full bg-page p-1">
            {[
              { value: "percent" as const, label: "% of income" },
              { value: "amount" as const, label: "Fixed amount" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTargetType(option.value)}
                className={`dinx-tap flex-1 rounded-full py-2 text-sm font-semibold ${
                  targetType === option.value ? "bg-card text-ink shadow-sm" : "text-muted"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="savings_target_type" value={targetType} />
          <input
            id="budget-target"
            name="savings_target_value"
            type="text"
            inputMode="decimal"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder={targetType === "percent" ? "20" : "500"}
            required
            className="dinx-field text-xl font-semibold"
          />
          <p className="mt-1 text-xs text-muted">
            {targetType === "percent" ? "20% is the usual benchmark to aim for." : "A fixed amount set aside every cycle."}
            {previewAmount > 0 && ` That's about ${money(previewAmount, currency)} a cycle.`}
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
            {error}
          </p>
        )}

        <SaveButton />
      </form>
    </Sheet>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="dinx-tap w-full rounded-2xl bg-plum-600 py-4 font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save budget"}
    </button>
  );
}
