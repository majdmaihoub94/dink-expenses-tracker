"use client";

import { format, isToday, isYesterday, parseISO } from "date-fns";
import { useMemo, useState } from "react";

import { deleteTransactionAction } from "@/app/actions";
import { Sheet } from "@/components/Sheet";
import { money, signedMoney } from "@/lib/format";
import type { Profile, TransactionWithRefs } from "@/lib/types";

function dayLabel(date: string): string {
  const d = parseISO(date);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "dd MMMM");
}

export function TransactionList({
  transactions,
  members,
  currency,
  variant = "light",
  emptyLabel = "Nothing logged yet.",
}: {
  transactions: TransactionWithRefs[];
  members: Profile[];
  currency: string;
  variant?: "light" | "dark";
  emptyLabel?: string;
}) {
  const [selected, setSelected] = useState<TransactionWithRefs | null>(null);
  const isDark = variant === "dark";

  const groups = useMemo(() => {
    const map = new Map<string, TransactionWithRefs[]>();
    for (const t of transactions) {
      if (!map.has(t.occurred_on)) map.set(t.occurred_on, []);
      map.get(t.occurred_on)!.push(t);
    }
    return [...map.entries()];
  }, [transactions]);

  if (transactions.length === 0) {
    return <p className={`py-8 text-center text-sm ${isDark ? "text-white/60" : "text-muted"}`}>{emptyLabel}</p>;
  }

  return (
    <>
      <div className="space-y-5">
        {groups.map(([date, rows]) => (
          <section key={date}>
            <h3 className={`mb-2 text-xs font-semibold ${isDark ? "text-white/60" : "text-muted"}`}>
              {dayLabel(date)}
            </h3>
            <div className="space-y-1">
              {rows.map((t) => (
                <Row
                  key={t.id}
                  transaction={t}
                  members={members}
                  currency={currency}
                  isDark={isDark}
                  onSelect={() => setSelected(t)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <DetailSheet
        transaction={selected}
        members={members}
        currency={currency}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function Row({
  transaction: t,
  members,
  currency,
  isDark,
  onSelect,
}: {
  transaction: TransactionWithRefs;
  members: Profile[];
  currency: string;
  isDark: boolean;
  onSelect: () => void;
}) {
  const owner = members.find((m) => m.id === t.paid_by);
  const title = t.merchant || t.category?.name || (t.kind === "income" ? "Income" : "Expense");
  const subtitle = [t.category?.name, t.payment_method?.name].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`dinx-tap flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left ${
        isDark ? "active:bg-white/5" : "active:bg-page"
      }`}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg"
        style={{ backgroundColor: t.category?.color ?? (isDark ? "#ffffff1a" : "#F1EDF9") }}
        aria-hidden
      >
        {t.category?.emoji ?? (t.kind === "income" ? "💰" : "🧾")}
      </span>

      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${isDark ? "text-white" : "text-ink"}`}>
          {title}
        </span>
        <span className={`block truncate text-xs ${isDark ? "text-white/55" : "text-muted"}`}>
          {subtitle || "Uncategorised"}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span
          className={`block text-sm font-semibold ${
            t.kind === "income" ? "text-mint" : isDark ? "text-white" : "text-ink"
          }`}
        >
          {signedMoney(Number(t.amount), t.kind, currency)}
        </span>
        <span className={`block text-xs ${isDark ? "text-white/45" : "text-muted"}`}>
          {Number(t.tax_amount) > 0
            ? `Tax: ${money(Number(t.tax_amount), currency)}`
            : (owner?.emoji ?? "")}
        </span>
      </span>
    </button>
  );
}

function DetailSheet({
  transaction: t,
  members,
  currency,
  onClose,
}: {
  transaction: TransactionWithRefs | null;
  members: Profile[];
  currency: string;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (!t) return null;

  const owner = members.find((m) => m.id === t.paid_by);
  const logger = members.find((m) => m.id === t.created_by);

  const rows: [string, string][] = [
    ["Amount", signedMoney(Number(t.amount), t.kind, currency)],
    ["Date", format(parseISO(t.occurred_on), "EEEE d MMMM yyyy")],
    ["Category", t.category?.name ?? "Uncategorised"],
    [t.kind === "expense" ? "Paid from" : "Paid into", t.payment_method?.name ?? "—"],
    ["For", owner ? owner.display_name : "—"],
  ];

  if (Number(t.tax_amount) > 0) rows.push(["Tax", money(Number(t.tax_amount), currency)]);
  if (t.kind === "income") rows.push(["Type", t.income_kind ?? "salary"]);
  if (t.kind === "expense") {
    rows.push(["Shared", t.is_shared ? `Yes · ${t.split_percent}% their share` : "Personal"]);
  }
  // Only worth surfacing when someone logged it on the other person's behalf.
  if (logger && logger.id !== t.paid_by) rows.push(["Logged by", logger.display_name]);
  if (t.note) rows.push(["Note", t.note]);

  return (
    <Sheet open onClose={onClose} title={t.merchant || t.category?.name || "Transaction"}>
      <dl className="divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-3">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-right text-sm font-medium text-ink capitalize">{value}</dd>
          </div>
        ))}
      </dl>

      <form
        action={async (formData) => {
          setPending(true);
          await deleteTransactionAction(formData);
          setPending(false);
          onClose();
        }}
        className="mt-5"
      >
        <input type="hidden" name="id" value={t.id} />
        {confirming ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="dinx-tap flex-1 rounded-2xl bg-page py-3 font-semibold text-ink"
            >
              Keep
            </button>
            <button
              type="submit"
              disabled={pending}
              className="dinx-tap flex-1 rounded-2xl bg-rose py-3 font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="dinx-tap w-full rounded-2xl bg-page py-3 font-semibold text-rose"
          >
            Delete transaction
          </button>
        )}
      </form>
    </Sheet>
  );
}
