"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { addTransactionAction, type ActionResult } from "@/app/actions";
import { Sheet } from "@/components/Sheet";
import { currencySymbol } from "@/lib/format";
import type { Category, PaymentMethod, Profile, TxnKind } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

export function AddTransactionSheet({
  open,
  onClose,
  profile,
  members,
  categories,
  paymentMethods,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  members: Profile[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  currency: string;
}) {
  const [kind, setKind] = useState<TxnKind>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(
    profile.default_payment_method_id ?? paymentMethods.find((m) => m.is_default)?.id ?? "",
  );
  const [paidBy, setPaidBy] = useState(profile.id);
  const [incomeKind, setIncomeKind] = useState("salary");
  const [isShared, setIsShared] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [occurredOn, setOccurredOn] = useState(today);

  const [state, formAction] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => {
      const result = await addTransactionAction(formData);
      if (result.ok) onClose();
      return result;
    },
    null,
  );

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind],
  );

  // Reset to a clean slate every time the sheet is opened.
  useEffect(() => {
    if (!open) return;
    setKind("expense");
    setAmount("");
    setCategoryId("");
    setPaidBy(profile.id);
    setIncomeKind("salary");
    setIsShared(true);
    setShowMore(false);
    setOccurredOn(today());
    setPaymentMethodId(
      profile.default_payment_method_id ?? paymentMethods.find((m) => m.is_default)?.id ?? "",
    );
  }, [open, profile.id, profile.default_payment_method_id, paymentMethods]);

  // The category rail is filtered by kind, so a stale pick must be dropped.
  useEffect(() => {
    if (categoryId && !visibleCategories.some((c) => c.id === categoryId)) setCategoryId("");
  }, [categoryId, visibleCategories]);

  return (
    <Sheet open={open} onClose={onClose} title={kind === "expense" ? "New expense" : "New income"}>
      <form action={formAction} className="space-y-5 pb-2">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="category_id" value={categoryId} />
        <input type="hidden" name="payment_method_id" value={paymentMethodId} />
        <input type="hidden" name="paid_by" value={paidBy} />
        <input type="hidden" name="income_kind" value={incomeKind} />
        <input type="hidden" name="is_shared" value={isShared ? "true" : "false"} />

        {/* Expense / income ------------------------------------------------ */}
        <div className="flex rounded-full bg-page p-1">
          {(["expense", "income"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              className={`dinx-tap flex-1 rounded-full py-2 text-sm font-semibold capitalize transition-colors ${
                kind === option ? "bg-card text-ink shadow-sm" : "text-muted"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {/* Amount ----------------------------------------------------------- */}
        <div className="rounded-[var(--radius-tile)] bg-page px-4 py-5 text-center">
          <label htmlFor="amount" className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
            Amount
          </label>
          <div className="flex items-center justify-center gap-1">
            <span className={`text-3xl font-semibold ${kind === "expense" ? "text-ink" : "text-mint"}`}>
              {kind === "expense" ? "−" : "+"} {currencySymbol(currency)}
            </span>
            <input
              id="amount"
              name="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-[7ch] bg-transparent text-4xl font-semibold text-ink outline-none placeholder:text-muted/50"
            />
          </div>
        </div>

        {/* Category --------------------------------------------------------- */}
        <div>
          <span className="dinx-label">Category</span>
          <div className="dinx-rail">
            {visibleCategories.map((category) => {
              const active = categoryId === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(active ? "" : category.id)}
                  className={`dinx-chip ${
                    active ? "bg-plum-600 text-white" : "bg-page text-ink-soft"
                  }`}
                >
                  <span aria-hidden>{category.emoji}</span>
                  {category.name}
                </button>
              );
            })}
            {visibleCategories.length === 0 && (
              <p className="py-2 text-sm text-muted">
                No {kind} categories yet — add them in Profile → Categories.
              </p>
            )}
          </div>
        </div>

        {/* Account ---------------------------------------------------------- */}
        <div>
          <span className="dinx-label">{kind === "expense" ? "Paid from" : "Paid into"}</span>
          <div className="dinx-rail">
            {paymentMethods.map((method) => {
              const active = paymentMethodId === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setPaymentMethodId(method.id)}
                  className={`dinx-chip border ${
                    active ? "border-transparent text-white" : "border-line bg-card text-ink-soft"
                  }`}
                  style={active ? { backgroundColor: method.color } : undefined}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: active ? "#ffffff" : method.color }}
                    aria-hidden
                  />
                  {method.name}
                  {method.is_default && !active && (
                    <span className="text-[10px] text-muted">default</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Who ------------------------------------------------------------- */}
        {members.length > 1 && (
          <div>
            <span className="dinx-label">Logged for</span>
            <div className="flex gap-2">
              {members.map((member) => {
                const active = paidBy === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => setPaidBy(member.id)}
                    className={`dinx-tap flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium ${
                      active ? "bg-plum-800 text-white" : "bg-page text-ink-soft"
                    }`}
                  >
                    <span aria-hidden>{member.emoji}</span>
                    {member.id === profile.id ? "Me" : member.display_name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Income kind ------------------------------------------------------ */}
        {kind === "income" && (
          <div>
            <span className="dinx-label">Type</span>
            <div className="flex gap-2">
              {(
                [
                  { value: "salary", label: "Salary" },
                  { value: "extra", label: "Extra" },
                  { value: "other", label: "Other" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setIncomeKind(option.value)}
                  className={`dinx-tap flex-1 rounded-2xl py-3 text-sm font-medium ${
                    incomeKind === option.value ? "bg-mint text-white" : "bg-page text-ink-soft"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Description ------------------------------------------------------ */}
        <div>
          <label htmlFor="merchant" className="dinx-label">
            {kind === "expense" ? "Where" : "Source"}
          </label>
          <input
            id="merchant"
            name="merchant"
            type="text"
            autoComplete="off"
            placeholder={kind === "expense" ? "Nike Store" : "Monthly salary"}
            className="dinx-field"
          />
        </div>

        {/* Optional extras -------------------------------------------------- */}
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="dinx-tap text-sm font-medium text-plum-600"
        >
          {showMore ? "Hide extra details" : "Date, tax, split, note"}
        </button>

        {showMore && (
          <div className="animate-rise space-y-4 rounded-[var(--radius-tile)] bg-page p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="occurred_on" className="dinx-label">
                  Date
                </label>
                <input
                  id="occurred_on"
                  name="occurred_on"
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  className="dinx-field bg-card"
                />
              </div>
              <div>
                <label htmlFor="tax_amount" className="dinx-label">
                  Tax / VAT
                </label>
                <input
                  id="tax_amount"
                  name="tax_amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="dinx-field bg-card"
                />
              </div>
            </div>

            {kind === "expense" && members.length > 1 && (
              <>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">Shared cost</span>
                  <input
                    type="checkbox"
                    checked={isShared}
                    onChange={(e) => setIsShared(e.target.checked)}
                    className="h-6 w-11 appearance-none rounded-full bg-line transition-colors checked:bg-plum-500 relative
                               before:absolute before:top-0.5 before:left-0.5 before:h-5 before:w-5 before:rounded-full
                               before:bg-white before:transition-transform checked:before:translate-x-5"
                  />
                </label>
                {isShared && (
                  <div>
                    <label htmlFor="split_percent" className="dinx-label">
                      Your share
                    </label>
                    <select id="split_percent" name="split_percent" defaultValue="50" className="dinx-field bg-card">
                      <option value="50">Split 50 / 50</option>
                      <option value="100">All mine</option>
                      <option value="0">All theirs</option>
                      <option value="60">60 / 40</option>
                      <option value="70">70 / 30</option>
                      <option value="75">75 / 25</option>
                    </select>
                  </div>
                )}
              </>
            )}

            <div>
              <label htmlFor="note" className="dinx-label">
                Note
              </label>
              <textarea id="note" name="note" rows={2} placeholder="Optional" className="dinx-field bg-card resize-none" />
            </div>
          </div>
        )}

        {state && !state.ok && (
          <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
            {state.error}
          </p>
        )}

        <SubmitButton kind={kind} />
      </form>
    </Sheet>
  );
}

function SubmitButton({ kind }: { kind: TxnKind }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`dinx-tap w-full rounded-2xl py-4 font-semibold text-white disabled:opacity-60 ${
        kind === "expense" ? "bg-coral" : "bg-mint"
      }`}
    >
      {pending ? "Saving…" : kind === "expense" ? "Add expense" : "Add income"}
    </button>
  );
}
