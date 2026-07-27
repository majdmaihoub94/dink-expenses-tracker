"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import {
  bulkImportPlannedExpensesAction,
  deletePlannedExpenseAction,
  markPlannedPaidAction,
  savePlannedExpenseAction,
  undoPlannedPaidAction,
} from "@/app/actions";
import { Sheet } from "@/components/Sheet";
import type { Cycle } from "@/lib/cycle";
import { money } from "@/lib/format";
import type { Category, PaymentMethod, PlannedExpense, PlannedPayment, Profile } from "@/lib/types";

export function PlannedView({
  expenses,
  payments,
  categories,
  paymentMethods,
  members,
  currency,
  cycle,
  profileId,
}: {
  expenses: PlannedExpense[];
  payments: PlannedPayment[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  members: Profile[];
  currency: string;
  cycle: Cycle;
  profileId: string;
}) {
  const [editing, setEditing] = useState<PlannedExpense | "new" | null>(null);
  const [payFor, setPayFor] = useState<PlannedExpense | null>(null);
  const [importing, setImporting] = useState(false);

  const paymentFor = (id: string) => payments.find((p) => p.planned_expense_id === id);
  const paid = expenses.filter((e) => paymentFor(e.id));
  const unpaid = expenses.filter((e) => !paymentFor(e.id));

  const totalExpected = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalPaid = paid.reduce((sum, e) => sum + Number(paymentFor(e.id)!.amount), 0);
  const totalOutstanding = unpaid.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-[var(--radius-card)] bg-gradient-to-br from-plum-800 to-plum-900 p-5 text-white">
        <p className="text-xs font-medium tracking-wide text-white/60 uppercase">
          Still to pay · {cycle.label}
        </p>
        <p className="mt-1 text-[2rem] leading-none font-semibold">
          {money(totalOutstanding, currency)}
        </p>
        {totalExpected > 0 && (
          <>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-mint transition-all"
                style={{ width: `${Math.min((totalPaid / totalExpected) * 100, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-white/60">
              {money(totalPaid, currency)} of {money(totalExpected, currency)} paid ·{" "}
              {paid.length}/{expenses.length} bills
            </p>
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="dinx-tap rounded-2xl bg-card py-3 text-sm font-semibold text-plum-600 shadow-[0_6px_20px_-16px_rgba(58,42,79,0.5)]"
        >
          + Add a bill
        </button>
        <button
          type="button"
          onClick={() => setImporting(true)}
          className="dinx-tap rounded-2xl bg-card py-3 text-sm font-semibold text-plum-600 shadow-[0_6px_20px_-16px_rgba(58,42,79,0.5)]"
        >
          Paste a list
        </button>
      </div>

      {expenses.length === 0 && (
        <div className="dinx-card text-center">
          <p className="text-3xl" aria-hidden>
            📌
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">No expected bills yet</p>
          <p className="mt-1 text-xs text-muted">
            Add rent, utilities and subscriptions once. They reappear every cycle so you always
            know what is still to leave the account.
          </p>
        </div>
      )}

      {unpaid.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold text-muted uppercase">Outstanding</h2>
          <div className="space-y-2">
            {unpaid.map((expense) => (
              <PlannedRow
                key={expense.id}
                expense={expense}
                categories={categories}
                members={members}
                currency={currency}
                onPay={() => setPayFor(expense)}
                onEdit={() => setEditing(expense)}
              />
            ))}
          </div>
        </section>
      )}

      {paid.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold text-muted uppercase">Paid</h2>
          <div className="space-y-2">
            {paid.map((expense) => (
              <PlannedRow
                key={expense.id}
                expense={expense}
                payment={paymentFor(expense.id)}
                categories={categories}
                members={members}
                currency={currency}
                onEdit={() => setEditing(expense)}
              />
            ))}
          </div>
        </section>
      )}

      <ImportSheet open={importing} onClose={() => setImporting(false)} />

      <PlannedSheet
        expense={editing}
        onClose={() => setEditing(null)}
        categories={categories}
        paymentMethods={paymentMethods}
        members={members}
        currency={currency}
      />

      <PaySheet
        expense={payFor}
        onClose={() => setPayFor(null)}
        paymentMethods={paymentMethods}
        members={members}
        currency={currency}
        cycle={cycle}
        profileId={profileId}
      />
    </div>
  );
}

function PlannedRow({
  expense,
  payment,
  categories,
  members,
  currency,
  onPay,
  onEdit,
}: {
  expense: PlannedExpense;
  payment?: PlannedPayment;
  categories: Category[];
  members: Profile[];
  currency: string;
  onPay?: () => void;
  onEdit: () => void;
}) {
  const category = categories.find((c) => c.id === expense.category_id);
  const owner = members.find((m) => m.id === expense.owner_id);
  const payer = payment ? members.find((m) => m.id === payment.paid_by) : null;

  return (
    <article className={`dinx-tile ${payment ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base"
          style={{ backgroundColor: category?.color ?? "#F1EDF9" }}
          aria-hidden
        >
          {category?.emoji ?? "📌"}
        </span>

        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <p className={`truncate text-sm font-semibold text-ink ${payment ? "line-through" : ""}`}>
            {expense.name}
          </p>
          <p className="truncate text-xs text-muted">
            {expense.due_day ? `Due ${ordinal(expense.due_day)}` : "No fixed date"}
            {owner && ` · ${owner.display_name}`}
            {payer && ` · paid by ${payer.display_name}`}
          </p>
        </button>

        <span className="shrink-0 text-sm font-semibold text-ink">
          {money(Number(payment?.amount ?? expense.amount), currency)}
        </span>
      </div>

      <div className="mt-3">
        {payment ? (
          <form action={undoPlannedPaidAction}>
            <input type="hidden" name="id" value={payment.id} />
            <button
              type="submit"
              className="dinx-tap w-full rounded-xl bg-page py-2 text-xs font-semibold text-ink-soft"
            >
              ✓ Paid — tap to undo
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={onPay}
            className="dinx-tap w-full rounded-xl bg-mint py-2.5 text-sm font-semibold text-white"
          >
            Mark as paid
          </button>
        )}
      </div>
    </article>
  );
}

function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  return (
    <Sheet open onClose={onClose} title="Paste your bills">
      <form
        action={async (formData) => {
          const result = await bulkImportPlannedExpensesAction(formData);
          if (result.ok) onClose();
          else setError(result.error);
        }}
        className="space-y-4"
      >
        <p className="rounded-2xl bg-plum-50 px-4 py-3 text-xs text-ink-soft">
          One per line: <span className="font-mono">Name, amount, category, due day</span>
          <br />
          Category and due day are optional. Any category you name that does not exist yet is
          created for you.
        </p>

        <textarea
          name="planned_expenses"
          rows={12}
          required
          placeholder={"🏠 Rent, 1250, Housing, 1\n🚗 Car loan, 315, Transport, 5\n📺 Netflix, 13, Subscriptions"}
          className="dinx-field resize-none font-mono text-sm"
        />

        <label className="flex items-center gap-3 rounded-2xl bg-page px-4 py-3">
          <input
            type="checkbox"
            name="replace"
            className="relative h-6 w-11 shrink-0 appearance-none rounded-full bg-line transition-colors checked:bg-plum-500
                       before:absolute before:top-0.5 before:left-0.5 before:h-5 before:w-5 before:rounded-full
                       before:bg-white before:transition-transform checked:before:translate-x-5"
          />
          <span className="text-sm text-ink">Replace the current bills</span>
        </label>

        {error && (
          <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
            {error}
          </p>
        )}

        <SubmitButton label="Import bills" />
      </form>
    </Sheet>
  );
}

function PlannedSheet({
  expense,
  onClose,
  categories,
  paymentMethods,
  members,
  currency,
}: {
  expense: PlannedExpense | "new" | null;
  onClose: () => void;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  members: Profile[];
  currency: string;
}) {
  const [error, setError] = useState<string | null>(null);
  if (!expense) return null;

  const existing = expense === "new" ? null : expense;

  return (
    <Sheet open onClose={onClose} title={existing ? "Edit bill" : "New expected bill"}>
      <form
        action={async (formData) => {
          const result = await savePlannedExpenseAction(formData);
          if (result.ok) onClose();
          else setError(result.error);
        }}
        className="space-y-4"
      >
        {existing && <input type="hidden" name="id" value={existing.id} />}

        <div>
          <label htmlFor="planned-name" className="dinx-label">
            Name
          </label>
          <input
            id="planned-name"
            name="name"
            defaultValue={existing?.name}
            placeholder="Rent"
            required
            className="dinx-field"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="planned-amount" className="dinx-label">
              Amount ({currency})
            </label>
            <input
              id="planned-amount"
              name="amount"
              type="text"
              inputMode="decimal"
              defaultValue={existing ? String(existing.amount) : ""}
              placeholder="1450"
              required
              className="dinx-field"
            />
          </div>
          <div>
            <label htmlFor="planned-due" className="dinx-label">
              Due day
            </label>
            <input
              id="planned-due"
              name="due_day"
              type="number"
              min={1}
              max={31}
              defaultValue={existing?.due_day ?? ""}
              placeholder="1"
              className="dinx-field"
            />
          </div>
        </div>

        <div>
          <label htmlFor="planned-category" className="dinx-label">
            Category
          </label>
          <select
            id="planned-category"
            name="category_id"
            defaultValue={existing?.category_id ?? ""}
            className="dinx-field"
          >
            <option value="">None</option>
            {categories
              .filter((c) => c.kind === "expense")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label htmlFor="planned-method" className="dinx-label">
            Usually paid from
          </label>
          <select
            id="planned-method"
            name="payment_method_id"
            defaultValue={existing?.payment_method_id ?? ""}
            className="dinx-field"
          >
            <option value="">Not set</option>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {members.length > 1 && (
          <div>
            <label htmlFor="planned-owner" className="dinx-label">
              Whose bill
            </label>
            <select
              id="planned-owner"
              name="owner_id"
              defaultValue={existing?.owner_id ?? ""}
              className="dinx-field"
            >
              <option value="">Either of us</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji} {m.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
            {error}
          </p>
        )}

        <SubmitButton label={existing ? "Save changes" : "Add bill"} />
      </form>

      {existing && (
        <form action={deletePlannedExpenseAction} className="mt-3">
          <input type="hidden" name="id" value={existing.id} />
          <button type="submit" className="dinx-tap w-full rounded-2xl bg-page py-3 font-semibold text-rose">
            Remove bill
          </button>
        </form>
      )}
    </Sheet>
  );
}

function PaySheet({
  expense,
  onClose,
  paymentMethods,
  members,
  currency,
  cycle,
  profileId,
}: {
  expense: PlannedExpense | null;
  onClose: () => void;
  paymentMethods: PaymentMethod[];
  members: Profile[];
  currency: string;
  cycle: Cycle;
  profileId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  if (!expense) return null;

  return (
    <Sheet open onClose={onClose} title={`Pay ${expense.name}`}>
      <form
        action={async (formData) => {
          const result = await markPlannedPaidAction(formData);
          if (result.ok) onClose();
          else setError(result.error);
        }}
        className="space-y-4"
      >
        <input type="hidden" name="planned_expense_id" value={expense.id} />
        <input type="hidden" name="cycle" value={cycle.key} />

        <p className="rounded-2xl bg-plum-50 px-4 py-3 text-xs text-ink-soft">
          This logs a real expense for {cycle.label} and lets your partner know it’s been paid.
        </p>

        <div>
          <label htmlFor="pay-amount" className="dinx-label">
            Amount ({currency})
          </label>
          <input
            id="pay-amount"
            name="amount"
            type="text"
            inputMode="decimal"
            defaultValue={String(expense.amount)}
            required
            className="dinx-field text-xl font-semibold"
          />
        </div>

        <div>
          <label htmlFor="pay-method" className="dinx-label">
            Paid from
          </label>
          <select
            id="pay-method"
            name="payment_method_id"
            defaultValue={expense.payment_method_id ?? ""}
            className="dinx-field"
          >
            <option value="">Not specified</option>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {members.length > 1 && (
          <div>
            <label htmlFor="pay-by" className="dinx-label">
              Paid by
            </label>
            <select
              id="pay-by"
              name="paid_by"
              defaultValue={expense.owner_id ?? profileId}
              className="dinx-field"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji} {m.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
            {error}
          </p>
        )}

        <SubmitButton label="Confirm payment" tone="mint" />
      </form>
    </Sheet>
  );
}

function SubmitButton({ label, tone = "plum" }: { label: string; tone?: "plum" | "mint" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`dinx-tap w-full rounded-2xl py-4 font-semibold text-white disabled:opacity-60 ${
        tone === "mint" ? "bg-mint" : "bg-plum-600"
      }`}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function ordinal(day: number): string {
  const suffix = ["th", "st", "nd", "rd"][((day % 100) - 20) % 10] ?? ["th", "st", "nd", "rd"][day] ?? "th";
  return `${day}${suffix}`;
}
