"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { shiftCycle, type Cycle } from "@/lib/cycle";

/** Prev / next stepper for the budget cycle, driven by the `?cycle=` param. */
export function CycleSwitcher({
  cycle,
  labelMode = "end",
  basePath,
  canGoForward = true,
}: {
  cycle: Cycle;
  labelMode?: "start" | "end";
  basePath: string;
  canGoForward?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const go = (offset: number) => {
    const next = shiftCycle(cycle, offset, labelMode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("cycle", next.key);
    router.push(`${basePath}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-full bg-card p-1.5 shadow-[0_6px_20px_-16px_rgba(58,42,79,0.5)]">
      <Arrow direction="prev" onClick={() => go(-1)} />
      <div className="text-center">
        <p className="text-sm font-semibold text-ink">{cycle.label}</p>
        <p className="text-[11px] text-muted">{cycle.rangeLabel}</p>
      </div>
      <Arrow direction="next" onClick={() => go(1)} disabled={!canGoForward} />
    </div>
  );
}

function Arrow({
  direction,
  onClick,
  disabled,
}: {
  direction: "prev" | "next";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Previous cycle" : "Next cycle"}
      className="dinx-tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-page text-ink-soft disabled:opacity-30"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={direction === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}
