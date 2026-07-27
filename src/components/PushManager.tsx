"use client";

import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "unsupported" | "unconfigured" | "default" | "granted" | "denied" | "working";

/**
 * Registers the service worker and manages this device's push subscription.
 * Renders a prompt card only when there is something for the user to do.
 */
export function PushManager({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const [state, setState] = useState<State>("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (!vapidPublicKey) {
      setState("unconfigured");
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then(() => setState(Notification.permission as State))
      .catch(() => setState("unsupported"));
  }, [vapidPublicKey]);

  const enable = useCallback(async () => {
    if (!vapidPublicKey) return;
    setState("working");
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission as State);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      // A key rotation invalidates old subscriptions, so always re-subscribe.
      if (existing) await existing.unsubscribe();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        }),
      });

      if (!response.ok) throw new Error("Could not save the subscription");
      setState("granted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setState("default");
    }
  }, [vapidPublicKey]);

  if (state === "granted" || state === "unsupported" || state === "unconfigured") return null;

  return (
    <div className="dinx-tile flex items-center gap-3 bg-plum-50">
      <span className="text-2xl" aria-hidden>
        🔔
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Turn on alerts</p>
        <p className="text-xs text-ink-soft">
          {state === "denied"
            ? "Notifications are blocked. Enable them for DINX in your browser settings."
            : error ?? "Get a nudge the moment your partner logs something."}
        </p>
      </div>
      {state !== "denied" && (
        <button
          type="button"
          onClick={enable}
          disabled={state === "working"}
          className="dinx-tap shrink-0 rounded-full bg-plum-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {state === "working" ? "…" : "Enable"}
        </button>
      )}
    </div>
  );
}
