import "server-only";

import { createHash } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";

import type { Allocation, BudgetPace, Forecast } from "@/lib/budget";
import { resolveSavingsTarget } from "@/lib/budget";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { HouseholdBudget } from "@/lib/types";

/**
 * The AI layer on top of `lib/budget.ts`. Every number sent to the model
 * comes from that rule-based engine — the model is only asked to turn real
 * numbers into specific, UK / Isle of Man aware wording, never to invent the
 * numbers themselves. Everything here is optional: with no ANTHROPIC_API_KEY
 * the budget page still works from the rule-based engine alone, the same way
 * statement import degrades to the deterministic parser.
 *
 * Uses Sonnet rather than the Haiku model statement import uses — turning a
 * couple's actual spending into specific, non-generic financial suggestions
 * benefits from the stronger model, and this only runs when the household
 * taps "Refresh insights", not on every page view.
 */

const MODEL = "claude-sonnet-4-5";

export function budgetAiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ---------------------------------------------------------------------------
// Input shaping — turns the engine's output into what the model sees
// ---------------------------------------------------------------------------

export type BudgetAiInput = {
  currency: string;
  cycleLabel: string;
  today: string;
  cycleEnd: string;
  daysLeft: number;
  elapsedPercent: number;
  income: number;
  savingsTargetLabel: string;
  savingsTargetAmount: number;
  spentSoFar: number;
  spendable: number;
  /** Sum of every category's fixedAmount — rent, loans, subscriptions: the household's known, non-negotiable monthly commitment. */
  fixedTotal: number;
  /** True when fixedTotal alone already exceeds spendable — no amount of trimming variable spend fixes this; the savings target or income figure needs revisiting. */
  overCommitted: boolean;
  pace: { status: string; overspend: number; safeToSpendPerDay: number };
  categories: {
    name: string;
    essential: boolean;
    /** A known, fixed recurring bill (rent, a loan, a subscription) — exact, not an estimate, and not negotiable within the cycle. Null if this category is not a fixed bill. */
    fixedAmount: number | null;
    spent: number;
    suggested: number;
    /** suggested − spent, floored at 0 — what's left to spend in this category for the rest of the cycle. */
    remaining: number;
    /** `remaining` spread over the days left — the daily figure that lands exactly on the suggested cap. */
    remainingPerDay: number;
    /** Average size of a single transaction logged in this category this cycle, if any — use this to translate a cash figure into "about N more of these". */
    avgTransactionAmount: number | null;
    transactionCount: number;
  }[];
  /** Credit cards in use, with their limit and how much of it is currently drawn. */
  creditCards: {
    name: string;
    limit: number | null;
    spentThisCycle: number;
    utilizationPercent: number | null;
  }[];
  forecast: {
    cyclesSampled: number;
    averageIncome: number;
    averageExpense: number;
    averageSaved: number;
    projectedAnnualSavings: number;
    savingsRateTrendPercent: number | null;
    risingCategories: { name: string; changePercent: number | null; recentAverage: number }[];
    fallingCategories: { name: string; changePercent: number | null; recentAverage: number }[];
  };
  partnerCount: number;
};

