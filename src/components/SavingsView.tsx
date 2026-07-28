"use client";

import { format, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  addSavingsContributionAction,
  deleteSavingsContributionAction,
  deleteSavingsGoalAction,
  saveSavingsGoalAction,
  updateSavingsContributionAction,
} from "@/app/actions";
import { Sheet } from "@/components/Sheet";
import { money, percent } from "@/lib/format";
import type { PaymentMethod, Profile, SavingsContribution, SavingsGoal } from "@/lib/types";

export type GoalRow = { goal: SavingsGoal; saved: number; thisCycle: number };

export function SavingsView({
  rows,
  contributions,
  members,
  paymentMethods,
  currency,
  profileId,
}: {
  rows: GoalRow[];
  contributions: SavingsContribution[];
  members: Profile[];
  paymentMethods: PaymentMethod[];
  currency: string;
  profileId: string;
}) {
  const [goalSheet, setGoalSheet] = useState<SavingsGoal | "new" | null>(null);
  const [contributeTo, setContributeTo] = useState<SavingsGoal | null>(null);
  const [editingContribution, setEditingContribution] = useState<SavingsContribution | null>(null);

  const totalSaved = rows.reduce((sum, r) => sum + r.saved, 0);
  const totalTarget = rows.reduce((sum, r) => sum + Number(r.goal.target_amount), 0);

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-[var(--radius-card)] bg-gradient-to-br from-plum-800 to-plum-900 p-5 text-white">
        <p className="text-xs font-medium tracking-wide text-white/60 uppercase">Total saved</p>
        <p className="mt-1 text-[2rem] leading-none font-semibold">{money(totalSaved, currency)}</p>
        {totalTarget > 0 && (
          <>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-coral transition-all"
                style={{ width: `${Math.min((totalSaved / totalTarget) * 100, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-white/60">
              {percent(Math.min(totalSaved / totalTarget, 1))} of {money(totalTarget, currency)}{" "}
              across {rows.length} goal{rows.length === 1 ? "" : "s"}
            </p>
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setGoalSheet("new")}
          className="dinx-tap rounded-2xl bg-card py-3 text-sm font-semibold text-plum-600 shadow-[0_6px_20px_-16px_rgba(58,42,79,0.5)]"
        >
          + New goal
        </button>
        <button
          type="button"
          onClick={() => setContributeTo(rows[0]?.goal ?? null)}
          disabled={rows.length === 0}
          className="dinx-tap rounded-2xl bg-plum-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          Add money
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="dinx-card text-center">
          <p className="text-3xl" aria-hidden>
            🐖
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">No goals yet</p>
          <p className="mt-1 text-xs text-muted">
            A goal turns “we should save more” into a number you can actually hit.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ goal, saved, thisCycle }) => {
            const target = Number(goal.target_amount);
            const ratio = target > 0 ? saved / target : 0;
            const complete = ratio >= 1;
            const remaining = Math.max(target - saved, 0);

            return (
              <article key={goal.id} className="dinx-card">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
                    style={{ backgroundColor: `${goal.color}22` }}
                    aria-hidden
                  >
                    {goal.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-ink">{goal.name}</h3>
                      <span className="shrink-0 text-sm font-bold text-ink">
                        {money(saved, currency)}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      of {money(target, currency)}
                      {goal.target_date && ` by ${format(parseISO(goal.target_date), "MMM yyyy")}`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-page">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(ratio * 100, 100)}%`,
                      backgroundColor: complete ? "#2FBF87" : goal.color,
                    }}
                  />
                </div>

                <p className="mt-2 text-xs text-muted">
                  {complete
                    ? "🎉 Target reached"
                    : `${money(remaining, currency)} to go · ${money(thisCycle, currency)} this cycle`}
                  {goal.monthly_target && !complete && (
                    <> · aiming {money(Number(goal.monthly_target), currency)}/cycle</>
                  )}
                </p>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setContributeTo(goal)}
                    className="dinx-tap flex-1 rounded-xl bg-plum-600 py-2.5 text-sm font-semibold text-white"
                  >
                    Add money
                  </button>
                  <button
                    type="button"
                    onClick={() => setGoalSheet(goal)}
                    className="dinx-tap rounded-xl bg-page px-4 py-2.5 text-sm font-semibold text-ink-soft"
                  >
                    Edit
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {contributions.length > 0 && (
        <section className="dinx-card">
          <h2 className="mb-3 text-base font-semibold text-ink">Recent contributions</h2>
          <div className="space-y-2">
            {contributions.slice(0, 12).map((c) => {
              const goal = rows.find((r) => r.goal.id === c.goal_id)?.goal;
              const person = members.find((m) => m.id === c.paid_by);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setEditingContribution(c)}
                  className="dinx-tap flex w-full items-center gap-3 rounded-2xl px-1 py-1 text-left active:bg-page"
                >
                  <span className="text-base" aria-hidden>
                    {goal?.emoji ?? "🐖"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{goal?.name ?? "Savings"}</p>
                    <p className="text-xs text-muted">
                      {person?.display_name} · {format(parseISO(c.occurred_on), "d MMM")}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      Number(c.amount) < 0 ? "text-rose" : "text-mint"
                    }`}
                  >
                    {Number(c.amount) < 0 ? "−" : "+"} {money(Number(c.amount), currency)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <GoalSheet
        goal={goalSheet}
        onClose={() => setGoalSheet(null)}
        currency={currency}
      />

      <ContributeSheet
        goals={rows.map((r) => r.goal)}
        initialGoal={contributeTo}
        editing={editingContribution}
        onClose={() => {
          setContributeTo(null);
          setEditingContribution(null);
        }}
        members={members}
        paymentMethods={paymentMethods}
        profileId={profileId}
        currency={currency}
      />
    </div>
  );
}

function GoalSheet({
  goal,
  onClose,
  currency,
}: {
  goal: SavingsGoal | "new" | null;
  onClose: () => void;
  currency: string;
}) {
  const [error, setError] = useState<string | null>(null);
  if (!goal) return null;

  const existing = goal === "new" ? null : goal;

  return (
    <Sheet open onClose={onClose} title={existing ? "Edit goal" : "New savings goal"}>
      <form
        action={async (formData) => {
          const result = await saveSavingsGoalAction(formData);
          if (result.ok) onClose();
          else setError(result.error);
        }}
        className="space-y-4"
      >
        {existing && <input type="hidden" name="id" value={existing.id} />}

        <div className="grid grid-cols-[4.5rem_1fr] gap-3">
          <div>
            <label htmlFor="goal-emoji" className="dinx-label">
              Icon
            </label>
            <input
              id="goal-emoji"
              name="emoji"
              defaultValue={existing?.emoji ?? "🎯"}
              maxLength={4}
              className="dinx-field text-center text-xl"
            />
          </div>
          <div>
            <label htmlFor="goal-name" className="dinx-label">
              Name
            </label>
            <input
              id="goal-name"
              name="name"
              defaultValue={existing?.name}
              placeholder="House deposit"
              required
              className="dinx-field"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="goal-target" className="dinx-label">
              Target ({currency})
            </label>
            <input
              id="goal-target"
              name="target_amount"
              type="text"
              inputMode="decimal"
              defaultValue={existing ? String(existing.target_amount) : ""}
              placeholder="20000"
              required
              className="dinx-field"
            />
          </div>
          <div>
            <label htmlFor="goal-monthly" className="dinx-label">
              Per cycle
            </label>
            <input
              id="goal-monthly"
              name="monthly_target"
              type="text"
              inputMode="decimal"
              defaultValue={existing?.monthly_target ? String(existing.monthly_target) : ""}
              placeholder="500"
              className="dinx-field"
            />
          </div>
        </div>

        <div>
          <label htmlFor="goal-date" className="dinx-label">
            Target date
          </label>
          <input
            id="goal-date"
            name="target_date"
            type="date"
            defaultValue={existing?.target_date ?? ""}
            className="dinx-field"
          />
        </div>

        <div>
          <label htmlFor="goal-color" className="dinx-label">
            Colour
          </label>
          <input
            id="goal-color"
            name="color"
            type="color"
            defaultValue={existing?.color ?? "#7C5CFA"}
            className="h-12 w-full rounded-2xl border border-line bg-page px-2"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
            {error}
          </p>
        )}

        <SubmitButton label={existing ? "Save changes" : "Create goal"} />
      </form>

      {existing && (
        <form action={deleteSavingsGoalAction} className="mt-3">
          <input type="hidden" name="id" value={existing.id} />
          <button type="submit" className="dinx-tap w-full rounded-2xl bg-page py-3 font-semibold text-rose">
            Archive goal
          </button>
        </form>
      )}
    </Sheet>
  );
}

function ContributeSheet({
  goals,
  initialGoal,
  editing,
  onClose,
  members,
  paymentMethods,
  profileId,
  currency,
}: {
  goals: SavingsGoal[];
  initialGoal: SavingsGoal | null;
  /** Editing an existing deposit/withdrawal, in place of logging a new one. */
  editing: SavingsContribution | null;
  onClose: () => void;
  members: Profile[];
  paymentMethods: PaymentMethod[];
  profileId: string;
  currency: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  // Re-derive whenever a different contribution is opened for editing.
  useEffect(() => {
    setWithdrawing(editing ? Number(editing.amount) < 0 : false);
    setError(null);
  }, [editing]);

  const open = Boolean(initialGoal || editing);
  if (!open) return null;

  const defaultGoalId = editing?.goal_id ?? initialGoal?.id ?? goals[0]?.id ?? "";
  const defaultAmount = editing ? String(Math.abs(Number(editing.amount))) : "";
  const defaultPaidBy = editing?.paid_by ?? profileId;
  const defaultMethod = editing?.payment_method_id ?? "";
  const defaultDate = editing?.occurred_on ?? new Date().toISOString().slice(0, 10);

  const title = editing ? "Edit contribution" : withdrawing ? "Withdraw from savings" : "Add to savings";

  return (
    <Sheet open onClose={onClose} title={title}>
      <form
        action={async (formData) => {
          if (editing) formData.set("id", editing.id);
          // Withdrawals are stored as negative contributions.
          if (withdrawing) {
            const raw = String(formData.get("amount") ?? "");
            formData.set("amount", `-${raw.replace(/^-/, "")}`);
          }
          const result = editing
            ? await updateSavingsContributionAction(formData)
            : await addSavingsContributionAction(formData);
          if (result.ok) onClose();
          else setError(result.error);
        }}
        className="space-y-4"
      >
        <div className="flex rounded-full bg-page p-1">
          {[
            { value: false, label: "Deposit" },
            { value: true, label: "Withdraw" },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setWithdrawing(option.value)}
              className={`dinx-tap flex-1 rounded-full py-2 text-sm font-semibold ${
                withdrawing === option.value ? "bg-card text-ink shadow-sm" : "text-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="contrib-goal" className="dinx-label">
            Goal
          </label>
          <select id="contrib-goal" name="goal_id" defaultValue={defaultGoalId} className="dinx-field">
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.emoji} {g.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="contrib-amount" className="dinx-label">
            Amount ({currency})
          </label>
          <input
            id="contrib-amount"
            name="amount"
            type="text"
            inputMode="decimal"
            defaultValue={defaultAmount}
            placeholder="250"
            required
            className="dinx-field text-xl font-semibold"
          />
        </div>

        {members.length > 1 && (
          <div>
            <span className="dinx-label">From</span>
            <select name="paid_by" defaultValue={defaultPaidBy} className="dinx-field">
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji} {m.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="contrib-method" className="dinx-label">
            Account
          </label>
          <select id="contrib-method" name="payment_method_id" defaultValue={defaultMethod} className="dinx-field">
            <option value="">Not specified</option>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="contrib-date" className="dinx-label">
            Date
          </label>
          <input
            id="contrib-date"
            name="occurred_on"
            type="date"
            defaultValue={defaultDate}
            className="dinx-field"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
            {error}
          </p>
        )}

        <SubmitButton label={editing ? "Save changes" : withdrawing ? "Withdraw" : "Add to savings"} />
      </form>

      {editing && (
        <form
          action={async (formData) => {
            await deleteSavingsContributionAction(formData);
            onClose();
          }}
          className="mt-3"
        >
          <input type="hidden" name="id" value={editing.id} />
          <button type="submit" className="dinx-tap w-full rounded-2xl bg-page py-3 font-semibold text-rose">
            Delete contribution
          </button>
        </form>
      )}
    </Sheet>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="dinx-tap w-full rounded-2xl bg-plum-600 py-4 font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
