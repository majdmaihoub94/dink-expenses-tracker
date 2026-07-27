"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name || email.split("@")[0] } },
        });
        if (error) throw error;

        // With email confirmation enabled there is no session yet.
        if (!data.session) {
          setNotice("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      router.push(nextPath);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="dinx-card space-y-4">
      <div className="flex rounded-full bg-page p-1">
        {(
          [
            { value: "signin", label: "Sign in" },
            { value: "signup", label: "Create account" },
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

      {mode === "signup" && (
        <div>
          <label htmlFor="name" className="dinx-label">
            Your name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Priscilla"
            className="dinx-field"
          />
        </div>
      )}

      <div>
        <label htmlFor="email" className="dinx-label">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="dinx-field"
        />
      </div>

      <div>
        <label htmlFor="password" className="dinx-label">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          className="dinx-field"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
          {error}
        </p>
      )}

      {notice && (
        <p role="status" className="rounded-2xl bg-mint-soft px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="dinx-tap w-full rounded-2xl bg-plum-600 py-4 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}
