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
  daysLeft: number;
  elapsedPercent: number;
  income: number;
  savingsTargetLabel: string;
  savingsTargetAmount: number;
  spentSoFar: number;
  spendable: number;
  pace: { status: string; overspend: number; safeToSpendPerDay: number };
  categories: { name: string; spent: number; suggested: number; essential: boolean }[];
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
  income,
  budget,
  spentSoFar,
  allocation,
  pace,
  forecast,
  partnerCount,
}: {
  currency: string;
  cycleLabel: string;
  income: number;
  budget: HouseholdBudget;
  spentSoFar: number;
  allocation: Allocation;
  pace: BudgetPace;
  forecast: Forecast;
  partnerCount: number;
}): BudgetAiInput {
  const savingsTargetAmount = resolveSavingsTarget(budget, income);
  const savingsTargetLabel =
    budget.savings_target_type === "percent"
      ? `${budget.savings_target_value}% of income (${money(savingsTargetAmount, currency)})`
      : `${money(savingsTargetAmount, currency)} fixed each cycle`;

  return {
    currency,
    cycleLabel,
    daysLeft: pace.daysLeft,
    elapsedPercent: Math.round(pace.elapsed * 100),
    income,
    savingsTargetLabel,
    savingsTargetAmount,
    spentSoFar,
    spendable: allocation.spendable,
    pace: {
      status: pace.status,
      overspend: Math.round(pace.overspend * 100) / 100,
      safeToSpendPerDay: Math.round(pace.safeToSpendPerDay * 100) / 100,
    },
    categories: allocation.rows
      .filter((r) => r.spent > 0 || r.suggested > 0)
      .map((r) => ({
        name: r.category.name,
        spent: r.spent,
        suggested: r.suggested,
        essential: r.essential,
      })),
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
            description: "Short, specific action, e.g. 'Skip two takeaway orders this week'",
          },
          action: {
            type: "string" as const,
            description:
              "One or two sentences explaining exactly what to do and why, referencing the real numbers given",
          },
          impact: {
            type: "string" as const,
            description: "Rough cash impact this cycle, e.g. '~£25 back toward your target', or '' if not quantifiable",
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

const SYSTEM = `You are a budgeting co-pilot inside DINX, a shared expense tracker used by a couple who live in the United Kingdom or the Isle of Man.

You are given one household's real numbers for the current budget cycle, plus recent trends. Turn them into specific, doable actions — never generic filler like "spend less" or "make a budget", and never invent numbers you were not given.

Rules:
- Every recommendation must reference the real figures or category names you were given.
- "recommendations" are for the REST of this cycle — things that can be acted on in days, not months. If the household is already on track or ahead, say so plainly and suggest where the spare money could usefully go instead of inventing a problem.
- "forecast_tips" look 3-12 months out: habits, one-off decisions, or accounts worth setting up, grounded in the trend data given.
- "regional_tips" must be actions realistically available specifically in the United Kingdom or the Isle of Man. Where useful, name real institutions or services (e.g. Manx Utilities, Isle of Man Bank, Nationwide IOM, Cumberland, Conister, Steam Packet, an employer pension scheme, NS&I, gov.im, HMRC, Ofgem). Do not state specific interest rates, tax bands, allowances or dates — those change and go stale. Tell the reader to check the current figure instead of stating one.
- One or two sentences per body. No preamble, no "I recommend", no disclaimers inside the JSON — state the action directly.
- Isle of Man residents are generally outside the UK's Ofgem price cap and cannot hold a UK ISA — do not suggest either as if they applied, unless the household's numbers suggest they are UK-based.`;

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
