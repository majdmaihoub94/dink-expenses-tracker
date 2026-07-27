"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { addTransactionAction, logFixedExpenseAction, type ActionResult } from "@/app/actions";
import { Sheet } from "@/components/Sheet";
import {
  AccountRail,
  CategoryRail,
  IncomeKindPicker,
  KindToggle,
  PersonPicker,
  SPLIT_OPTIONS,
  Toggle,
} from "@/components/TransactionFields";
import { currencySymbol, money } from "@/lib/format";
import {
  EMPTY_SUGGESTIONS,
  matchMerchants,
  suggestedAmounts,
  type MerchantSuggestion,
  type SuggestionIndex,
} from "@/lib/suggestions";
import type { Category, FixedExpense, PaymentMethod, Profile, TxnKind } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

export function AddTransactionSheet({
  open,
  onClose,
  profile,
  members,
  categories,
  paymentMethods,
  fixedExpenses,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  members: Profile[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  fixedExpenses: FixedExpense[];
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
  const [saveAsFixed, setSaveAsFixed] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [quickPending, setQuickPending] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionIndex>(EMPTY_SUGGESTIONS);
  const [pickedMerchant, setPickedMerchant] = useState<MerchantSuggestion | null>(null);
  const [showNameHints, setShowNameHints] = useState(false);

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
    setSaveAsFixed(false);
    setMerchant("");
    setQuickPending(null);
    setPickedMerchant(null);
    setShowNameHints(false);
    setPaymentMethodId(
      profile.default_payment_method_id ?? paymentMethods.find((m) => m.is_default)?.id ?? "",
    );
  }, [open, profile.id, profile.default_payment_method_id, paymentMethods]);

  // The category rail is filtered by kind, so a stale pick must be dropped.
  useEffect(() => {
    if (categoryId && !visibleCategories.some((c) => c.id === categoryId)) setCategoryId("");
  }, [categoryId, visibleCategories]);

  // Autocomplete data is fetched on first open, not on page load, so browsing
  // the app stays cheap. The response is cached, so reopening costs nothing.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    fetch("/api/suggestions")
      .then((response) => (response.ok ? response.json() : EMPTY_SUGGESTIONS))
      .then((data: SuggestionIndex) => {
        if (!cancelled) setSuggestions(data);
      })
      .catch(() => {
        // Suggestions are a convenience — never block logging an expense.
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const nameHints = useMemo(
    () => (kind === "expense" ? matchMerchants(suggestions.merchants, merchant) : []),
    [kind, suggestions.merchants, merchant],
  );

  const amountHints = useMemo(
    () =>
      kind === "expense"
        ? suggestedAmounts(suggestions, { merchant: pickedMerchant, categoryId })
        : [],
    [kind, suggestions, pickedMerchant, categoryId],
  );

  /** Picking a remembered name fills in everything it is usually paired with. */
  const applySuggestion = (suggestion: MerchantSuggestion) => {
    setMerchant(suggestion.name);
    setPickedMerchant(suggestion);
    setShowNameHints(false);
    if (!amount && suggestion.amounts[0]) setAmount(String(suggestion.amounts[0]));
    if (suggestion.categoryId && visibleCategories.some((c) => c.id === suggestion.categoryId)) {
      setCategoryId(suggestion.categoryId);
    }
    if (suggestion.paymentMethodId && paymentMethods.some((m) => m.id === suggestion.paymentMethodId)) {
      setPaymentMethodId(suggestion.paymentMethodId);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={kind === "expense" ? "New expense" : "New income"}>
      {/* Quick add — one tap logs a saved fixed expense and closes. --------- */}
      {kind === "expense" && fixedExpenses.length > 0 && (
        <div className="mb-5">
          <span className="dinx-label">Quick add</span>
          <div className="dinx-rail">
            {fixedExpenses.map((fixed) => (
              <button
                key={fixed.id}
                type="button"
                disabled={quickPending !== null}
                onClick={async () => {
                  setQuickPending(fixed.id);
                  const data = new FormData();
                  data.set("id", fixed.id);
                  data.set("paid_by", paidBy);
                  const result = await logFixedExpenseAction(data);
                  setQuickPending(null);
                  if (result.ok) onClose();
                }}
                className="dinx-tap flex shrink-0 items-center gap-2 rounded-2xl border border-line bg-card px-3 py-2.5 text-left disabled:opacity-50"
              >
                <span className="text-lg" aria-hidden>
                  {quickPending === fixed.id ? "⏳" : fixed.emoji}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{fixed.name}</span>
                  <span className="block text-xs text-muted">
                    {money(Number(fixed.amount), currency)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form action={formAction} className="space-y-5 pb-2">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="save_as_fixed" value={saveAsFixed ? "true" : "false"} />
        <input type="hidden" name="category_id" value={categoryId} />
        <input type="hidden" name="payment_method_id" value={paymentMethodId} />
        <input type="hidden" name="paid_by" value={paidBy} />
        <input type="hidden" name="income_kind" value={incomeKind} />
        <input type="hidden" name="is_shared" value={isShared ? "true" : "false"} />

        {/* Expense / income ------------------------------------------------ */}
        <KindToggle value={kind} onChange={setKind} />

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

          {/* Amounts you actually use, narrowing as the form gets specific. */}
          {amountHints.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {amountHints.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(String(value))}
                  className={`dinx-tap rounded-full px-3 py-1.5 text-sm font-medium ${
                    amount === String(value)
                      ? "bg-plum-600 text-white"
                      : "bg-card text-ink-soft shadow-sm"
                  }`}
                >
                  {money(value, currency)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Category --------------------------------------------------------- */}
        <CategoryRail
          categories={visibleCategories}
          value={categoryId}
          onChange={setCategoryId}
          kind={kind}
        />

        {/* Account ---------------------------------------------------------- */}
        <AccountRail
          paymentMethods={paymentMethods}
          value={paymentMethodId}
          onChange={setPaymentMethodId}
          kind={kind}
        />

        {/* Who ------------------------------------------------------------- */}
        <PersonPicker members={members} value={paidBy} onChange={setPaidBy} selfId={profile.id} />

        {/* Income kind ------------------------------------------------------ */}
        {kind === "income" && <IncomeKindPicker value={incomeKind} onChange={setIncomeKind} />}

        {/* Description ------------------------------------------------------ */}
        <div>
          <label htmlFor="merchant" className="dinx-label">
            {kind === "expense" ? "Where" : "Source"}
          </label>
          <div className="relative">
            <input
              id="merchant"
              name="merchant"
              type="text"
              autoComplete="off"
              value={merchant}
              onChange={(e) => {
                setMerchant(e.target.value);
                setPickedMerchant(null);
                setShowNameHints(true);
              }}
              onFocus={() => setShowNameHints(true)}
              // Delayed so a tap on a suggestion registers before the list hides.
              onBlur={() => setTimeout(() => setShowNameHints(false), 150)}
              placeholder={kind === "expense" ? "Nike Store" : "Monthly salary"}
              className="dinx-field"
            />

            {showNameHints && nameHints.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-line bg-card py-1 shadow-lg">
                {nameHints.map((hint) => {
                  const category = categories.find((c) => c.id === hint.categoryId);
                  return (
                    <li key={hint.name}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applySuggestion(hint)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-page"
                      >
                        <span className="text-base" aria-hidden>
                          {category?.emoji ?? "🧾"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {hint.name}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {category?.name ?? "Uncategorised"} · used {hint.count}×
                          </span>
                        </span>
                        {hint.amounts[0] !== undefined && (
                          <span className="shrink-0 text-sm font-semibold text-plum-600">
                            {money(hint.amounts[0], currency)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Save as fixed — needs a name to key the shortcut on. ------------- */}
        {kind === "expense" && (
          <label
            className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-colors ${
              saveAsFixed ? "bg-plum-50" : "bg-page"
            } ${merchant.trim() ? "" : "opacity-50"}`}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">📌 Save as fixed</span>
              <span className="block text-xs text-muted">
                {merchant.trim()
                  ? `Adds "${merchant.trim()}" to Quick add for next time`
                  : "Name it above to save as a shortcut"}
              </span>
            </span>
            <input
              type="checkbox"
              checked={saveAsFixed}
              disabled={!merchant.trim()}
              onChange={(e) => setSaveAsFixed(e.target.checked)}
              className="relative h-6 w-11 shrink-0 appearance-none rounded-full bg-line transition-colors checked:bg-plum-500
                         before:absolute before:top-0.5 before:left-0.5 before:h-5 before:w-5 before:rounded-full
                         before:bg-white before:transition-transform checked:before:translate-x-5"
            />
          </label>
        )}

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
                  <Toggle checked={isShared} onChange={setIsShared} />
                </label>
                {isShared && (
                  <div>
                    <label htmlFor="split_percent" className="dinx-label">
                      Your share
                    </label>
                    <select id="split_percent" name="split_percent" defaultValue="50" className="dinx-field bg-card">
                      {SPLIT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
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
