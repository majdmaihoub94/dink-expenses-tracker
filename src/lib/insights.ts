import { cycleProgress, daysRemaining, type Cycle } from "@/lib/cycle";
import type { CycleTotals } from "@/lib/data";
import { money, percent } from "@/lib/format";
import type { Category, PlannedExpense, SavingsGoal } from "@/lib/types";

export type InsightTone = "good" | "warn" | "bad" | "info";

export type Insight = {
  id: string;
  tone: InsightTone;
  emoji: string;
  title: string;
  body: string;
};

type BuildArgs = {
  cycle: Cycle;
  totals: CycleTotals;
  previousTotals?: CycleTotals | null;
  categories: Category[];
  goals: SavingsGoal[];
  goalProgress: Map<string, number>;
  planned: PlannedExpense[];
  plannedPaidIds: Set<string>;
  currency: string;
};

/**
 * Turns the cycle's numbers into plain-language observations. Everything here
 * is derived from the household's own data — no generic filler.
 */
export function buildInsights(args: BuildArgs): Insight[] {
  const {
    cycle,
    totals,
    previousTotals,
    categories,
    goals,
    goalProgress,
    planned,
    plannedPaidIds,
    currency,
  } = args;

  const out: Insight[] = [];
  const elapsed = cycleProgress(cycle);
  const left = daysRemaining(cycle);
  const isLive = elapsed > 0 && elapsed < 1;

  // --- Pace: are we spending faster than the month is passing? --------------
  if (isLive && totals.income > 0 && totals.expense > 0) {
    const spendRatio = totals.expense / totals.income;
    if (spendRatio > elapsed + 0.15) {
      const projected = totals.expense / Math.max(elapsed, 0.05);
      out.push({
        id: "pace-fast",
        tone: "bad",
        emoji: "🔥",
        title: "Spending ahead of the month",
        body: `You're ${percent(elapsed)} through the cycle but have spent ${percent(
          spendRatio,
        )} of your income. At this rate you'll finish around ${money(projected, currency)}.`,
      });
    } else if (spendRatio < elapsed - 0.15) {
      out.push({
        id: "pace-slow",
        tone: "good",
        emoji: "🌱",
        title: "Comfortably under pace",
        body: `${percent(elapsed)} of the cycle gone, only ${percent(
          spendRatio,
        )} of income spent. Keep it up and you'll bank the difference.`,
      });
    }
  }

  // --- Safe-to-spend per day ------------------------------------------------
  if (isLive && totals.net > 0 && left > 0) {
    out.push({
      id: "daily-allowance",
      tone: "info",
      emoji: "🧮",
      title: "Safe to spend",
      body: `${money(totals.net, currency)} left across ${left} day${
        left === 1 ? "" : "s"
      } — about ${money(totals.net / left, currency)} a day.`,
    });
  }

  // --- Overspent -----------------------------------------------------------
  if (totals.net < 0) {
    out.push({
      id: "over-budget",
      tone: "bad",
      emoji: "⚠️",
      title: "Over budget this cycle",
      body: `Outgoings exceed income by ${money(
        Math.abs(totals.net),
        currency,
      )}. Worth checking the biggest category below before the 25th.`,
    });
  }

  // --- Category caps --------------------------------------------------------
  for (const category of categories) {
    if (!category.monthly_budget || category.monthly_budget <= 0) continue;
    const spent = totals.byCategory.get(category.id) ?? 0;
    const ratio = spent / Number(category.monthly_budget);
    if (ratio >= 1) {
      out.push({
        id: `cap-over-${category.id}`,
        tone: "bad",
        emoji: category.emoji,
        title: `${category.name} is over its cap`,
        body: `${money(spent, currency)} spent against a ${money(
          Number(category.monthly_budget),
          currency,
        )} limit.`,
      });
    } else if (ratio >= 0.8 && isLive) {
      out.push({
        id: `cap-near-${category.id}`,
        tone: "warn",
        emoji: category.emoji,
        title: `${category.name} nearly maxed`,
        body: `${percent(ratio)} of the ${money(
          Number(category.monthly_budget),
          currency,
        )} cap used with ${left} day${left === 1 ? "" : "s"} to go.`,
      });
    }
  }

  // --- Biggest category vs last cycle --------------------------------------
  const biggest = [...totals.byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  if (biggest) {
    const category = categories.find((c) => c.id === biggest[0]);
    if (category) {
      const share = totals.expense > 0 ? biggest[1] / totals.expense : 0;
      const prior = previousTotals?.byCategory.get(category.id) ?? 0;
      const delta = prior > 0 ? (biggest[1] - prior) / prior : null;

      out.push({
        id: "top-category",
        tone: share > 0.4 ? "warn" : "info",
        emoji: category.emoji,
        title: `${category.name} leads the cycle`,
        body:
          `${money(biggest[1], currency)} — ${percent(share)} of everything you spent.` +
          (delta !== null
            ? ` That's ${percent(Math.abs(delta))} ${delta >= 0 ? "more" : "less"} than last cycle.`
            : ""),
      });
    }
  }

  // --- Cycle-over-cycle movement -------------------------------------------
  if (previousTotals && previousTotals.expense > 0) {
    const delta = (totals.expense - previousTotals.expense) / previousTotals.expense;
    if (Math.abs(delta) >= 0.1) {
      out.push({
        id: "trend",
        tone: delta < 0 ? "good" : "warn",
        emoji: delta < 0 ? "📉" : "📈",
        title: delta < 0 ? "Spending is down" : "Spending is up",
        body: `${percent(Math.abs(delta))} ${
          delta < 0 ? "less" : "more"
        } than the previous cycle (${money(previousTotals.expense, currency)}).`,
      });
    }
  }

  // --- Savings rate ---------------------------------------------------------
  if (totals.income > 0) {
    const rate = totals.saved / totals.income;
    if (rate >= 0.2) {
      out.push({
        id: "savings-strong",
        tone: "good",
        emoji: "🏆",
        title: `Saving ${percent(rate)} of income`,
        body: `${money(totals.saved, currency)} put aside this cycle. Anything above 20% is a strong month.`,
      });
    } else if (totals.saved === 0 && elapsed > 0.5) {
      out.push({
        id: "savings-none",
        tone: "warn",
        emoji: "🐖",
        title: "Nothing saved yet",
        body: "Move something across before the 25th, even a small amount — consistency beats size.",
      });
    }
  }

  // --- Goals ----------------------------------------------------------------
  for (const goal of goals) {
    const saved = goalProgress.get(goal.id) ?? 0;
    const ratio = saved / Number(goal.target_amount);
    if (ratio >= 1) {
      out.push({
        id: `goal-done-${goal.id}`,
        tone: "good",
        emoji: "🎉",
        title: `${goal.name} is funded`,
        body: `${money(saved, currency)} of ${money(
          Number(goal.target_amount),
          currency,
        )} — target reached.`,
      });
    } else if (goal.monthly_target && isLive) {
      const thisCycle = totals.saved;
      if (thisCycle < Number(goal.monthly_target) * elapsed * 0.6) {
        out.push({
          id: `goal-behind-${goal.id}`,
          tone: "warn",
          emoji: goal.emoji,
          title: `${goal.name} is behind pace`,
          body: `Aiming for ${money(
            Number(goal.monthly_target),
            currency,
          )} a cycle. ${money(thisCycle, currency)} in so far.`,
        });
      }
    }
  }

  // --- Unpaid planned expenses ---------------------------------------------
  const unpaid = planned.filter((p) => !plannedPaidIds.has(p.id));
  if (unpaid.length > 0 && isLive) {
    const outstanding = unpaid.reduce((sum, p) => sum + Number(p.amount), 0);
    out.push({
      id: "planned-outstanding",
      tone: left <= 5 ? "warn" : "info",
      emoji: "📌",
      title: `${unpaid.length} expected bill${unpaid.length === 1 ? "" : "s"} unpaid`,
      body: `${money(outstanding, currency)} still to go out${
        left <= 5 ? ` and only ${left} day${left === 1 ? "" : "s"} left` : ""
      }.`,
    });
  }

  // --- Extra income ---------------------------------------------------------
  if (totals.extra > 0) {
    out.push({
      id: "extra-income",
      tone: "info",
      emoji: "✨",
      title: `${money(totals.extra, currency)} of extra income`,
      body: "Money you weren't counting on. Sending it straight to a goal is the easiest win there is.",
    });
  }

  return out;
}

export type Tip = { id: string; emoji: string; title: string; body: string };

/** Evergreen advice, shown under the data-driven insights. */
export const SAVING_TIPS: Tip[] = [
  {
    id: "pay-yourself",
    emoji: "🥇",
    title: "Pay yourselves first",
    body: "Move savings on the 25th, the day the money lands — not whatever survives to the 24th.",
  },
  {
    id: "one-cycle-rule",
    emoji: "⏳",
    title: "The one-cycle rule",
    body: "For any non-essential over £100, log it as a wish and revisit on the next 25th. Most urges don't survive a cycle.",
  },
  {
    id: "subs-audit",
    emoji: "📺",
    title: "Audit subscriptions quarterly",
    body: "Filter to Subscriptions and scan the last three cycles. Anything you can't remember using, cancel.",
  },
  {
    id: "credit-first",
    emoji: "💳",
    title: "Clear the credit card in full",
    body: "Interest on a revolving balance will out-earn any savings account you have. It's the highest-return move available.",
  },
  {
    id: "buffer",
    emoji: "🛟",
    title: "Build a one-cycle buffer",
    body: "One full month of outgoings in an instant-access account turns most emergencies into an inconvenience.",
  },
  {
    id: "shared-first",
    emoji: "🤝",
    title: "Agree a 'no-questions' number",
    body: "Pick an amount either of you can spend without checking in. It removes most money friction in a couple.",
  },
  {
    id: "grocery-gap",
    emoji: "🛒",
    title: "Groceries are the softest line",
    body: "It's usually the largest category you fully control. A 15% trim there beats squeezing five small ones.",
  },
  {
    id: "round-up",
    emoji: "🪙",
    title: "Round up the leftovers",
    body: "Whatever's left on the 24th, sweep into a goal instead of rolling it forward. It stops the ratchet.",
  },
];
