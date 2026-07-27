"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { cycleBounds, cycleFor } from "@/lib/cycle";
import { money } from "@/lib/format";
import { notifyHousehold } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import type { Household, Profile } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const OK: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

/** Resolves the caller's profile + household, or throws. */
async function requireActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile?.household_id) redirect("/onboarding");

  const { data: household } = await supabase
    .from("households")
    .select("*")
    .eq("id", profile.household_id)
    .single<Household>();

  if (!household) redirect("/onboarding");

  return { supabase, profile, household, householdId: profile.household_id };
}

function refreshAll() {
  revalidatePath("/", "layout");
}

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function num(form: FormData, key: string): number {
  const value = Number.parseFloat(String(form.get(key) ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function bool(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === "on" || value === "true" || value === "1";
}

// ---------------------------------------------------------------------------
// Household setup
// ---------------------------------------------------------------------------

export async function createHouseholdAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const displayName = str(formData, "display_name");
  const emoji = str(formData, "emoji") || "🙂";

  if (displayName) {
    await supabase.from("profiles").update({ display_name: displayName, emoji }).eq("id", user.id);
  }

  const { error } = await supabase.rpc("create_household", {
    household_name: str(formData, "household_name") || "Our household",
  });

  if (error) return fail(error.message);

  refreshAll();
  redirect("/");
}

export async function joinHouseholdAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const displayName = str(formData, "display_name");
  const emoji = str(formData, "emoji") || "🙂";

  if (displayName) {
    await supabase.from("profiles").update({ display_name: displayName, emoji }).eq("id", user.id);
  }

  const { error } = await supabase.rpc("join_household", { code: str(formData, "invite_code") });
  if (error) return fail(error.message);

  refreshAll();
  redirect("/");
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export async function addTransactionAction(formData: FormData): Promise<ActionResult> {
  const { supabase, profile, household, householdId } = await requireActor();

  const amount = num(formData, "amount");
  if (amount <= 0) return fail("Enter an amount greater than zero.");

  const kind = str(formData, "kind") === "income" ? "income" : "expense";
  // Defaults to the logger, but either person can file it under the other.
  const paidBy = str(formData, "paid_by") || profile.id;
  const categoryId = str(formData, "category_id") || null;
  const paymentMethodId = str(formData, "payment_method_id") || null;

  const { data: inserted, error } = await supabase
    .from("transactions")
    .insert({
      household_id: householdId,
      kind,
      amount,
      tax_amount: num(formData, "tax_amount"),
      income_kind: kind === "income" ? str(formData, "income_kind") || "salary" : null,
      category_id: categoryId,
      payment_method_id: kind === "expense" ? paymentMethodId : paymentMethodId,
      paid_by: paidBy,
      created_by: profile.id,
      merchant: str(formData, "merchant") || null,
      note: str(formData, "note") || null,
      occurred_on: str(formData, "occurred_on") || new Date().toISOString().slice(0, 10),
      is_shared: kind === "expense" ? bool(formData, "is_shared") : false,
      split_percent: Number(str(formData, "split_percent") || "50"),
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  const categoryName = categoryId
    ? ((
        await supabase.from("categories").select("name").eq("id", categoryId).single()
      ).data?.name ?? null)
    : null;

  const label = str(formData, "merchant") || categoryName || (kind === "income" ? "Income" : "Expense");

  await supabase.from("activity_events").insert({
    household_id: householdId,
    type: kind === "income" ? "income_added" : "expense_added",
    actor_id: profile.id,
    payload: {
      transaction_id: inserted?.id,
      amount,
      label,
      kind,
      paid_by: paidBy,
      on_behalf: paidBy !== profile.id,
    },
  });

  await notifyHousehold({
    householdId,
    actorId: profile.id,
    pref: kind === "income" ? "notify_partner_income" : "notify_partner_expense",
    payload: {
      title:
        kind === "income"
          ? `${profile.display_name} logged income`
          : `${profile.display_name} spent ${money(amount, household.currency)}`,
      body:
        kind === "income"
          ? `${money(amount, household.currency)} · ${label}`
          : `${label}${categoryName ? ` · ${categoryName}` : ""}`,
      url: "/transactions",
      tag: `txn-${inserted?.id}`,
    },
  });

  refreshAll();
  return OK;
}

export async function deleteTransactionAction(formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireActor();
  const id = str(formData, "id");
  if (!id) return fail("Missing transaction.");

  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return fail(error.message);

  refreshAll();
  return OK;
}

// ---------------------------------------------------------------------------
// Planned (expected) expenses
// ---------------------------------------------------------------------------

export async function savePlannedExpenseAction(formData: FormData): Promise<ActionResult> {
  const { supabase, householdId } = await requireActor();

  const id = str(formData, "id");
  const payload = {
    household_id: householdId,
    name: str(formData, "name"),
    amount: num(formData, "amount"),
    category_id: str(formData, "category_id") || null,
    payment_method_id: str(formData, "payment_method_id") || null,
    owner_id: str(formData, "owner_id") || null,
    due_day: str(formData, "due_day") ? Number(str(formData, "due_day")) : null,
  };

  if (!payload.name) return fail("Give the bill a name.");

  const { error } = id
    ? await supabase.from("planned_expenses").update(payload).eq("id", id)
    : await supabase.from("planned_expenses").insert(payload);

  if (error) return fail(error.message);

  refreshAll();
  return OK;
}

// Bound directly to a <form action>, so these return void — React requires it
// and no caller reads the result.
export async function deletePlannedExpenseAction(formData: FormData): Promise<void> {
  const { supabase } = await requireActor();
  await supabase.from("planned_expenses").update({ active: false }).eq("id", str(formData, "id"));
  refreshAll();
}

/**
 * Ticks off an expected bill: writes the real expense, records the payment
 * against this cycle, and tells the other person it's been paid.
 */
export async function markPlannedPaidAction(formData: FormData): Promise<ActionResult> {
  const { supabase, profile, household, householdId } = await requireActor();

  const plannedId = str(formData, "planned_expense_id");
  const cycleKey = str(formData, "cycle");
  if (!plannedId) return fail("Missing bill.");

  const { data: planned } = await supabase
    .from("planned_expenses")
    .select("*")
    .eq("id", plannedId)
    .single();

  if (!planned) return fail("Bill not found.");

  const cycle = cycleFor(
    cycleKey || new Date(),
    household.cycle_start_day,
    household.cycle_label_mode,
  );
  const { from } = cycleBounds(cycle);

  const amount = num(formData, "amount") || Number(planned.amount);
  const paidBy = str(formData, "paid_by") || profile.id;
  const paymentMethodId = str(formData, "payment_method_id") || planned.payment_method_id;

  // Date the expense inside the cycle being settled, not always "today", so
  // ticking off a past cycle lands the money in the right place.
  const today = new Date().toISOString().slice(0, 10);
  const occurredOn = today >= from && today <= cycleBounds(cycle).to ? today : from;

  const { data: txn, error: txnError } = await supabase
    .from("transactions")
    .insert({
      household_id: householdId,
      kind: "expense",
      amount,
      category_id: planned.category_id,
      payment_method_id: paymentMethodId,
      paid_by: paidBy,
      created_by: profile.id,
      merchant: planned.name,
      note: "Expected bill",
      occurred_on: occurredOn,
      is_shared: true,
      split_percent: 50,
    })
    .select("id")
    .single();

  if (txnError) return fail(txnError.message);

  const { error } = await supabase.from("planned_payments").insert({
    household_id: householdId,
    planned_expense_id: plannedId,
    cycle_start: from,
    amount,
    paid_by: paidBy,
    created_by: profile.id,
    transaction_id: txn?.id ?? null,
  });

  if (error) {
    // Keep the two tables consistent if the payment row clashed.
    if (txn?.id) await supabase.from("transactions").delete().eq("id", txn.id);
    return fail(error.message);
  }

  await supabase.from("activity_events").insert({
    household_id: householdId,
    type: "planned_paid",
    actor_id: profile.id,
    payload: { planned_expense_id: plannedId, name: planned.name, amount },
  });

  await notifyHousehold({
    householdId,
    actorId: profile.id,
    pref: "notify_planned_paid",
    payload: {
      title: `${profile.display_name} paid ${planned.name}`,
      body: `${money(amount, household.currency)} · ${cycle.label}`,
      url: "/planned",
      tag: `planned-${plannedId}-${from}`,
    },
  });

  refreshAll();
  return OK;
}

export async function undoPlannedPaidAction(formData: FormData): Promise<void> {
  const { supabase } = await requireActor();
  const id = str(formData, "id");

  const { data: payment } = await supabase
    .from("planned_payments")
    .select("transaction_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("planned_payments").delete().eq("id", id);
  if (error) return;

  // Remove the expense the tick-off generated, so the totals go back too.
  if (payment?.transaction_id) {
    await supabase.from("transactions").delete().eq("id", payment.transaction_id);
  }

  refreshAll();
}

// ---------------------------------------------------------------------------
// Savings
// ---------------------------------------------------------------------------

export async function saveSavingsGoalAction(formData: FormData): Promise<ActionResult> {
  const { supabase, householdId } = await requireActor();

  const id = str(formData, "id");
  const payload = {
    household_id: householdId,
    name: str(formData, "name"),
    emoji: str(formData, "emoji") || "🎯",
    color: str(formData, "color") || "#7C5CFA",
    target_amount: num(formData, "target_amount"),
    target_date: str(formData, "target_date") || null,
    monthly_target: num(formData, "monthly_target") || null,
  };

  if (!payload.name) return fail("Give the goal a name.");
  if (payload.target_amount <= 0) return fail("Set a target above zero.");

  const { error } = id
    ? await supabase.from("savings_goals").update(payload).eq("id", id)
    : await supabase.from("savings_goals").insert(payload);

  if (error) return fail(error.message);
  refreshAll();
  return OK;
}

export async function deleteSavingsGoalAction(formData: FormData): Promise<void> {
  const { supabase } = await requireActor();
  await supabase.from("savings_goals").update({ archived: true }).eq("id", str(formData, "id"));
  refreshAll();
}

export async function addSavingsContributionAction(formData: FormData): Promise<ActionResult> {
  const { supabase, profile, household, householdId } = await requireActor();

  const goalId = str(formData, "goal_id");
  const amount = num(formData, "amount");
  if (!goalId) return fail("Pick a goal.");
  if (amount === 0) return fail("Enter an amount.");

  const { error } = await supabase.from("savings_contributions").insert({
    household_id: householdId,
    goal_id: goalId,
    amount,
    paid_by: str(formData, "paid_by") || profile.id,
    created_by: profile.id,
    payment_method_id: str(formData, "payment_method_id") || null,
    note: str(formData, "note") || null,
    occurred_on: str(formData, "occurred_on") || new Date().toISOString().slice(0, 10),
  });

  if (error) return fail(error.message);

  const { data: goal } = await supabase
    .from("savings_goals")
    .select("name, target_amount")
    .eq("id", goalId)
    .single();

  await supabase.from("activity_events").insert({
    household_id: householdId,
    type: "savings_added",
    actor_id: profile.id,
    payload: { goal_id: goalId, name: goal?.name, amount },
  });

  await notifyHousehold({
    householdId,
    actorId: profile.id,
    pref: "notify_savings",
    payload: {
      title:
        amount > 0
          ? `${profile.display_name} added to ${goal?.name ?? "savings"}`
          : `${profile.display_name} withdrew from ${goal?.name ?? "savings"}`,
      body: money(amount, household.currency),
      url: "/savings",
      tag: `savings-${goalId}`,
    },
  });

  refreshAll();
  return OK;
}

export async function deleteSavingsContributionAction(formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireActor();
  const { error } = await supabase
    .from("savings_contributions")
    .delete()
    .eq("id", str(formData, "id"));

  if (error) return fail(error.message);
  refreshAll();
  return OK;
}

// ---------------------------------------------------------------------------
// Categories, payment methods, profile, household settings
// ---------------------------------------------------------------------------

export async function saveCategoryAction(formData: FormData): Promise<ActionResult> {
  const { supabase, householdId } = await requireActor();

  const id = str(formData, "id");
  const payload = {
    household_id: householdId,
    name: str(formData, "name"),
    emoji: str(formData, "emoji") || "🏷️",
    color: str(formData, "color") || "#EDE9FE",
    kind: str(formData, "kind") === "income" ? "income" : "expense",
    monthly_budget: num(formData, "monthly_budget") || null,
    sort_order: Number(str(formData, "sort_order") || "0"),
  };

  if (!payload.name) return fail("Give the category a name.");

  const { error } = id
    ? await supabase.from("categories").update(payload).eq("id", id)
    : await supabase.from("categories").insert(payload);

  if (error) {
    return fail(
      error.code === "23505" ? "You already have a category with that name." : error.message,
    );
  }

  refreshAll();
  return OK;
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const { supabase } = await requireActor();
  // Archived rather than deleted so historic transactions keep their label.
  await supabase.from("categories").update({ archived: true }).eq("id", str(formData, "id"));
  refreshAll();
}

/** Replaces the whole expense category list in one go. */
export async function bulkImportCategoriesAction(formData: FormData): Promise<ActionResult> {
  const { supabase, householdId } = await requireActor();

  const raw = str(formData, "categories");
  if (!raw) return fail("Paste at least one category.");

  // One per line: "🛒 Groceries" or "Groceries" or "Groceries, 400"
  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [namePart, budgetPart] = line.split(/[,|]/).map((s) => s?.trim());
      const emojiMatch = namePart.match(/^(\p{Extended_Pictographic}\p{Emoji_Modifier}*️?)\s*/u);
      const emoji = emojiMatch?.[1] ?? "🏷️";
      const name = namePart.replace(/^(\p{Extended_Pictographic}\p{Emoji_Modifier}*️?)\s*/u, "").trim();
      const budget = budgetPart ? Number.parseFloat(budgetPart.replace(/[^0-9.]/g, "")) : null;

      return {
        household_id: householdId,
        name,
        emoji,
        kind: "expense" as const,
        monthly_budget: Number.isFinite(budget as number) ? budget : null,
        sort_order: (index + 1) * 10,
      };
    })
    .filter((row) => row.name.length > 0);

  if (rows.length === 0) return fail("Couldn't read any category names.");

  if (bool(formData, "replace")) {
    await supabase
      .from("categories")
      .update({ archived: true })
      .eq("household_id", householdId)
      .eq("kind", "expense");
  }

  const { error } = await supabase
    .from("categories")
    .upsert(rows, { onConflict: "household_id,name,kind" });

  if (error) return fail(error.message);

  // Un-archive anything that came back in the new list.
  await supabase
    .from("categories")
    .update({ archived: false })
    .eq("household_id", householdId)
    .eq("kind", "expense")
    .in(
      "name",
      rows.map((r) => r.name),
    );

  refreshAll();
  return OK;
}

export async function savePaymentMethodAction(formData: FormData): Promise<ActionResult> {
  const { supabase, householdId } = await requireActor();

  const id = str(formData, "id");
  const payload = {
    household_id: householdId,
    name: str(formData, "name"),
    type: str(formData, "type") || "bank",
    color: str(formData, "color") || "#3B2A50",
    owner_id: str(formData, "owner_id") || null,
    sort_order: Number(str(formData, "sort_order") || "0"),
  };

  if (!payload.name) return fail("Give the account a name.");

  const { error } = id
    ? await supabase.from("payment_methods").update(payload).eq("id", id)
    : await supabase.from("payment_methods").insert(payload);

  if (error) {
    return fail(
      error.code === "23505" ? "You already have an account with that name." : error.message,
    );
  }

  refreshAll();
  return OK;
}

export async function deletePaymentMethodAction(formData: FormData): Promise<void> {
  const { supabase } = await requireActor();
  await supabase.from("payment_methods").update({ archived: true }).eq("id", str(formData, "id"));
  refreshAll();
}

/** Sets the account pre-selected on the add-expense form for this person. */
export async function setDefaultPaymentMethodAction(formData: FormData): Promise<void> {
  const { supabase, profile } = await requireActor();
  await supabase
    .from("profiles")
    .update({ default_payment_method_id: str(formData, "id") || null })
    .eq("id", profile.id);
  refreshAll();
}

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const { supabase, profile } = await requireActor();

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: str(formData, "display_name") || profile.display_name,
      emoji: str(formData, "emoji") || profile.emoji,
      color: str(formData, "color") || profile.color,
      notify_partner_expense: bool(formData, "notify_partner_expense"),
      notify_partner_income: bool(formData, "notify_partner_income"),
      notify_planned_paid: bool(formData, "notify_planned_paid"),
      notify_savings: bool(formData, "notify_savings"),
    })
    .eq("id", profile.id);

  if (error) return fail(error.message);
  refreshAll();
  return OK;
}

export async function updateHouseholdAction(formData: FormData): Promise<ActionResult> {
  const { supabase, householdId } = await requireActor();

  const startDay = Number(str(formData, "cycle_start_day") || "25");
  if (!Number.isFinite(startDay) || startDay < 1 || startDay > 28) {
    return fail("Cycle start day must be between 1 and 28.");
  }

  const { error } = await supabase
    .from("households")
    .update({
      name: str(formData, "name") || "Our household",
      currency: str(formData, "currency") || "GBP",
      cycle_start_day: startDay,
      cycle_label_mode: str(formData, "cycle_label_mode") === "start" ? "start" : "end",
    })
    .eq("id", householdId);

  if (error) return fail(error.message);
  refreshAll();
  return OK;
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
