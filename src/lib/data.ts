import { cache } from "react";
import { redirect } from "next/navigation";

import { cycleBounds, cycleFor, type Cycle } from "@/lib/cycle";
import { createClient } from "@/lib/supabase/server";
import type {
  Category,
  FixedExpense,
  Household,
  PaymentMethod,
  PlannedExpense,
  PlannedPayment,
  Profile,
  SavingsContribution,
  SavingsGoal,
  TransactionWithRefs,
} from "@/lib/types";

/** Everything every screen needs: who you are, and the household you share. */
export type SessionContext = {
  profile: Profile;
  household: Household;
  members: Profile[];
  partner: Profile | null;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  /** One-tap shortcuts, surfaced on the add sheet from every screen. */
  fixedExpenses: FixedExpense[];
  /** Active goals, surfaced on the add sheet so a deposit can be logged there. */
  savingsGoals: SavingsGoal[];
};

const TXN_SELECT = `
  *,
  category:categories (id, name, emoji, color),
  payment_method:payment_methods (id, name, color, type)
`;

type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };

/**
 * Backfills the `profiles` row for an account that predates the schema
 * trigger. Throws rather than redirecting: a failure here means the schema
 * has not been applied, and a redirect would only spin.
 */
async function createMissingProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: AuthUser,
): Promise<Profile> {
  const displayName =
    (typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name) ||
    user.email?.split("@")[0] ||
    "Me";

  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: displayName }, { onConflict: "id" })
    .select("*")
    .single<Profile>();

  if (error || !data) {
    throw new Error(`Could not create your DINX profile: ${describeDbError(error)}`);
  }

  return data;
}

/** Maps the Postgres failures we can actually act on to a real instruction. */
function describeDbError(error: { message: string; code?: string } | null): string {
  const message = error?.message ?? "unknown error";

  // 42501 = insufficient_privilege. The table exists but the `authenticated`
  // role was never granted access — the grants block at the end of
  // supabase/schema.sql is what fixes it.
  if (error?.code === "42501" || /permission denied/i.test(message)) {
    return `${message}. The tables exist but the "authenticated" role has no privileges on them — re-run the grants section at the end of supabase/schema.sql.`;
  }

  // 42P01 = undefined_table.
  if (error?.code === "42P01" || /does not exist/i.test(message)) {
    return `${message}. Run supabase/schema.sql against this project first.`;
  }

  return message;
}

/**
 * Loads the session context, redirecting to login/onboarding when the user
 * is not ready to see the app yet.
 *
 * Wrapped in React's `cache` so the layout and the page it renders share one
 * result. Without it every navigation ran this twice — two auth round trips
 * and eight redundant queries per screen.
 */
export const requireContext = cache(async function requireContext(): Promise<SessionContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  // An account can exist in auth.users with no profile row — most commonly
  // when it was created before schema.sql (and its on_auth_user_created
  // trigger) was applied. Redirecting to /login here would loop forever,
  // because the middleware sends signed-in users straight back. Heal it by
  // creating the row the trigger would have made.
  const profile = existing ?? (await createMissingProfile(supabase, user));

  if (!profile.household_id) redirect("/onboarding");

  const [householdRes, membersRes, categoriesRes, methodsRes, fixedRes, goalsRes] = await Promise.all([
    supabase.from("households").select("*").eq("id", profile.household_id).single<Household>(),
    supabase
      .from("profiles")
      .select("*")
      .eq("household_id", profile.household_id)
      .order("created_at"),
    supabase
      .from("categories")
      .select("*")
      .eq("household_id", profile.household_id)
      .eq("archived", false)
      .order("sort_order")
      .order("name"),
    supabase
      .from("payment_methods")
      .select("*")
      .eq("household_id", profile.household_id)
      .eq("archived", false)
      .order("sort_order")
      .order("name"),
    supabase
      .from("fixed_expenses")
      .select("*")
      .eq("household_id", profile.household_id)
      .eq("archived", false)
      .order("use_count", { ascending: false })
      .order("sort_order"),
    supabase
      .from("savings_goals")
      .select("*")
      .eq("household_id", profile.household_id)
      .eq("archived", false)
      .order("created_at"),
  ]);

  if (!householdRes.data) redirect("/onboarding");

  const members = (membersRes.data ?? []) as Profile[];

  return {
    profile,
    household: householdRes.data,
    members,
    partner: members.find((m) => m.id !== profile.id) ?? null,
    categories: (categoriesRes.data ?? []) as Category[],
    paymentMethods: (methodsRes.data ?? []) as PaymentMethod[],
    // Tolerate a missing table so the app still runs before the fixed-expenses
    // migration has been applied.
    fixedExpenses: (fixedRes.data ?? []) as FixedExpense[],
    savingsGoals: (goalsRes.data ?? []) as SavingsGoal[],
  };
});

/** The cycle currently being viewed, from `?cycle=yyyy-MM-dd` or today. */
export function resolveCycle(household: Household, cycleKey?: string): Cycle {
  return cycleFor(
    cycleKey ? cycleKey : new Date(),
    household.cycle_start_day,
    household.cycle_label_mode,
  );
}

export async function getTransactions(
  householdId: string,
  cycle: Cycle,
): Promise<TransactionWithRefs[]> {
  const supabase = await createClient();
  const { from, to } = cycleBounds(cycle);

  const { data } = await supabase
    .from("transactions")
    .select(TXN_SELECT)
    .eq("household_id", householdId)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as TransactionWithRefs[];
}

export type CycleTotals = {
  expense: number;
  income: number;
  salary: number;
  extra: number;
  saved: number;
  /**
   * income − expense. Deliberately excludes `saved` — savings are tracked as
   * their own isolated thing and never subtracted from what's "left".
   */
  net: number;
  byCategory: Map<string, number>;
  byPerson: Map<string, { expense: number; income: number; saved: number }>;
  byPaymentMethod: Map<string, number>;
};

