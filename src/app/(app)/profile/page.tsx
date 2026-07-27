import { ProfileView } from "@/components/ProfileView";
import { PushManager } from "@/components/PushManager";
import { requireContext } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { profile, household, members, categories, paymentMethods, fixedExpenses } =
    await requireContext();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-ink">Profile</h1>
      </header>

      <PushManager vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />

      <ProfileView
        profile={profile}
        household={household}
        members={members}
        categories={categories}
        paymentMethods={paymentMethods}
        fixedExpenses={fixedExpenses}
      />
    </div>
  );
}
