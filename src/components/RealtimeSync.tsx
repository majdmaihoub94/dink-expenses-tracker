"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Keeps both phones in sync. When the partner writes anything to the shared
 * household, refresh the server components and flash a toast — this is what
 * makes DINX feel live without either person pulling to refresh.
 */
export function RealtimeSync({ householdId, profileId }: { householdId: string; profileId: string }) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // A single save can emit several events. Collapse a burst into one refresh
    // so the app does not re-render repeatedly while your partner is typing.
    let refreshTimer: ReturnType<typeof setTimeout>;
    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 250);
    };

    const channel = supabase
      .channel(`household:${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_events",
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          const event = payload.new as { actor_id: string; type: string; payload: Record<string, unknown> };
          // Our own writes already refreshed via the server action.
          if (event.actor_id === profileId) return;

          const label = String(event.payload?.label ?? event.payload?.name ?? "something");
          setToast(
            {
              expense_added: `New expense: ${label}`,
              income_added: `New income: ${label}`,
              planned_paid: `${label} was paid`,
              savings_added: `Savings added to ${label}`,
              member_joined: "Someone joined your household",
            }[event.type] ?? "Household updated",
          );
          scheduleRefresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `household_id=eq.${householdId}` },
        (payload) => {
          // Our own writes already refreshed via revalidatePath in the server
          // action. Refreshing again here doubled the work on every save.
          const row = payload.new as { created_by?: string } | null;
          if (payload.eventType === "INSERT" && row?.created_by === profileId) return;
          scheduleRefresh();
        },
      )
      .subscribe();

    return () => {
      clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [householdId, profileId, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      className="animate-rise fixed inset-x-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 mx-auto max-w-sm rounded-2xl bg-plum-900 px-4 py-3 text-sm font-medium text-white shadow-lg"
    >
      {toast}
    </div>
  );
}
