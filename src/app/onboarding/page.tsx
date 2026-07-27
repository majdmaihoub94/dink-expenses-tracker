import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/OnboardingForm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, emoji, household_id")
    .eq("id", user.id)
    .single();

  // Already set up — nothing to do here.
  if (profile?.household_id) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-ink">Set up DINX</h1>
        <p className="mt-2 text-sm text-muted">
          Start a new household, or join the one your partner already created.
        </p>
      </div>

      <OnboardingForm
        defaultName={profile?.display_name ?? ""}
        defaultEmoji={profile?.emoji ?? "🙂"}
      />
    </main>
  );
}