export function totalsFor(
  transactions: TransactionWithRefs[],
  contributions: SavingsContribution[] = [],
): CycleTotals {
  const totals: CycleTotals = {
    expense: 0,
    income: 0,
    salary: 0,
    extra: 0,
    saved: 0,
    net: 0,
    byCategory: new Map(),
    byPerson: new Map(),
    byPaymentMethod: new Map(),
  };

  const person = (id: string) => {
    if (!totals.byPerson.has(id)) totals.byPerson.set(id, { expense: 0, income: 0, saved: 0 });
    return totals.byPerson.get(id)!;
  };

  for (const t of transactions) {
    const amount = Number(t.amount);
    if (t.kind === "expense") {
      totals.expense += amount;
      person(t.paid_by).expense += amount;
      if (t.category_id) {
        totals.byCategory.set(t.category_id, (totals.byCategory.get(t.category_id) ?? 0) + amount);
      }
      if (t.payment_method_id) {
        totals.byPaymentMethod.set(
          t.payment_method_id,
          (totals.byPaymentMethod.get(t.payment_method_id) ?? 0) + amount,
        );
      }
    } else {
      totals.income += amount;
      person(t.paid_by).income += amount;
      if (t.income_kind === "extra") totals.extra += amount;
      else totals.salary += amount;
    }
  }

  for (const c of contributions) {
    const amount = Number(c.amount);
    totals.saved += amount;
    person(c.paid_by).saved += amount;
  }

  totals.net = totals.income - totals.expense;
  return totals;
}

export async function getSavingsContributions(
  householdId: string,
  cycle?: Cycle,
): Promise<SavingsContribution[]> {
  const supabase = await createClient();
  let query = supabase
    .from("savings_contributions")
    .select("*")
    .eq("household_id", householdId)
    .order("occurred_on", { ascending: false });

  if (cycle) {
    const { from, to } = cycleBounds(cycle);
    query = query.gte("occurred_on", from).lte("occurred_on", to);
  }

  const { data } = await query;
  return (data ?? []) as SavingsContribution[];
}

/** Fixed expenses, most-used first so the quick-add rail stays useful. */
export async function getFixedExpenses(householdId: string): Promise<FixedExpense[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fixed_expenses")
    .select("*")
    .eq("household_id", householdId)
    .eq("archived", false)
    .order("sort_order")
    .order("use_count", { ascending: false })
    .order("name");
  return (data ?? []) as FixedExpense[];
}

export async function getSavingsGoals(householdId: string): Promise<SavingsGoal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("household_id", householdId)
    .eq("archived", false)
    .order("created_at");
  return (data ?? []) as SavingsGoal[];
}

export async function getPlanned(
  householdId: string,
  cycle: Cycle,
): Promise<{ expenses: PlannedExpense[]; payments: PlannedPayment[] }> {
  const supabase = await createClient();
  const { from } = cycleBounds(cycle);

  const [expensesRes, paymentsRes] = await Promise.all([
    supabase
      .from("planned_expenses")
      .select("*")
      .eq("household_id", householdId)
      .eq("active", true)
      .order("due_day", { nullsFirst: false }),
    supabase
      .from("planned_payments")
      .select("*")
      .eq("household_id", householdId)
      .eq("cycle_start", from),
  ]);

  return {
    expenses: (expensesRes.data ?? []) as PlannedExpense[],
    payments: (paymentsRes.data ?? []) as PlannedPayment[],
  };
}

/**
 * Per-cycle expense totals for the dashboard bar chart. One grouped query
 * covering the whole span, bucketed in memory — cheaper than N round trips.
 */
export async function getCycleTrend(
  householdId: string,
  cycles: Cycle[],
): Promise<{ cycle: Cycle; expense: number; income: number }[]> {
  const supabase = await createClient();
  if (cycles.length === 0) return [];

  const from = cycleBounds(cycles[0]).from;
  const to = cycleBounds(cycles[cycles.length - 1]).to;

  const { data } = await supabase
    .from("transactions")
    .select("amount, kind, occurred_on")
    .eq("household_id", householdId)
    .gte("occurred_on", from)
    .lte("occurred_on", to);

  return cycles.map((cycle) => {
    const bounds = cycleBounds(cycle);
    let expense = 0;
    let income = 0;
    for (const row of data ?? []) {
      const d = row.occurred_on as string;
      if (d < bounds.from || d > bounds.to) continue;
      if (row.kind === "expense") expense += Number(row.amount);
      else income += Number(row.amount);
    }
    return { cycle, expense, income };
  });
}

/**
 * Who owes whom. Shared expenses are split by `split_percent`; the payer
 * covers the whole bill, so the other person owes their share back.
 * Positive result = `members[1]` owes `members[0]`.
 */
export function settlementBalance(
  transactions: TransactionWithRefs[],
  members: Profile[],
): { from: Profile; to: Profile; amount: number } | null {
  if (members.length < 2) return null;
  const [a, b] = members;
  let balance = 0;

  for (const t of transactions) {
    if (t.kind !== "expense" || !t.is_shared) continue;
    const amount = Number(t.amount);
    // The payer fronted the whole amount but only owes their own share.
    const payerShare = (amount * t.split_percent) / 100;
    const owedToPayer = amount - payerShare;
    if (t.paid_by === a.id) balance += owedToPayer;
    else if (t.paid_by === b.id) balance -= owedToPayer;
  }

  if (Math.abs(balance) < 0.01) return null;
  return balance > 0
    ? { from: b, to: a, amount: balance }
    : { from: a, to: b, amount: -balance };
}
