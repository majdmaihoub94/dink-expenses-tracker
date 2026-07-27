import { CycleSwitcherSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-7 w-28" />
      </div>

      <CycleSwitcherSkeleton />

      <div className="rounded-[var(--radius-card)] bg-gradient-to-br from-plum-800 to-plum-900 p-5">
        <div className="h-3 w-32 animate-pulse rounded bg-white/20" />
        <div className="mt-2 h-8 w-36 animate-pulse rounded bg-white/25" />
        <div className="mt-5 h-2 w-full animate-pulse rounded-full bg-white/15" />
      </div>

      <Skeleton className="h-12 rounded-2xl" />

      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[116px] rounded-[var(--radius-tile)]" />
        ))}
      </div>
    </div>
  );
}
