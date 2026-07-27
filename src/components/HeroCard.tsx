"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { BarChart, type BarDatum } from "@/components/BarChart";
import { moneyParts } from "@/lib/format";

/**
 * The deep plum card at the top of the dashboard: headline total, a six-cycle
 * bar chart, and taps on the chart to jump between budget months.
 */
export function HeroCard({
  title,
  amount,
  currency,
  rangeLabel,
  cycleLabel,
  trend,
  activeKey,
  basePath = "/",
}: {
  title: string;
  amount: number;
  currency: string;
  rangeLabel: string;
  cycleLabel: string;
  trend: BarDatum[];
  activeKey: string;
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { symbol, whole, pence } = moneyParts(amount, currency);

  const goTo = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cycle", key);
    router.push(`${basePath}?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-plum-800 to-plum-900 p-5 text-white shadow-[0_18px_40px_-20px_rgba(44,30,62,0.9)]">
      {/* Soft highlight, echoing the circle in the reference card. */}
      <span
        className="pointer-events-none absolute -top-10 -right-8 h-32 w-32 rounded-full bg-plum-500/30 blur-xl"
        aria-hidden
      />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-white/60 uppercase">{title}</p>
          <p className="mt-1 flex items-baseline gap-0.5">
            <span className="text-lg font-medium text-white/80">{symbol}</span>
            <span className="text-[2rem] leading-none font-semibold">{whole}</span>
            <span className="text-lg font-medium text-white/80">.{pence}</span>
          </p>
          <p className="mt-1 text-xs text-white/55">
            {cycleLabel} · {rangeLabel}
          </p>
        </div>
      </div>

      <div className="relative mt-5">
        <BarChart
          data={trend}
          activeKey={activeKey}
          onSelect={goTo}
          variant="dark"
          currency={currency}
          height={110}
        />
      </div>
    </section>
  );
}