export function buildBudgetAiInput({
  currency,
  cycleLabel,
  today,
  cycleEnd,
  income,
  budget,
  spentSoFar,
  allocation,
  pace,
  forecast,
  categoryStats,
  creditCards,
  partnerCount,
}: {
  currency: string;
  cycleLabel: string;
  today: string;
  cycleEnd: string;
  income: number;
  budget: HouseholdBudget;
  spentSoFar: number;
  allocation: Allocation;
  pace: BudgetPace;
  forecast: Forecast;
  categoryStats: Map<string, { count: number; avgAmount: number }>;
  creditCards: { name: string; limit: number | null; spentThisCycle: number; utilizationPercent: number | null }[];
  partnerCount: number;
}): BudgetAiInput {
  const savingsTargetAmount = resolveSavingsTarget(budget, income);
  const savingsTargetLabel =
    budget.savings_target_type === "percent"
      ? `${budget.savings_target_value}% of income (${money(savingsTargetAmount, currency)})`
      : `${money(savingsTargetAmount, currency)} fixed each cycle`;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    currency,
    cycleLabel,
    today,
    cycleEnd,
    daysLeft: pace.daysLeft,
    elapsedPercent: Math.round(pace.elapsed * 100),
    income,
    savingsTargetLabel,
    savingsTargetAmount,
    spentSoFar,
    spendable: allocation.spendable,
    fixedTotal: round2(allocation.fixedTotal),
    overCommitted: allocation.overCommitted,
    pace: {
      status: pace.status,
      overspend: round2(pace.overspend),
      safeToSpendPerDay: round2(pace.safeToSpendPerDay),
    },
    categories: allocation.rows
      .filter((r) => r.spent > 0 || r.suggested > 0)
      .map((r) => {
        const remaining = Math.max(r.suggested - r.spent, 0);
        const stats = categoryStats.get(r.category.id);
        return {
          name: r.category.name,
          essential: r.essential,
          fixedAmount: r.fixedAmount > 0 ? r.fixedAmount : null,
          spent: r.spent,
          suggested: r.suggested,
          remaining: round2(remaining),
          remainingPerDay: pace.daysLeft > 0 ? round2(remaining / pace.daysLeft) : 0,
          avgTransactionAmount: stats ? round2(stats.avgAmount) : null,
          transactionCount: stats?.count ?? 0,
        };
      }),
    creditCards,
    forecast: {
      cyclesSampled: forecast.cyclesSampled,
      averageIncome: Math.round(forecast.averageIncome),
      averageExpense: Math.round(forecast.averageExpense),
      averageSaved: Math.round(forecast.averageSaved),
      projectedAnnualSavings: Math.round(forecast.projectedAnnualSavings),
      savingsRateTrendPercent:
        forecast.savingsRateTrend !== null ? Math.round(forecast.savingsRateTrend * 1000) / 10 : null,
      risingCategories: forecast.risingCategories.map((t) => ({
        name: t.category.name,
        changePercent: t.changeRatio !== null ? Math.round(t.changeRatio * 1000) / 10 : null,
        recentAverage: Math.round(t.recentAverage),
      })),
      fallingCategories: forecast.fallingCategories.map((t) => ({
        name: t.category.name,
        changePercent: t.changeRatio !== null ? Math.round(t.changeRatio * 1000) / 10 : null,
        recentAverage: Math.round(t.recentAverage),
      })),
    },
    partnerCount,
  };
}

// ---------------------------------------------------------------------------
// The model call
// ---------------------------------------------------------------------------

export type AiRecommendation = { id: string; title: string; action: string; impact: string | null };
export type AiTip = { title: string; body: string };

export type BudgetAiPayload = {
  recommendations: AiRecommendation[];
  forecast: { summary: string; tips: AiTip[] };
  regionalTips: AiTip[];
};

export type BudgetAiInsights = BudgetAiPayload & { generatedAt: string };

const SCHEMA = {
  type: "object" as const,
  properties: {
    recommendations: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          title: {
            type: "string" as const,
            description: "Short, specific action naming a real category, e.g. 'Cap Food & Drink at £50 for the rest of the cycle'",
          },
          action: {
            type: "string" as const,
            description:
              "One or two sentences using the category's own remaining/remainingPerDay/avgTransactionAmount — e.g. 'that's about £X a day, or roughly N more takeaways at your usual spend' — never invented figures",
          },
          impact: {
            type: "string" as const,
            description: "The £ figure this recommendation is grounded in, e.g. '£25/day for the next 4 days' or '2 more meals out this cycle', or '' if not quantifiable",
          },
        },
        required: ["title", "action", "impact"],
        additionalProperties: false,
      },
    },
    forecast_summary: {
      type: "string" as const,
      description:
        "2-3 sentences on where their saving/spending habits are heading over the next 3-12 months, grounded in the averages and trends given",
    },
    forecast_tips: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          title: { type: "string" as const },
          body: { type: "string" as const, description: "One concrete, doable action" },
        },
        required: ["title", "body"],
        additionalProperties: false,
      },
    },
    regional_tips: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          title: { type: "string" as const },
          body: {
            type: "string" as const,
            description:
              "A specific, doable action available in the UK or Isle of Man, naming real institutions/services where relevant",
          },
        },
        required: ["title", "body"],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations", "forecast_summary", "forecast_tips", "regional_tips"],
  additionalProperties: false,
};

