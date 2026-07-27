import {
  addMonths,
  differenceInCalendarDays,
  format,
  parseISO,
  subDays,
  subMonths,
} from "date-fns";

/**
 * DINX budget months do not follow the calendar. They run from `startDay` of
 * one month to the day before `startDay` of the next — by default the 25th,
 * matching a 25th-of-the-month payday.
 */
export type Cycle = {
  /** First day of the cycle, e.g. 2026-07-25. Also its stable identifier. */
  start: Date;
  /** Last day of the cycle, inclusive, e.g. 2026-08-24. */
  end: Date;
  /** `yyyy-MM-dd` of `start` — what we persist and put in URLs. */
  key: string;
  /** "August 2026" */
  label: string;
  /** "Aug" — for chart axes. */
  shortLabel: string;
  /** "25 Jul – 24 Aug" */
  rangeLabel: string;
};

export type CycleLabelMode = "start" | "end";

export const DEFAULT_CYCLE_START_DAY = 25;

function atMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Builds a Date for `startDay` of the month containing `reference`. */
function anchorFor(reference: Date, startDay: number): Date {
  const d = atMidnight(reference);
  d.setDate(1);
  // Clamp so a 31st start day still works in February. `cycle_start_day` is
  // capped at 28 in the schema, but the clamp keeps this safe standalone.
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(startDay, daysInMonth));
  return d;
}

function describe(start: Date, labelMode: CycleLabelMode): Cycle {
  const end = subDays(addMonths(start, 1), 1);
  const labelSource = labelMode === "end" ? end : start;
  return {
    start,
    end,
    key: format(start, "yyyy-MM-dd"),
    label: format(labelSource, "MMMM yyyy"),
    shortLabel: format(labelSource, "MMM"),
    rangeLabel: `${format(start, "d MMM")} – ${format(end, "d MMM")}`,
  };
}

/** The cycle that contains `date`. */
export function cycleFor(
  date: Date | string = new Date(),
  startDay: number = DEFAULT_CYCLE_START_DAY,
  labelMode: CycleLabelMode = "end",
): Cycle {
  const d = atMidnight(typeof date === "string" ? parseISO(date) : date);
  let start = anchorFor(d, startDay);
  // Before the 25th we are still spending last month's cycle.
  if (d < start) start = anchorFor(subMonths(d, 1), startDay);
  return describe(start, labelMode);
}

/** Steps `offset` cycles forward (positive) or back (negative). */
export function shiftCycle(cycle: Cycle, offset: number, labelMode: CycleLabelMode = "end"): Cycle {
  return describe(atMidnight(addMonths(cycle.start, offset)), labelMode);
}

/** Rebuilds a cycle from the `yyyy-MM-dd` key used in URLs. */
export function cycleFromKey(
  key: string,
  startDay: number = DEFAULT_CYCLE_START_DAY,
  labelMode: CycleLabelMode = "end",
): Cycle {
  return cycleFor(parseISO(key), startDay, labelMode);
}

/**
 * The `count` cycles ending at `current`, oldest first — the shape the
 * dashboard bar chart wants.
 */
export function recentCycles(
  current: Cycle,
  count: number,
  labelMode: CycleLabelMode = "end",
): Cycle[] {
  return Array.from({ length: count }, (_, i) =>
    shiftCycle(current, i - (count - 1), labelMode),
  );
}

/** Inclusive `[start, end]` as `yyyy-MM-dd`, ready for a Postgres range query. */
export function cycleBounds(cycle: Cycle): { from: string; to: string } {
  return { from: format(cycle.start, "yyyy-MM-dd"), to: format(cycle.end, "yyyy-MM-dd") };
}

export function isCurrentCycle(cycle: Cycle, startDay: number = DEFAULT_CYCLE_START_DAY): boolean {
  return cycle.key === cycleFor(new Date(), startDay).key;
}

/** Days left in the cycle, floored at 0 for cycles already in the past. */
export function daysRemaining(cycle: Cycle, from: Date = new Date()): number {
  return Math.max(0, differenceInCalendarDays(cycle.end, atMidnight(from)) + 1);
}

/** How far through the cycle we are, 0–1. Used to pace-check spending. */
export function cycleProgress(cycle: Cycle, from: Date = new Date()): number {
  const total = differenceInCalendarDays(cycle.end, cycle.start) + 1;
  const elapsed = differenceInCalendarDays(atMidnight(from), cycle.start) + 1;
  return Math.min(1, Math.max(0, elapsed / total));
}
