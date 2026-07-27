import { CardSkeleton, CycleSwitcherSkeleton, HeroSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 pb-6">
      <Skeleton className="h-7 w-28" />
      <CycleSwitcherSkeleton />
      <HeroSkeleton />
      <Skeleton className="h-[50px] rounded-2xl" />

      <div className="flex gap-2">
        {["w-16", "w-24", "w-20", "w-24"].map((width) => (
          <Skeleton key={width} className={`h-9 shrink-0 rounded-full ${width}`} />
        ))}
      </div>

      <CardSkeleton rows={6} />
    </div>
  );
}
