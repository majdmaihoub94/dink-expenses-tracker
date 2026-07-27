"use client";

import { compactMoney } from "@/lib/format";

export type BarDatum = {
  key: string;
  label: string;
  value: number;
};

/**
 * The chart from the reference mockup: flat rounded columns, muted except for
 * the selected one, month labels underneath.
 */
export function BarChart({
  data,
  activeKey,
  onSelect,
  variant = "dark",
  currency = "GBP",
  height = 128,
}: {
  data: BarDatum[];
  activeKey?: string;
  onSelect?: (key: string) => void;
  variant?: "dark" | "light";
  currency?: string;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const isDark = variant === "dark";

  return (
    <div>
      <div className="flex items-end justify-between gap-2" style={{ height }}>
        {data.map((d) => {
          const active = d.key === activeKey;
          // Keep a visible stub for empty cycles so the axis still reads.
          const pct = Math.max((d.value / max) * 100, d.value > 0 ? 8 : 4);

          return (
            <button
              key={d.key}
              type="button"
              onClick={() => onSelect?.(d.key)}
              disabled={!onSelect}
              className="group flex h-full flex-1 flex-col justify-end disabled:cursor-default"
              aria-label={`${d.label}: ${compactMoney(d.value, currency)}`}
              aria-pressed={active}
            >
              <span
                className={`w-full rounded-lg transition-all duration-300 ${
                  active
                    ? "bg-coral"
                    : isDark
                      ? "bg-white/15 group-hover:bg-white/25"
                      : "bg-plum-100 group-hover:bg-plum-200"
                }`}
                style={{ height: `${pct}%` }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex justify-between gap-2">
        {data.map((d) => (
          <span
            key={d.key}
            className={`flex-1 text-center text-[11px] font-medium ${
              d.key === activeKey
                ? isDark
                  ? "text-white"
                  : "text-ink"
                : isDark
                  ? "text-white/45"
                  : "text-muted"
            }`}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
