"use client";

import { format, parseISO } from "date-fns";
import { useRef, useState } from "react";

import { importTransactionsAction } from "@/app/actions";
import { Sheet } from "@/components/Sheet";
import { money } from "@/lib/format";
import type { ParsedRow } from "@/lib/import/statement";
import type { Category, PaymentMethod, Profile } from "@/lib/types";

type Stage = "pick" | "working" | "review" | "done";

export function ImportStatementSheet({
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
  const [stage, setStage] = useState<Stage>("pick");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inserted, setInserted] = useState(0);
  const [paidBy, setPaidBy] = useState(profile.id);
  const [paymentMethodId, setPaymentMethodId] = useState(
    profile.default_payment_method_id ?? paymentMethods.find((m) => m.is_default)?.id ?? "",
  );
  const fileInput = useRef<HTMLInputElement>(null);

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const selected = rows.filter((r) => r.include);
  const total = selected.reduce((sum, r) => sum + (r.kind === "expense" ? r.amount : 0), 0);

  const reset = () => {
    setStage("pick");
    setRows([]);
    setError(null);
    setInserted(0);
  };

  const upload = async (file: File) => {
    setStage("working");
    setError(null);

    try {
      const body = new FormData();
      body.set("file", file);

      const response = await fetch("/api/import/parse", { method: "POST", body });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not read that file.");
        setStage("pick");
        return;
      }

      setRows(data.rows as ParsedRow[]);
      setStage("review");
    } catch {
      setError("Upload failed. Check your connection and try again.");
      setStage("pick");
    }
  };

  const save = async () => {
    setStage("working");
    const result = await importTransactionsAction(
      selected.map((r) => ({
        date: r.date!,
        description: r.description,
        amount: r.amount,
        kind: r.kind,
        categoryId: r.categoryId,
      })),
      { paidBy, paymentMethodId },
    );

    if (result.ok) {
      setInserted(result.inserted ?? selected.length);
      setStage("done");
    } else {
      setError(result.error);
      setStage("review");
    }
  };

  const update = (index: number, patch: Partial<ParsedRow>) => {
    setRows((current) => current.map((r) => (r.index === index ? { ...r, ...patch } : r)));
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import a statement"
    >
      {stage === "pick" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-plum-50 px-4 py-3 text-xs leading-relaxed text-ink-soft">
            <p className="mb-2 font-semibold text-ink">🔒 How your statement is handled</p>
            <ul className="space-y-1">
              <li>• Read in memory and <strong>never saved to disk</strong> or cloud storage.</li>
              <li>• Processed on DINX&rsquo;s own server — no AI service, no third party.</li>
              <li>• Card numbers, sort codes and account numbers are stripped out.</li>
              <li>• Nothing is added until you review and confirm it below.</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="dinx-tap flex w-full flex-col items-center gap-2 rounded-[var(--radius-tile)] border-2 border-dashed border-plum-200 bg-page py-8"
          >
            <span className="text-3xl" aria-hidden>
              📄
            </span>
            <span className="text-sm font-semibold text-ink">Choose a file</span>
            <span className="text-xs text-muted">PDF statement, CSV or Excel · up to 10MB</span>
          </button>

          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.csv,.tsv,.txt,.xlsx,application/pdf,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />

          <p className="text-xs leading-relaxed text-muted">
            <strong className="text-ink-soft">A CSV export works far better than a PDF.</strong>{" "}
            PDF layouts differ per bank and have to be guessed at. Revolut, Lloyds and HSBC all
            offer CSV or Excel downloads in a couple of taps — use those where you can.
          </p>

          {error && (
            <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
              {error}
            </p>
          )}
        </div>
      )}

      {stage === "working" && (
        <div className="py-12 text-center">
          <p className="text-3xl" aria-hidden>
            ⏳
          </p>
          <p className="mt-3 text-sm font-medium text-ink">Reading your statement…</p>
          <p className="mt-1 text-xs text-muted">Nothing is saved until you confirm.</p>
        </div>
      )}

      {stage === "review" && (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between rounded-2xl bg-page px-4 py-3">
            <span className="text-sm text-muted">
              {selected.length} of {rows.length} selected
            </span>
            <span className="text-base font-bold text-ink">{money(total, currency)}</span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRows((c) => c.map((r) => ({ ...r, include: true })))}
              className="dinx-tap flex-1 rounded-xl bg-page py-2 text-xs font-semibold text-ink-soft"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setRows((c) => c.map((r) => ({ ...r, include: false })))}
              className="dinx-tap flex-1 rounded-xl bg-page py-2 text-xs font-semibold text-ink-soft"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() =>
                setRows((c) => c.map((r) => ({ ...r, include: !r.duplicate && r.kind === "expense" })))
              }
              className="dinx-tap flex-1 rounded-xl bg-page py-2 text-xs font-semibold text-ink-soft"
            >
              Expenses only
            </button>
          </div>

          {members.length > 1 && (
            <div>
              <span className="dinx-label">Log these for</span>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
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

          <div>
            <span className="dinx-label">From account</span>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
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

          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.index}
                className={`rounded-2xl border p-3 ${
                  row.include ? "border-plum-200 bg-card" : "border-line bg-page opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(e) => update(row.index, { include: e.target.checked })}
                    aria-label={`Include ${row.description}`}
                    className="mt-1 h-5 w-5 shrink-0 accent-[#6d3fa8]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{row.description}</p>
                    <p className="text-xs text-muted">
                      {row.date && format(parseISO(row.date), "d MMM yyyy")}
                      {row.duplicate && <span className="text-coral"> · already logged</span>}
                      {row.categorySource === "history" && <span> · matched your history</span>}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-bold ${
                      row.kind === "income" ? "text-mint" : "text-ink"
                    }`}
                  >
                    {row.kind === "income" ? "+" : "−"} {money(row.amount, currency)}
                  </span>
                </div>

                {row.include && (
                  <div className="mt-2 flex gap-2">
                    <select
                      value={row.categoryId ?? ""}
                      onChange={(e) => update(row.index, { categoryId: e.target.value || null })}
                      className="min-w-0 flex-1 rounded-xl border border-line bg-page px-2 py-1.5 text-xs text-ink"
                    >
                      <option value="">Uncategorised</option>
                      {expenseCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.emoji} {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        update(row.index, { kind: row.kind === "expense" ? "income" : "expense" })
                      }
                      className="dinx-tap shrink-0 rounded-xl bg-page px-3 py-1.5 text-xs font-semibold text-plum-600"
                    >
                      {row.kind === "expense" ? "→ Income" : "→ Expense"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {error && (
            <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={save}
            disabled={selected.length === 0}
            className="dinx-tap w-full rounded-2xl bg-coral py-4 font-semibold text-white disabled:opacity-40"
          >
            Import {selected.length} transaction{selected.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {stage === "done" && (
        <div className="py-10 text-center">
          <p className="text-4xl" aria-hidden>
            🎉
          </p>
          <p className="mt-3 text-lg font-bold text-ink">{inserted} imported</p>
          <p className="mt-1 text-sm text-muted">They&rsquo;re in your cycle now.</p>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="dinx-tap mt-6 w-full rounded-2xl bg-plum-600 py-3.5 font-semibold text-white"
          >
            Done
          </button>
        </div>
      )}
    </Sheet>
  );
}
