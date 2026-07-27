import "server-only";

import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

let configured = false;

/** VAPID keys are optional — without them DINX just runs without push. */
function ensureConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:hello@dinx.app",
      publicKey,
      privateKey,
    );
    configured = true;
  }
  return true;
}

export type NotifyPref = keyof Pick<
  Profile,
  "notify_partner_expense" | "notify_partner_income" | "notify_planned_paid" | "notify_savings"
>;

/**
 * Pushes to everyone in the household except the person who caused the event,
 * respecting each recipient's own notification preference.
 *
 * Fire-and-forget: a push failure must never fail the write that triggered it.
 */
export async function notifyHousehold({
  householdId,
  actorId,
  pref,
  payload,
}: {
  householdId: string;
  actorId: string;
  pref: NotifyPref;
  payload: PushPayload;
}): Promise<void> {
  if (!ensureConfigured()) return;

  try {
    const admin = createAdminClient();

    const { data: recipients } = await admin
      .from("profiles")
      .select("id, " + pref)
      .eq("household_id", householdId)
      .neq("id", actorId);

    const targetIds = (recipients ?? [])
      .filter((r) => (r as unknown as Record<string, boolean>)[pref] !== false)
      .map((r) => (r as unknown as { id: string }).id);

    if (targetIds.length === 0) return;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("*")
      .in("profile_id", targetIds);

    if (!subs?.length) return;

    const body = JSON.stringify(payload);

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint as string,
              keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
            },
            body,
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // 404/410 mean the browser dropped the subscription — clean it up so
          // we stop retrying a dead endpoint on every future event.
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("id", sub.id as string);
          } else {
            console.error("[push] send failed", status, error);
          }
        }
      }),
    );
  } catch (error) {
    console.error("[push] notifyHousehold failed", error);
  }
}
