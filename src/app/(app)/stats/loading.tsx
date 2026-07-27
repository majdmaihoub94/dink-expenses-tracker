import { CardSkeleton, CycleSwitcherSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 pb-6">
      <Skeleton className="h-7 w-20" />
      <CycleSwitcherSkeleton />
      <Skeleton className="h-11 rounded-full" />

      <div className="dinx-card">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 flex items-end justify-between gap-2" style={{ height: 120 }}>
          {[50, 75, 60, 90, 65, 100].map((height, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>

      <CardSkeleton rows={4} />
    </div>
  );
}
