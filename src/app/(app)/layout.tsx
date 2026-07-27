import { AppShell } from "@/components/AppShell";
import { requireContext } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, household, members, categories, paymentMethods, fixedExpenses } =
    await requireContext();

  return (
    <AppShell
      profile={profile}
      household={household}
      members={members}
      categories={categories}
      paymentMethods={paymentMethods}
      fixedExpenses={fixedExpenses}
    >
      {children}
    </AppShell>
  );
}
