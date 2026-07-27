"use client";

import { createContext, useContext, useMemo, useState } from "react";

import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { BottomNav } from "@/components/BottomNav";
import { RealtimeSync } from "@/components/RealtimeSync";
import type { Category, Household, PaymentMethod, Profile } from "@/lib/types";

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
  children,
}: {
  profile: Profile;
  household: Household;
  members: Profile[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
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
        currency={household.currency}
      />
    </ShellContext.Provider>
  );
}
