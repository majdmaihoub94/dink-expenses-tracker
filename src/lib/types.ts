export type TxnKind = "expense" | "income";
export type IncomeKind = "salary" | "extra" | "other";
export type PaymentMethodType = "bank" | "credit" | "cash" | "other";

export type ActivityType =
  | "expense_added"
  | "income_added"
  | "planned_paid"
  | "savings_added"
  | "goal_reached"
  | "member_joined";

export type Household = {
  id: string;
  name: string;
  currency: string;
  cycle_start_day: number;
  cycle_label_mode: "start" | "end";
  invite_code: string;
};

export type Profile = {
  id: string;
  display_name: string;
  emoji: string;
  color: string;
  household_id: string | null;
  default_payment_method_id: string | null;
  notify_partner_expense: boolean;
  notify_partner_income: boolean;
  notify_planned_paid: boolean;
  notify_savings: boolean;
};

export type Category = {
  id: string;
  household_id: string;
  name: string;
  emoji: string;
  color: string;
  kind: TxnKind;
  monthly_budget: number | null;
  sort_order: number;
  archived: boolean;
};

export type PaymentMethod = {
  id: string;
  household_id: string;
  name: string;
  type: PaymentMethodType;
  color: string;
  owner_id: string | null;
  is_default: boolean;
  archived: boolean;
  sort_order: number;
};

export type Transaction = {
  id: string;
  household_id: string;
  kind: TxnKind;
  amount: number;
  tax_amount: number;
  income_kind: IncomeKind | null;
  category_id: string | null;
  payment_method_id: string | null;
  paid_by: string;
  created_by: string;
  merchant: string | null;
  note: string | null;
  occurred_on: string;
  is_shared: boolean;
  split_percent: number;
  created_at: string;
};

/** A transaction joined with the rows the list UI needs to render a row. */
export type TransactionWithRefs = Transaction & {
  category: Pick<Category, "id" | "name" | "emoji" | "color"> | null;
  payment_method: Pick<PaymentMethod, "id" | "name" | "color" | "type"> | null;
};

export type PlannedExpense = {
  id: string;
  household_id: string;
  name: string;
  amount: number;
  category_id: string | null;
  payment_method_id: string | null;
  owner_id: string | null;
  due_day: number | null;
  active: boolean;
};

export type PlannedPayment = {
  id: string;
  household_id: string;
  planned_expense_id: string;
  cycle_start: string;
  amount: number;
  paid_by: string;
  created_by: string;
  transaction_id: string | null;
  paid_at: string;
};

/** A reusable one-tap expense shortcut. */
export type FixedExpense = {
  id: string;
  household_id: string;
  name: string;
  amount: number;
  category_id: string | null;
  payment_method_id: string | null;
  emoji: string;
  use_count: number;
  last_used_at: string | null;
  sort_order: number;
  archived: boolean;
};

export type SavingsGoal = {
  id: string;
  household_id: string;
  name: string;
  emoji: string;
  color: string;
  target_amount: number;
  target_date: string | null;
  monthly_target: number | null;
  archived: boolean;
};

export type SavingsContribution = {
  id: string;
  household_id: string;
  goal_id: string;
  amount: number;
  paid_by: string;
  created_by: string;
  payment_method_id: string | null;
  note: string | null;
  occurred_on: string;
};

export type ActivityEvent = {
  id: string;
  household_id: string;
  type: ActivityType;
  actor_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};
