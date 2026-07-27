"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { createHouseholdAction, joinHouseholdAction } from "@/app/actions";

const EMOJI_CHOICES = ["🙂", "😎", "🦊", "🐼", "🌻", "🚀", "🐧", "🍀", "⚡", "🎧"];

export function OnboardingForm({
  defaultName,
  defaultEmoji,
}: {
  defaultName: string;
  defaultEmoji: string;
}) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [emoji, setEmoji] = useState(defaultEmoji);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="dinx-card space-y-5">
      <div className="flex rounded-full bg-page p-1">
        {(
          [
            { value: "create", label: "Start fresh" },
            { value: "join", label: "Join partner" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setMode(option.value);
              setError(null);
            }}
            className={`dinx-tap flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
              mode === option.value ? "bg-card text-ink shadow-sm" : "text-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <form
        action={async (formData) => {
          const result =
            mode === "create"
              ? await createHouseholdAction(formData)
              : await joinHouseholdAction(formData);
          // A successful action redirects, so anything returned is a failure.
          if (result && !result.ok) setError(result.error);
        }}
        className="space-y-4"
      >
        <input type="hidden" name="emoji" value={emoji} />

        <div>
          <label htmlFor="display_name" className="dinx-label">
            Your name
          </label>
          <input
            id="display_name"
            name="display_name"
            defaultValue={defaultName}
            placeholder="Priscilla"
            required
            className="dinx-field"
          />
        </div>

        <div>
          <span className="dinx-label">Pick an icon</span>
          <div className="dinx-rail">
            {EMOJI_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setEmoji(choice)}
                aria-label={`Choose ${choice}`}
                aria-pressed={emoji === choice}
                className={`dinx-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${
                  emoji === choice ? "bg-plum-600" : "bg-page"
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>

        {mode === "create" ? (
          <div>
            <label htmlFor="household_name" className="dinx-label">
              Household name
            </label>
            <input
              id="household_name"
              name="household_name"
              defaultValue="Our household"
              className="dinx-field"
            />
            <p className="mt-2 text-xs text-muted">
              We’ll set you up with a 25th-to-25th budget cycle, starter categories, and Revolut,
              Lloyds, HSBC Credit and Cash as accounts. All editable later.
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="invite_code" className="dinx-label">
              Invite code
            </label>
            <input
              id="invite_code"
              name="invite_code"
              placeholder="A1B2C3D4"
              required
              autoCapitalize="characters"
              className="dinx-field text-center font-mono text-lg tracking-[0.2em] uppercase"
            />
            <p className="mt-2 text-xs text-muted">
              Your partner finds this under Profile → Invite your partner.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
            {error}
          </p>
        )}

        <Submit label={mode === "create" ? "Create household" : "Join household"} />
      </form>
    </div>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="dinx-tap w-full rounded-2xl bg-plum-600 py-4 font-semibold text-white disabled:opacity-60"
    >
      {pending ? "…" : label}
    </button>
  );
}
