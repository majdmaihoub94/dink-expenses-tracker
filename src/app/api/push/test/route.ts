import { NextResponse } from "next/server";

import { notifyHousehold } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

/**
 * Sends a test push to everyone else in the household. Useful for checking a
 * newly installed PWA actually receives notifications.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id, display_name")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) {
    return NextResponse.json({ error: "No household" }, { status: 400 });
  }

  const result = await notifyHousehold({
    householdId: profile.household_id,
    actorId: user.id,
    pref: "notify_partner_expense",
    payload: {
      title: "DINX test",
      body: `${profile.display_name} sent a test notification.`,
      url: "/",
      tag: "dinx-test",
    },
  });

  const message =
    result.reason === "unconfigured"
      ? "Push isn't configured on the server (missing VAPID keys)."
      : result.reason === "no_recipients"
        ? "No one else in your household has notifications turned on in their settings."
        : result.reason === "no_subscriptions"
          ? "Your partner hasn't enabled alerts on their device yet — ask them to open Profile and tap Enable."
          : result.sent > 0
            ? `Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}. If it didn't pop up, check the device's OS-level notification settings for DINX.`
            : "Delivery failed for every subscribed device — the subscription may be stale.";

  return NextResponse.json({ ok: true, message, ...result });
}
