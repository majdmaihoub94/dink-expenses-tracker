"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import {
  bulkImportCategoriesAction,
  bulkImportFixedExpensesAction,
  deleteCategoryAction,
  deleteFixedExpenseAction,
  saveFixedExpenseAction,
  deletePaymentMethodAction,
  saveCategoryAction,
  savePaymentMethodAction,
  setDefaultPaymentMethodAction,
  signOutAction,
  updateHouseholdAction,
  updateProfileAction,
} from "@/app/actions";
import { Sheet } from "@/components/Sheet";
import { money } from "@/lib/format";
import type { Category, FixedExpense, Household, PaymentMethod, Profile } from "@/lib/types";

type Panel =
  | "profile"
  | "notifications"
  | "categories"
  | "fixed"
  | "accounts"
  | "household"
  | "invite"
  | null;

export function ProfileView({
  profile,
  household,
  members,
  categories,
  paymentMethods,
  fixedExpenses,
}: {
  profile: Profile;
  household: Household;
  members: Profile[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  fixedExpenses: FixedExpense[];
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const defaultMethod = paymentMethods.find((m) => m.id === profile.default_payment_method_id);

  return (
    <div className="space-y-4 pb-6">
      {/* Identity card ---------------------------------------------------- */}
      <section className="dinx-card flex items-center gap-4">
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-3xl"
          style={{ backgroundColor: `${profile.color}22` }}
          aria-hidden
        >
          {profile.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-ink">{profile.display_name}</h2>
          <p className="truncate text-sm text-muted">{household.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {members.length === 1
              ? "Just you so far"
              : `With ${members
                  .filter((m) => m.id !== profile.id)
                  .map((m) => m.display_name)
                  .join(", ")}`}
          </p>
        </div>
      </section>

      <div className="space-y-2">
        <Row
          emoji="👤"
          title="Your details"
          caption="Name, icon and colour"
          onClick={() => setPanel("profile")}
        />
        <Row
          emoji="🔔"
          title="Notifications"
          caption={notificationSummary(profile)}
          onClick={() => setPanel("notifications")}
        />
        <Row
          emoji="🏷️"
          title="Categories"
          caption={`${categories.filter((c) => c.kind === "expense").length} expense · ${
            categories.filter((c) => c.kind === "income").length
          } income`}
          onClick={() => setPanel("categories")}
        />
        <Row
          emoji="📌"
          title="Fixed expenses"
          caption={
            fixedExpenses.length === 0
              ? "One-tap shortcuts for repeat spends"
              : `${fixedExpenses.length} shortcut${fixedExpenses.length === 1 ? "" : "s"}`
          }
          onClick={() => setPanel("fixed")}
        />
        <Row
          emoji="💳"
          title="Accounts & cards"
          caption={defaultMethod ? `Default: ${defaultMethod.name}` : `${paymentMethods.length} accounts`}
          onClick={() => setPanel("accounts")}
        />
        <Row
          emoji="🗓️"
          title="Budget cycle"
          caption={`${ordinal(household.cycle_start_day)} to ${ordinal(
            household.cycle_start_day - 1 || 31,
          )} · ${household.currency}`}
          onClick={() => setPanel("household")}
        />
        <Row
          emoji="💌"
          title="Invite your partner"
          caption={members.length > 1 ? "Household is paired" : "Share your code"}
          onClick={() => setPanel("invite")}
        />
      </div>

      <form action={signOutAction}>
        <button
          type="submit"
          className="dinx-tap w-full rounded-2xl bg-card py-3.5 font-semibold text-rose shadow-[0_6px_20px_-16px_rgba(58,42,79,0.5)]"
        >
          Sign out
        </button>
      </form>

      <p className="text-center text-xs text-muted">DINX · built for two</p>

      {/* Panels ----------------------------------------------------------- */}
      <ProfilePanel open={panel === "profile"} onClose={() => setPanel(null)} profile={profile} />
      <NotificationsPanel
        open={panel === "notifications"}
        onClose={() => setPanel(null)}
        profile={profile}
      />
      <CategoriesPanel
        open={panel === "categories"}
        onClose={() => setPanel(null)}
        categories={categories}
        currency={household.currency}
      />
      <FixedExpensesPanel
        open={panel === "fixed"}
        onClose={() => setPanel(null)}
        fixedExpenses={fixedExpenses}
        categories={categories}
        paymentMethods={paymentMethods}
        currency={household.currency}
      />
      <AccountsPanel
        open={panel === "accounts"}
        onClose={() => setPanel(null)}
        paymentMethods={paymentMethods}
        members={members}
        defaultId={profile.default_payment_method_id}
      />
      <HouseholdPanel open={panel === "household"} onClose={() => setPanel(null)} household={household} />
      <InvitePanel
        open={panel === "invite"}
        onClose={() => setPanel(null)}
        household={household}
        members={members}
      />
    </div>
  );
}

function Row({
  emoji,
  title,
  caption,
  onClick,
}: {
  emoji: string;
  title: string;
  caption: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="dinx-tile dinx-tap flex w-full items-center gap-3 text-left">
      <span className="text-xl" aria-hidden>
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block truncate text-xs text-muted">{caption}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

function ProfilePanel({
  open,
  onClose,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
}) {
  if (!open) return null;

  return (
    <Sheet open onClose={onClose} title="Your details">
      <form action={async (fd) => { await updateProfileAction(fd); onClose(); }} className="space-y-4">
        {/* Preserve the notification prefs this form doesn't show. */}
        <input type="hidden" name="notify_partner_expense" value={String(profile.notify_partner_expense)} />
        <input type="hidden" name="notify_partner_income" value={String(profile.notify_partner_income)} />
        <input type="hidden" name="notify_planned_paid" value={String(profile.notify_planned_paid)} />
        <input type="hidden" name="notify_savings" value={String(profile.notify_savings)} />

        <div className="grid grid-cols-[4.5rem_1fr] gap-3">
          <div>
            <label htmlFor="p-emoji" className="dinx-label">
              Icon
            </label>
            <input id="p-emoji" name="emoji" defaultValue={profile.emoji} maxLength={4} className="dinx-field text-center text-xl" />
          </div>
          <div>
            <label htmlFor="p-name" className="dinx-label">
              Name
            </label>
            <input id="p-name" name="display_name" defaultValue={profile.display_name} required className="dinx-field" />
          </div>
        </div>

        <div>
          <label htmlFor="p-color" className="dinx-label">
            Colour
          </label>
          <input
            id="p-color"
            name="color"
            type="color"
            defaultValue={profile.color}
            className="h-12 w-full rounded-2xl border border-line bg-page px-2"
          />
        </div>

        <Submit label="Save" />
      </form>
    </Sheet>
  );
}

const NOTIFY_OPTIONS = [
  { name: "notify_partner_expense", label: "New expenses", caption: "When your partner logs a spend" },
  { name: "notify_partner_income", label: "New income", caption: "Salary and extras" },
  { name: "notify_planned_paid", label: "Bills paid", caption: "When an expected bill is ticked off" },
  { name: "notify_savings", label: "Savings", caption: "Deposits and withdrawals" },
] as const;

function NotificationsPanel({
  open,
  onClose,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
}) {
  if (!open) return null;

  return (
    <Sheet open onClose={onClose} title="Notifications">
      <form action={async (fd) => { await updateProfileAction(fd); onClose(); }} className="space-y-4">
        <input type="hidden" name="display_name" value={profile.display_name} />
        <input type="hidden" name="emoji" value={profile.emoji} />
        <input type="hidden" name="color" value={profile.color} />

        <div className="space-y-1">
          {NOTIFY_OPTIONS.map((option) => (
            <label
              key={option.name}
              className="flex items-center justify-between gap-3 rounded-2xl bg-page px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                <span className="block text-xs text-muted">{option.caption}</span>
              </span>
              <input
                type="checkbox"
                name={option.name}
                defaultChecked={profile[option.name]}
                className="relative h-6 w-11 shrink-0 appearance-none rounded-full bg-line transition-colors checked:bg-plum-500
                           before:absolute before:top-0.5 before:left-0.5 before:h-5 before:w-5 before:rounded-full
                           before:bg-white before:transition-transform checked:before:translate-x-5"
              />
            </label>
          ))}
        </div>

        <p className="rounded-2xl bg-plum-50 px-4 py-3 text-xs text-ink-soft">
          These control what gets pushed to your phone. Install DINX to your home screen first —
          iOS only delivers push notifications to installed web apps.
        </p>

        <Submit label="Save preferences" />
      </form>
    </Sheet>
  );
}

function CategoriesPanel({
  open,
  onClose,
  categories,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  currency: string;
}) {
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const existing = editing === "new" ? null : editing;

  return (
    <Sheet open onClose={onClose} title="Categories">
      {editing ? (
        <form
          action={async (fd) => {
            const result = await saveCategoryAction(fd);
            if (result.ok) setEditing(null);
            else setError(result.error);
          }}
          className="space-y-4"
        >
          {existing && <input type="hidden" name="id" value={existing.id} />}

          <div className="grid grid-cols-[4.5rem_1fr] gap-3">
            <div>
              <label htmlFor="c-emoji" className="dinx-label">
                Icon
              </label>
              <input id="c-emoji" name="emoji" defaultValue={existing?.emoji ?? "🏷️"} maxLength={4} className="dinx-field text-center text-xl" />
            </div>
            <div>
              <label htmlFor="c-name" className="dinx-label">
                Name
              </label>
              <input id="c-name" name="name" defaultValue={existing?.name} required className="dinx-field" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="c-kind" className="dinx-label">
                Type
              </label>
              <select id="c-kind" name="kind" defaultValue={existing?.kind ?? "expense"} className="dinx-field">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <label htmlFor="c-budget" className="dinx-label">
                Cap / cycle
              </label>
              <input
                id="c-budget"
                name="monthly_budget"
                type="text"
                inputMode="decimal"
                defaultValue={existing?.monthly_budget ? String(existing.monthly_budget) : ""}
                placeholder="Optional"
                className="dinx-field"
              />
            </div>
          </div>

          <div>
            <label htmlFor="c-color" className="dinx-label">
              Tile colour
            </label>
            <input
              id="c-color"
              name="color"
              type="color"
              defaultValue={existing?.color ?? "#EDE9FE"}
              className="h-12 w-full rounded-2xl border border-line bg-page px-2"
            />
          </div>

          {error && <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">{error}</p>}

          <Submit label={existing ? "Save" : "Add category"} />
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="dinx-tap w-full rounded-2xl bg-page py-3 font-semibold text-ink-soft"
          >
            Cancel
          </button>
        </form>
      ) : importing ? (
        <form
          action={async (fd) => {
            const result = await bulkImportCategoriesAction(fd);
            if (result.ok) setImporting(false);
            else setError(result.error);
          }}
          className="space-y-4"
        >
          <p className="rounded-2xl bg-plum-50 px-4 py-3 text-xs text-ink-soft">
            One category per line. Optionally lead with an emoji and follow with a comma and a
            per-cycle cap:
            <br />
            <span className="font-mono">🛒 Groceries, 450</span>
          </p>

          <textarea
            name="categories"
            rows={10}
            required
            placeholder={"🛒 Groceries, 450\n🍽️ Eating out, 200\n🚗 Fuel\n🏠 Rent"}
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
            <span className="text-sm text-ink">Replace the current expense list</span>
          </label>

          {error && <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">{error}</p>}

          <Submit label="Import categories" />
          <button
            type="button"
            onClick={() => setImporting(false)}
            className="dinx-tap w-full rounded-2xl bg-page py-3 font-semibold text-ink-soft"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="dinx-tap rounded-2xl bg-plum-600 py-3 text-sm font-semibold text-white"
            >
              + New
            </button>
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="dinx-tap rounded-2xl bg-page py-3 text-sm font-semibold text-plum-600"
            >
              Paste a list
            </button>
          </div>

          {(["expense", "income"] as const).map((kind) => (
            <section key={kind}>
              <h3 className="mb-2 text-xs font-semibold text-muted uppercase">{kind}</h3>
              <div className="space-y-1">
                {categories
                  .filter((c) => c.kind === kind)
                  .map((category) => (
                    <div key={category.id} className="flex items-center gap-3 rounded-2xl bg-page px-3 py-2.5">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full text-base"
                        style={{ backgroundColor: category.color }}
                        aria-hidden
                      >
                        {category.emoji}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditing(category)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm font-medium text-ink">
                          {category.name}
                        </span>
                        {category.monthly_budget && (
                          <span className="block text-xs text-muted">
                            Cap {money(Number(category.monthly_budget), currency)}
                          </span>
                        )}
                      </button>
                      <form action={deleteCategoryAction}>
                        <input type="hidden" name="id" value={category.id} />
                        <button
                          type="submit"
                          aria-label={`Remove ${category.name}`}
                          className="dinx-tap px-2 text-muted"
                        >
                          ✕
                        </button>
                      </form>
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function FixedExpensesPanel({
  open,
  onClose,
  fixedExpenses,
  categories,
  paymentMethods,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  fixedExpenses: FixedExpense[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  currency: string;
}) {
  const [editing, setEditing] = useState<FixedExpense | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const existing = editing === "new" ? null : editing;
  const expenseCategories = categories.filter((c) => c.kind === "expense");

  return (
    <Sheet open onClose={onClose} title="Fixed expenses">
      {editing ? (
        <form
          action={async (fd) => {
            const result = await saveFixedExpenseAction(fd);
            if (result.ok) setEditing(null);
            else setError(result.error);
          }}
          className="space-y-4"
        >
          {existing && <input type="hidden" name="id" value={existing.id} />}

          <div className="grid grid-cols-[4.5rem_1fr] gap-3">
            <div>
              <label htmlFor="fx-emoji" className="dinx-label">
                Icon
              </label>
              <input
                id="fx-emoji"
                name="emoji"
                defaultValue={existing?.emoji ?? "⚡"}
                maxLength={4}
                className="dinx-field text-center text-xl"
              />
            </div>
            <div>
              <label htmlFor="fx-name" className="dinx-label">
                Name
              </label>
              <input
                id="fx-name"
                name="name"
                defaultValue={existing?.name}
                placeholder="Weekly shop"
                required
                className="dinx-field"
              />
            </div>
          </div>

          <div>
            <label htmlFor="fx-amount" className="dinx-label">
              Amount ({currency})
            </label>
            <input
              id="fx-amount"
              name="amount"
              type="text"
              inputMode="decimal"
              defaultValue={existing ? String(existing.amount) : ""}
              placeholder="85.00"
              required
              className="dinx-field text-lg font-semibold"
            />
          </div>

          <div>
            <label htmlFor="fx-category" className="dinx-label">
              Category
            </label>
            <select
              id="fx-category"
              name="category_id"
              defaultValue={existing?.category_id ?? ""}
              className="dinx-field"
            >
              <option value="">None</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fx-method" className="dinx-label">
              Paid from
            </label>
            <select
              id="fx-method"
              name="payment_method_id"
              defaultValue={existing?.payment_method_id ?? ""}
              className="dinx-field"
            >
              <option value="">Your default</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {error && <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">{error}</p>}

          <Submit label={existing ? "Save" : "Add fixed expense"} />
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="dinx-tap w-full rounded-2xl bg-page py-3 font-semibold text-ink-soft"
          >
            Cancel
          </button>
        </form>
      ) : importing ? (
        <form
          action={async (fd) => {
            const result = await bulkImportFixedExpensesAction(fd);
            if (result.ok) setImporting(false);
            else setError(result.error);
          }}
          className="space-y-4"
        >
          <p className="rounded-2xl bg-plum-50 px-4 py-3 text-xs text-ink-soft">
            One per line: <span className="font-mono">Name, amount, category</span>
            <br />
            Lead with an emoji if you like. The category is matched by name against your existing
            list and left blank when there is no match.
          </p>

          <textarea
            name="fixed_expenses"
            rows={10}
            required
            placeholder={
              "🛒 Weekly shop, 85, Groceries\n📺 Netflix, 12.99, Subscriptions\n🚆 Train pass, 145, Transport\n☕ Coffee, 3.50"
            }
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
            <span className="text-sm text-ink">Replace the current list</span>
          </label>

          {error && <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">{error}</p>}

          <Submit label="Import fixed expenses" />
          <button
            type="button"
            onClick={() => setImporting(false)}
            className="dinx-tap w-full rounded-2xl bg-page py-3 font-semibold text-ink-soft"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="rounded-2xl bg-plum-50 px-4 py-3 text-xs text-ink-soft">
            Shortcuts for spends you repeat. They appear under <strong>Quick add</strong> at the top
            of the add sheet — one tap logs the whole thing.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="dinx-tap rounded-2xl bg-plum-600 py-3 text-sm font-semibold text-white"
            >
              + New
            </button>
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="dinx-tap rounded-2xl bg-page py-3 text-sm font-semibold text-plum-600"
            >
              Paste a list
            </button>
          </div>

          {fixedExpenses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Nothing saved yet. Tick “Save as fixed” when adding an expense, or paste a list.
            </p>
          ) : (
            <div className="space-y-1">
              {fixedExpenses.map((fixed) => {
                const category = categories.find((c) => c.id === fixed.category_id);
                return (
                  <div key={fixed.id} className="flex items-center gap-3 rounded-2xl bg-page px-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-base" aria-hidden>
                      {fixed.emoji}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing(fixed)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-medium text-ink">{fixed.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {money(Number(fixed.amount), currency)}
                        {category && ` · ${category.name}`}
                        {fixed.use_count > 0 && ` · used ${fixed.use_count}×`}
                      </span>
                    </button>
                    <form action={deleteFixedExpenseAction}>
                      <input type="hidden" name="id" value={fixed.id} />
                      <button
                        type="submit"
                        aria-label={`Remove ${fixed.name}`}
                        className="dinx-tap px-2 text-muted"
                      >
                        ✕
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function AccountsPanel({
  open,
  onClose,
  paymentMethods,
  members,
  defaultId,
}: {
  open: boolean;
  onClose: () => void;
  paymentMethods: PaymentMethod[];
  members: Profile[];
  defaultId: string | null;
}) {
  const [editing, setEditing] = useState<PaymentMethod | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const existing = editing === "new" ? null : editing;

  return (
    <Sheet open onClose={onClose} title="Accounts & cards">
      {editing ? (
        <form
          action={async (fd) => {
            const result = await savePaymentMethodAction(fd);
            if (result.ok) setEditing(null);
            else setError(result.error);
          }}
          className="space-y-4"
        >
          {existing && <input type="hidden" name="id" value={existing.id} />}

          <div>
            <label htmlFor="pm-name" className="dinx-label">
              Name
            </label>
            <input id="pm-name" name="name" defaultValue={existing?.name} placeholder="Monzo" required className="dinx-field" />
          </div>

          <div>
            <label htmlFor="pm-type" className="dinx-label">
              Type
            </label>
            <select id="pm-type" name="type" defaultValue={existing?.type ?? "bank"} className="dinx-field">
              <option value="bank">Bank account</option>
              <option value="credit">Credit card</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>

          {members.length > 1 && (
            <div>
              <label htmlFor="pm-owner" className="dinx-label">
                Belongs to
              </label>
              <select id="pm-owner" name="owner_id" defaultValue={existing?.owner_id ?? ""} className="dinx-field">
                <option value="">Both of us</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.emoji} {m.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="pm-color" className="dinx-label">
              Colour
            </label>
            <input
              id="pm-color"
              name="color"
              type="color"
              defaultValue={existing?.color ?? "#3B2A50"}
              className="h-12 w-full rounded-2xl border border-line bg-page px-2"
            />
          </div>

          {error && <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">{error}</p>}

          <Submit label={existing ? "Save" : "Add account"} />
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="dinx-tap w-full rounded-2xl bg-page py-3 font-semibold text-ink-soft"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="dinx-tap w-full rounded-2xl bg-plum-600 py-3 text-sm font-semibold text-white"
          >
            + Add an account
          </button>

          <p className="text-xs text-muted">
            Tap an account to make it the one pre-selected when you log an expense.
          </p>

          <div className="space-y-1">
            {paymentMethods.map((method) => {
              const owner = members.find((m) => m.id === method.owner_id);
              const isDefault = method.id === defaultId;

              return (
                <div key={method.id} className="flex items-center gap-3 rounded-2xl bg-page px-3 py-2.5">
                  <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: method.color }} aria-hidden />

                  <form action={setDefaultPaymentMethodAction} className="min-w-0 flex-1">
                    <input type="hidden" name="id" value={method.id} />
                    <button type="submit" className="w-full text-left">
                      <span className="block truncate text-sm font-medium text-ink">
                        {method.name}
                        {isDefault && <span className="ml-2 text-xs text-plum-600">· default</span>}
                      </span>
                      <span className="block text-xs text-muted capitalize">
                        {method.type}
                        {owner && ` · ${owner.display_name}`}
                      </span>
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => setEditing(method)}
                    aria-label={`Edit ${method.name}`}
                    className="dinx-tap px-2 text-xs font-medium text-plum-600"
                  >
                    Edit
                  </button>

                  <form action={deletePaymentMethodAction}>
                    <input type="hidden" name="id" value={method.id} />
                    <button type="submit" aria-label={`Remove ${method.name}`} className="dinx-tap px-2 text-muted">
                      ✕
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function HouseholdPanel({
  open,
  onClose,
  household,
}: {
  open: boolean;
  onClose: () => void;
  household: Household;
}) {
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  return (
    <Sheet open onClose={onClose} title="Budget cycle">
      <form
        action={async (fd) => {
          const result = await updateHouseholdAction(fd);
          if (result.ok) onClose();
          else setError(result.error);
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="h-name" className="dinx-label">
            Household name
          </label>
          <input id="h-name" name="name" defaultValue={household.name} className="dinx-field" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="h-day" className="dinx-label">
              Cycle starts on
            </label>
            <input
              id="h-day"
              name="cycle_start_day"
              type="number"
              min={1}
              max={28}
              defaultValue={household.cycle_start_day}
              className="dinx-field"
            />
          </div>
          <div>
            <label htmlFor="h-currency" className="dinx-label">
              Currency
            </label>
            <select id="h-currency" name="currency" defaultValue={household.currency} className="dinx-field">
              <option value="GBP">GBP £</option>
              <option value="EUR">EUR €</option>
              <option value="USD">USD $</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="h-label" className="dinx-label">
            Name each cycle after
          </label>
          <select id="h-label" name="cycle_label_mode" defaultValue={household.cycle_label_mode} className="dinx-field">
            <option value="end">The month it ends in</option>
            <option value="start">The month it starts in</option>
          </select>
          <p className="mt-2 text-xs text-muted">
            With a {ordinal(household.cycle_start_day)} start, {household.cycle_label_mode === "end"
              ? "25 Apr – 24 May is called “May”."
              : "25 Apr – 24 May is called “April”."}
          </p>
        </div>

        {error && <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">{error}</p>}

        <Submit label="Save" />
      </form>
    </Sheet>
  );
}

function InvitePanel({
  open,
  onClose,
  household,
  members,
}: {
  open: boolean;
  onClose: () => void;
  household: Household;
  members: Profile[];
}) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(household.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Invite your partner">
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          They sign up on their own phone, then enter this code to join {household.name}. From then
          on you both see the same numbers, live.
        </p>

        <button
          type="button"
          onClick={copy}
          className="dinx-tap w-full rounded-[var(--radius-tile)] bg-plum-800 py-6 text-center text-white"
        >
          <span className="block text-xs tracking-wide text-white/60 uppercase">Invite code</span>
          <span className="mt-1 block font-mono text-3xl font-bold tracking-[0.2em]">
            {household.invite_code}
          </span>
          <span className="mt-2 block text-xs text-white/60">{copied ? "Copied ✓" : "Tap to copy"}</span>
        </button>

        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-page px-4 py-3">
              <span className="text-lg" aria-hidden>
                {m.emoji}
              </span>
              <span className="text-sm font-medium text-ink">{m.display_name}</span>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function Submit({ label }: { label: string }) {
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

function notificationSummary(profile: Profile): string {
  const on = NOTIFY_OPTIONS.filter((o) => profile[o.name]).length;
  if (on === 0) return "All muted";
  if (on === NOTIFY_OPTIONS.length) return "All alerts on";
  return `${on} of ${NOTIFY_OPTIONS.length} on`;
}

function ordinal(day: number): string {
  const suffix = ["th", "st", "nd", "rd"][((day % 100) - 20) % 10] ?? ["th", "st", "nd", "rd"][day] ?? "th";
  return `${day}${suffix}`;
}