const SYSTEM = `You are a budgeting co-pilot inside DINX, a shared expense tracker used by a couple who live in the United Kingdom or the Isle of Man. You are shown one household's real numbers for the current budget cycle, per-category detail, credit card usage, and recent trends. Your entire value is turning those specific numbers into specific, doable actions — a household that wanted generic money advice would not have opened this screen.

Ban list — never do any of this:
- Never say "spend less", "make a budget", "track your spending", "review your subscriptions" or any variant with no number attached.
- Never suggest a generic action unconnected to what THIS household's data shows (no "consider switching supplier" unless a category/amount in the input actually points at it, no "book travel in advance" unless travel spend is in the data, no "open a savings account" as filler).
- Never invent a number — every £ figure you write must be one you were given or simple arithmetic on numbers you were given (e.g. remaining ÷ avgTransactionAmount).
- No disclaimers, no "I recommend", no preamble. State the action.

How to use the numbers you're given, category by category:
- Each category has "remaining" (what's left of its suggested cap for the rest of the cycle) and "remainingPerDay" (that spread evenly over the days left) — use these directly for pacing language: "keep Groceries to about £remainingPerDay a day and you land around £suggested for the cycle", not your own arithmetic.
- When a discretionary ("want") category has both "remaining" and "avgTransactionAmount", translate the cash figure into a count of real things: remaining ÷ avgTransactionAmount ≈ how many more of that thing they can still have this cycle (e.g. "that's roughly 2 more takeaways at your usual spend"). Round down and say "about". Do this whenever the numbers support it — it's the single most useful thing you can tell them, more useful than a raw £ figure.
- "today" and "cycleEnd" are given so you can talk about a specific near-term window (e.g. this weekend, the next few days) when daysLeft is small enough that it's meaningful — don't invent calendar details you can't derive from the dates given.
- A category with essential: true is a need (rent, bills, groceries, transport, health, insurance) — don't suggest cutting these, only flag if spend looks unusually high against its own suggested figure. Focus recommendations on essential: false (want) categories first.
- A category with fixedAmount set is a known, exact recurring bill — rent, a loan repayment, a subscription — logged in the household's own Planned expenses, not a guess. Its "suggested" figure IS that fixed amount. NEVER suggest reducing, capping differently, or "targeting" a fixed category — it isn't discretionary and doesn't get cheaper by budgeting harder. The only thing worth saying about a fixed category is if spent already exceeds fixedAmount (something's off — maybe it was paid twice, or logged wrong).
- If top-level "overCommitted" is true, fixedTotal (their rent + loans + other committed bills) already exceeds spendable on its own — say this plainly as the top recommendation. The fix is revisiting the savings target or income figure, not trimming a "want" category; trimming discretionary spend cannot close a gap caused by fixed bills alone.

Credit cards — get this right, it matters:
- Each entry in "creditCards" has a limit and how much of that limit is currently drawn (spentThisCycle / utilizationPercent). Paying a card off in full frees the limit to be reused — it does NOT create new spendable money and does NOT mean the household can afford to spend that amount again. Never say anything implying a freed-up limit is available budget.
- The household's goal is to minimise total spending, full stop — a card's utilization resetting to 0% is not itself progress. If utilization is high, that reflects real spending already counted in the category numbers above; don't double-count it or treat it as a separate problem from those categories.

Sections:
- "recommendations": for the REST of this cycle only — things actionable in days. Ground every one in a specific category's remaining/remainingPerDay/avgTransactionAmount. If the household is already on track or ahead everywhere, say so plainly for one category and suggest where the spare money in "remaining" could go instead (e.g. toward the savings target) rather than inventing a problem.
- "forecast_tips": 3-12 months out, grounded in "forecast" (averages, projectedAnnualSavings, rising/falling categories) — a specific habit or one-off decision tied to a named category or trend figure, not a generic savings tip. forecast.cyclesSampled tells you how much real history this is drawn from — if it's 1 or 2, say in forecast_summary that this is an early read from this cycle (name the actual figure, e.g. "based on this cycle's ~£X so far") that will sharpen as more cycles land, rather than presenting projectedAnnualSavings as if it were a settled trend.
- "regional_tips": actions specifically available in the United Kingdom or the Isle of Man, and each one must tie back to something in this household's own data (a category, an amount, a card) — not a generic listicle entry. E.g. if Transport or fuel spend is present, something about that; if there's a credit card, something about repayment/interest; if Groceries is large, an on-island/UK-specific comparison. Name real institutions where useful (Manx Utilities, Isle of Man Bank, Nationwide IOM, Cumberland, Conister, Steam Packet, an employer pension scheme, NS&I, gov.im, HMRC, Ofgem), and never state a specific interest rate, tax band, allowance or date — tell the reader to check the current figure instead. Do not suggest booking travel, buying anything, or opening a product unless the household's own category data shows that's actually relevant to them. Isle of Man residents are generally outside the UK's Ofgem price cap and cannot hold a UK ISA — don't suggest either unless the data implies a UK household.
- One to two sentences per body, dense with the household's own numbers, not general reassurance.`;

