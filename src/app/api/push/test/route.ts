import { NextResponse } from "next/server";

import { notifyHousehold, notifySelf } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

/**
 * Sends a test push. Defaults to the caller's own device(s) — the useful
 * check when setting things up solo — or the rest of the household when
 * { target: "household" } is passed, to confirm real cross-device delivery.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { target?: "self" | "household" };
  const target = body.target === "household" ? "household" : "self";

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

  const payload = {
    title: "DINX test",
    body:
      target === "self"
        ? "This is what a real alert will look like."
        : `${profile.display_name} sent a test notification.`,
    url: "/",
    tag: "dinx-test",
  };

  const result =
    target === "self"
      ? await notifySelf({ profileId: user.id, payload })
      : await notifyHousehold({
          householdId: profile.household_id,
          actorId: user.id,
          pref: "notify_partner_expense",
          payload,
        });

  const message =
    result.reason === "unconfigured"
      ? "Push isn't configured on the server (missing VAPID keys)."
      : result.reason === "no_recipients"
        ? "No one else in your household has notifications turned on in their settings."
        : result.reason === "no_subscriptions"
          ? target === "self"
            ? "No subscription found for this device yet — try disabling and re-enabling alerts."
            : "Your partner hasn't enabled alerts on their device yet — ask them to open Profile and tap Enable."
          : result.sent > 0
            ? `Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}. If it didn't pop up, check this device's OS-level notification settings for DINX.`
            : "Delivery failed for every subscribed device — the subscription may be stale.";

  return NextResponse.json({ ok: true, message, ...result });
}
