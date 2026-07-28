"use client";

import type { Category, PaymentMethod, Profile, SavingsGoal, TxnKind } from "@/lib/types";

/**
 * Field blocks shared by the add and edit sheets, so the two forms cannot
 * drift apart as fields are added.
 */

export function CategoryRail({
  categories,
  value,
  onChange,
  kind,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  kind: TxnKind;
}) {
  return (
    <div>
      <span className="dinx-label">Category</span>
      <div className="dinx-rail">
        {categories.map((category) => {
          const active = value === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onChange(active ? "" : category.id)}
              className={`dinx-chip ${active ? "bg-plum-600 text-white" : "bg-page text-ink-soft"}`}
            >
              <span aria-hidden>{category.emoji}</span>
              {category.name}
            </button>
          );
        })}
        {categories.length === 0 && (
          <p className="py-2 text-sm text-muted">
            No {kind} categories yet — add them in Profile → Categories.
          </p>
        )}
      </div>
    </div>
  );
}

export function GoalRail({
  goals,
  value,
  onChange,
}: {
  goals: SavingsGoal[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <span className="dinx-label">Savings goal</span>
      <div className="dinx-rail">
        {goals.map((goal) => {
          const active = value === goal.id;
          return (
            <button
              key={goal.id}
              type="button"
              onClick={() => onChange(goal.id)}
              className={`dinx-chip ${active ? "bg-plum-600 text-white" : "bg-page text-ink-soft"}`}
            >
              <span aria-hidden>{goal.emoji}</span>
              {goal.name}
            </button>
          );
        })}
        {goals.length === 0 && (
          <p className="py-2 text-sm text-muted">No goals yet — add one in Savings.</p>
        )}
      </div>
    </div>
  );
}

export function AccountRail({
  paymentMethods,
  value,
  onChange,
  kind,
  label,
}: {
  paymentMethods: PaymentMethod[];
  value: string;
  onChange: (id: string) => void;
  kind: TxnKind;
  /** Overrides the kind-based default — e.g. "From account" for a savings deposit. */
  label?: string;
}) {
  return (
    <div>
      <span className="dinx-label">{label ?? (kind === "expense" ? "Paid from" : "Paid into")}</span>
      <div className="dinx-rail">
        {paymentMethods.map((method) => {
          const active = value === method.id;
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => onChange(method.id)}
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
              {method.is_default && !active && <span className="text-[10px] text-muted">default</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PersonPicker({
  members,
  value,
  onChange,
  selfId,
  label = "Logged for",
}: {
  members: Profile[];
  value: string;
  onChange: (id: string) => void;
  selfId: string;
  label?: string;
}) {
  if (members.length < 2) return null;

  return (
    <div>
      <span className="dinx-label">{label}</span>
      <div className="flex gap-2">
        {members.map((member) => {
          const active = value === member.id;
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => onChange(member.id)}
              className={`dinx-tap flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium ${
                active ? "bg-plum-800 text-white" : "bg-page text-ink-soft"
              }`}
            >
              <span aria-hidden>{member.emoji}</span>
              {member.id === selfId ? "Me" : member.display_name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const INCOME_KINDS = [
  { value: "salary", label: "Salary" },
  { value: "extra", label: "Extra" },
  { value: "other", label: "Other" },
] as const;

export function IncomeKindPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <span className="dinx-label">Type</span>
      <div className="flex gap-2">
        {INCOME_KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`dinx-tap flex-1 rounded-2xl py-3 text-sm font-medium ${
              value === option.value ? "bg-mint text-white" : "bg-page text-ink-soft"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function KindToggle({
  value,
  onChange,
}: {
  value: TxnKind;
  onChange: (kind: TxnKind) => void;
}) {
  return (
    <div className="flex rounded-full bg-page p-1">
      {(["expense", "income"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`dinx-tap flex-1 rounded-full py-2 text-sm font-semibold capitalize transition-colors ${
            value === option ? "bg-card text-ink shadow-sm" : "text-muted"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="relative h-6 w-11 shrink-0 appearance-none rounded-full bg-line transition-colors checked:bg-plum-500 disabled:opacity-50
                 before:absolute before:top-0.5 before:left-0.5 before:h-5 before:w-5 before:rounded-full
                 before:bg-white before:transition-transform checked:before:translate-x-5"
    />
  );
}

export const SPLIT_OPTIONS = [
  { value: "50", label: "Split 50 / 50" },
  { value: "100", label: "All mine" },
  { value: "0", label: "All theirs" },
  { value: "60", label: "60 / 40" },
  { value: "70", label: "70 / 30" },
  { value: "75", label: "75 / 25" },
];