/**
 * Calls the model. Returns null on any failure — unavailable key, refusal,
 * malformed JSON, network error — so callers always have the rule-based
 * numbers to fall back to.
 */
export async function requestBudgetInsights(input: BudgetAiInput): Promise<BudgetAiPayload | null> {
  if (!budgetAiAvailable()) return null;

  try {
    const client = new Anthropic();

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
    });

    if (response.stop_reason === "refusal") return null;

    const body = response.content.find((block) => block.type === "text");
    if (!body || body.type !== "text") return null;

    const parsed = JSON.parse(body.text) as {
      recommendations?: { title: string; action: string; impact: string }[];
      forecast_summary?: string;
      forecast_tips?: AiTip[];
      regional_tips?: AiTip[];
    };

    return {
      recommendations: (parsed.recommendations ?? []).slice(0, 4).map((r, i) => ({
        id: `ai-rec-${i}`,
        title: r.title,
        action: r.action,
        impact: r.impact?.trim() || null,
      })),
      forecast: {
        summary: parsed.forecast_summary ?? "",
        tips: (parsed.forecast_tips ?? []).slice(0, 3),
      },
      regionalTips: (parsed.regional_tips ?? []).slice(0, 3),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache — regenerated on demand, not on every page load
// ---------------------------------------------------------------------------

function hashInput(input: BudgetAiInput): string {
  return createHash("sha1").update(JSON.stringify(input)).digest("hex");
}

export type CachedBudgetInsights = BudgetAiInsights & { cycleKey: string; inputHash: string };

export async function getCachedBudgetInsights(householdId: string): Promise<CachedBudgetInsights | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("budget_ai_cache")
    .select("*")
    .eq("household_id", householdId)
    .maybeSingle();

  if (!data) return null;

  const payload = data.payload as BudgetAiPayload;
  return {
    ...payload,
    generatedAt: data.generated_at,
    cycleKey: data.cycle_key,
    inputHash: data.input_hash,
  };
}

/** True when the cache still matches the cycle being viewed and the numbers behind it. */
export function isCacheFresh(
  cache: CachedBudgetInsights | null,
  cycleKey: string,
  input: BudgetAiInput,
): boolean {
  return Boolean(cache) && cache!.cycleKey === cycleKey && cache!.inputHash === hashInput(input);
}

/**
 * Regenerates and stores a fresh read. Returns null if the model call failed
 * or AI is unavailable — the cache is left untouched in that case so a
 * transient failure doesn't wipe out the last good read.
 */
export async function refreshBudgetInsights(
  householdId: string,
  cycleKey: string,
  input: BudgetAiInput,
): Promise<BudgetAiInsights | null> {
  const result = await requestBudgetInsights(input);
  if (!result) return null;

  const supabase = await createClient();
  const generatedAt = new Date().toISOString();

  await supabase.from("budget_ai_cache").upsert({
    household_id: householdId,
    cycle_key: cycleKey,
    input_hash: hashInput(input),
    payload: result,
    generated_at: generatedAt,
  });

  return { ...result, generatedAt };
}
