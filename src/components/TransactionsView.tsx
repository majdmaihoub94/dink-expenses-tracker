"use client";

import { useMemo, useState } from "react";

import { BarChart } from "@/components/BarChart";
import { TransactionList } from "@/components/TransactionList";
import { useShell } from "@/components/AppShell";
import type { Cycle } from "@/lib/cycle";
import { money, moneyParts } from "@/lib/format";
import type { Category, PaymentMethod, Profile, TransactionWithRefs } from "@/lib/types";

type Filter = { kind: "all" | "expense" | "income"; categoryId: string | null; personId: string | null };

/**
 * The receipts screen: a dark summary card that responds to the active filter,
 * a category rail, and the full list for the cycle.
 */
export function TransactionsView({
  transactions,
  categories,
  paymentMethods,
  members,
  currency,
  cycle,
  trend,
  profile,
}: {
  transactions: TransactionWithRefs[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  members: Profile[];
  currency: string;
  cycle: Cycle;
  trend: { key: string; label: string; value: number }[];
  profile: Profile;
}) {
  const { openAdd } = useShell();
  const [filter, setFilter] = useState<Filter>({ kind: "all", categoryId: null, personId: null });
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (filter.kind !== "all" && t.kind !== filter.kind) return false;
      if (filter.categoryId && t.category_id !== filter.categoryId) return false;
      if (filter.personId && t.paid_by !== filter.personId) return false;
      if (!q) return true;
      return [t.merchant, t.note, t.category?.name, t.payment_method?.name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [transactions, filter, query]);

  const total = filtered.reduce(
    (sum, t) => sum + (t.kind === "expense" ? Number(t.amount) : -Number(t.amount)),
    0,
  );
  const tax = filtered.reduce((sum, t) => sum + Number(t.tax_amount), 0);

  const activeCategory = categories.find((c) => c.id === filter.categoryId);
  const parts = moneyParts(total, currency);

  // Only show categories that actually appear in this cycle, most-used first.
  const usedCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions) {
      if (t.category_id) counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
    }
    return categories
      .filter((c) => counts.has(c.id))
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  }, [transactions, categories]);

  return (
    <div className="space-y-4 pb-6">
      {/* Summary ---------------------------------------------------------- */}
      <section className="rounded-[var(--radius-card)] bg-gradient-to-br from-plum-800 to-plum-900 p-5 text-white shadow-[0_18px_40px_-20px_rgba(44,30,62,0.9)]">
        <p className="flex items-baseline gap-0.5">
          <span className="text-lg font-medium text-white/80">
            {total >= 0 ? "− " : "+ "}
            {parts.symbol}
          </span>
          <span className="text-[2rem] leading-none font-semibold">{parts.whole}</span>
          <span className="text-lg font-medium text-white/80">.{parts.pence}</span>
        </p>
        <p className="mt-1 text-sm font-medium text-white/85">
          {activeCategory?.name ?? (filter.kind === "income" ? "Income" : "All transactions")}
        </p>
        <p className="text-xs text-white/55">
          {tax > 0 && `Tax: ${money(tax, currency)} · `}
          {cycle.label}
        </p>

        <div className="mt-4">
          <BarChart data={trend} activeKey={cycle.key} variant="dark" currency={currency} height={92} />
        </div>
      </section>

      {/* Search ----------------------------------------------------------- */}
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search receipts"
          aria-label="Search receipts"
          className="dinx-field bg-card pl-11"
        />
      </div>

      {/* Filters ---------------------------------------------------------- */}
      <div className="dinx-rail">
        {(
          [
            { value: "all", label: "All" },
            { value: "expense", label: "Expenses" },
            { value: "income", label: "Income" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter((f) => ({ ...f, kind: option.value }))}
            className={`dinx-chip ${
              filter.kind === option.value ? "bg-plum-600 text-white" : "bg-card text-ink-soft"
            }`}
          >
            {option.label}
          </button>
        ))}

        {members.length > 1 &&
          members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() =>
                setFilter((f) => ({ ...f, personId: f.personId === member.id ? null : member.id }))
              }
              className={`dinx-chip ${
                filter.personId === member.id ? "bg-plum-800 text-white" : "bg-card text-ink-soft"
              }`}
            >
              <span aria-hidden>{member.emoji}</span>
              {member.display_name}
            </button>
          ))}
      </div>

      {usedCategories.length > 0 && (
        <div className="dinx-rail">
          {usedCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() =>
                setFilter((f) => ({
                  ...f,
                  categoryId: f.categoryId === category.id ? null : category.id,
                }))
              }
              className={`dinx-chip ${
                filter.categoryId === category.id ? "bg-plum-600 text-white" : "bg-card text-ink-soft"
              }`}
            >
              <span aria-hidden>{category.emoji}</span>
              {category.name}
            </button>
          ))}
        </div>
      )}

      {/* Accounts breakdown ----------------------------------------------- */}
      {filter.kind !== "income" && (
        <AccountBreakdown
          transactions={filtered.filter((t) => t.kind === "expense")}
          paymentMethods={paymentMethods}
          currency={currency}
        />
      )}

      {/* List -------------------------------------------------------------- */}
      <section className="dinx-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">
            {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
          </h2>
          <button type="button" onClick={openAdd} className="text-xs font-medium text-plum-600">
            + Add
          </button>
        </div>
        <TransactionList
          transactions={filtered}
          members={members}
          currency={currency}
          emptyLabel="Nothing matches those filters."
          profile={profile}
          categories={categories}
          paymentMethods={paymentMethods}
        />
      </section>
    </div>
  );
}

function AccountBreakdown({
  transactions,
  paymentMethods,
  currency,
}: {
  transactions: TransactionWithRefs[];
  paymentMethods: PaymentMethod[];
  currency: string;
}) {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (!t.payment_method_id) continue;
    totals.set(t.payment_method_id, (totals.get(t.payment_method_id) ?? 0) + Number(t.amount));
  }

  const rows = paymentMethods
    .map((method) => ({ method, amount: totals.get(method.id) ?? 0 }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (rows.length === 0) return null;

  return (
    <div className="dinx-rail">
      {rows.map(({ method, amount }) => (
        <div
          key={method.id}
          className="flex shrink-0 items-center gap-2 rounded-2xl bg-card px-4 py-3 shadow-[0_6px_20px_-16px_rgba(58,42,79,0.5)]"
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: method.color }} aria-hidden />
          <div>
            <p className="text-xs text-muted">{method.name}</p>
            <p className="text-sm font-semibold text-ink">{money(amount, currency)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
