"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { updateTransactionAction } from "@/app/actions";
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
import { currencySymbol } from "@/lib/format";
import type { Category, PaymentMethod, Profile, TransactionWithRefs, TxnKind } from "@/lib/types";

export function EditTransactionSheet({
  transaction,
  onClose,
  profile,
  members,
  categories,
  paymentMethods,
  currency,
}: {
  transaction: TransactionWithRefs;
  onClose: () => void;
  profile: Profile;
  members: Profile[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  currency: string;
}) {
  const [kind, setKind] = useState<TxnKind>(transaction.kind);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? "");
  const [paymentMethodId, setPaymentMethodId] = useState(transaction.payment_method_id ?? "");
  const [paidBy, setPaidBy] = useState(transaction.paid_by);
  const [incomeKind, setIncomeKind] = useState<string>(transaction.income_kind ?? "salary");
  const [isShared, setIsShared] = useState(transaction.is_shared);
  const [error, setError] = useState<string | null>(null);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind],
  );

  // Switching expense↔income invalidates a category from the other list.
  const effectiveCategoryId = visibleCategories.some((c) => c.id === categoryId) ? categoryId : "";

  return (
    <Sheet open onClose={onClose} title="Edit transaction">
      <form
        action={async (formData) => {
          const result = await updateTransactionAction(formData);
          if (result.ok) onClose();
          else setError(result.error);
        }}
        className="space-y-5 pb-2"
      >
        <input type="hidden" name="id" value={transaction.id} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="category_id" value={effectiveCategoryId} />
        <input type="hidden" name="payment_method_id" value={paymentMethodId} />
        <input type="hidden" name="paid_by" value={paidBy} />
        <input type="hidden" name="income_kind" value={incomeKind} />
        <input type="hidden" name="is_shared" value={isShared ? "true" : "false"} />

        <KindToggle value={kind} onChange={setKind} />

        <div className="rounded-[var(--radius-tile)] bg-page px-4 py-5 text-center">
          <label htmlFor="edit-amount" className="dinx-label">
            Amount
          </label>
          <div className="flex items-center justify-center gap-1">
            <span className={`text-3xl font-semibold ${kind === "expense" ? "text-ink" : "text-mint"}`}>
              {kind === "expense" ? "−" : "+"} {currencySymbol(currency)}
            </span>
            <input
              id="edit-amount"
              name="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-[7ch] bg-transparent text-4xl font-semibold text-ink outline-none"
            />
          </div>
        </div>

        <CategoryRail
          categories={visibleCategories}
          value={effectiveCategoryId}
          onChange={setCategoryId}
          kind={kind}
        />

        <AccountRail
          paymentMethods={paymentMethods}
          value={paymentMethodId}
          onChange={setPaymentMethodId}
          kind={kind}
        />

        <PersonPicker members={members} value={paidBy} onChange={setPaidBy} selfId={profile.id} />

        {kind === "income" && <IncomeKindPicker value={incomeKind} onChange={setIncomeKind} />}

        <div>
          <label htmlFor="edit-merchant" className="dinx-label">
            {kind === "expense" ? "Where" : "Source"}
          </label>
          <input
            id="edit-merchant"
            name="merchant"
            type="text"
            autoComplete="off"
            defaultValue={transaction.merchant ?? ""}
            className="dinx-field"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-date" className="dinx-label">
              Date
            </label>
            <input
              id="edit-date"
              name="occurred_on"
              type="date"
              defaultValue={transaction.occurred_on}
              className="dinx-field"
            />
          </div>
          <div>
            <label htmlFor="edit-tax" className="dinx-label">
              Tax / VAT
            </label>
            <input
              id="edit-tax"
              name="tax_amount"
              type="text"
              inputMode="decimal"
              defaultValue={Number(transaction.tax_amount) > 0 ? String(transaction.tax_amount) : ""}
              placeholder="0.00"
              className="dinx-field"
            />
          </div>
        </div>

        {kind === "expense" && members.length > 1 && (
          <>
            <label className="flex items-center justify-between gap-3 rounded-2xl bg-page px-4 py-3">
              <span className="text-sm font-medium text-ink">Shared cost</span>
              <Toggle checked={isShared} onChange={setIsShared} />
            </label>
            {isShared && (
              <div>
                <label htmlFor="edit-split" className="dinx-label">
                  Your share
                </label>
                <select
                  id="edit-split"
                  name="split_percent"
                  defaultValue={String(transaction.split_percent)}
                  className="dinx-field"
                >
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
          <label htmlFor="edit-note" className="dinx-label">
            Note
          </label>
          <textarea
            id="edit-note"
            name="note"
            rows={2}
            defaultValue={transaction.note ?? ""}
            placeholder="Optional"
            className="dinx-field resize-none"
          />
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
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}
