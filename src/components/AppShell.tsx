"use client";

import { createContext, useContext, useMemo, useState } from "react";

import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { BottomNav } from "@/components/BottomNav";
import { RealtimeSync } from "@/components/RealtimeSync";
import type {
  Category,
  FixedExpense,
  Household,
  PaymentMethod,
  Profile,
  SavingsGoal,
} from "@/lib/types";

type ShellValue = { openAdd: () => void };

const ShellContext = createContext<ShellValue>({ openAdd: () => {} });

/** Lets any page trigger the add sheet, e.g. from an empty state. */
export function useShell() {
  return useContext(ShellContext);
}

export function AppShell({
  profile,
  household,
  members,
  categories,
  paymentMethods,
  fixedExpenses,
  savingsGoals,
  children,
}: {
  profile: Profile;
  household: Household;
  members: Profile[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  fixedExpenses: FixedExpense[];
  savingsGoals: SavingsGoal[];
  children: React.ReactNode;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const value = useMemo<ShellValue>(() => ({ openAdd: () => setAddOpen(true) }), []);

  return (
    <ShellContext.Provider value={value}>
      <RealtimeSync householdId={household.id} profileId={profile.id} />

      <div className="mx-auto min-h-screen w-full max-w-lg px-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        {children}
      </div>

      <BottomNav onAdd={() => setAddOpen(true)} />

      <AddTransactionSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        profile={profile}
        members={members}
        categories={categories}
        paymentMethods={paymentMethods}
        fixedExpenses={fixedExpenses}
        savingsGoals={savingsGoals}
        currency={household.currency}
        defaultShared={household.default_expense_shared}
        defaultSplitPercent={household.default_split_percent}
      />
    </ShellContext.Provider>
  );
}
