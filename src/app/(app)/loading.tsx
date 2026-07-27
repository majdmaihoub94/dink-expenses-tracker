import {
  CardSkeleton,
  CycleSwitcherSkeleton,
  HeroSkeleton,
  Skeleton,
  StatRowSkeleton,
} from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Skeleton className="h-3 w-12" />
          <Skeleton className="mt-2 h-7 w-32" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>

      <CycleSwitcherSkeleton />
      <HeroSkeleton />
      <StatRowSkeleton />

      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-[104px] rounded-[var(--radius-tile)]" />
        <Skeleton className="h-[104px] rounded-[var(--radius-tile)]" />
      </div>

      <CardSkeleton rows={3} />
    </div>
  );
}
