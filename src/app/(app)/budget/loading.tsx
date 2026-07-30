import { CardSkeleton, HeroSkeleton, Skeleton, StatRowSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-20" />
      </div>

      <Skeleton className="h-11 rounded-full" />

      <HeroSkeleton />

      <StatRowSkeleton />

      <CardSkeleton rows={4} />
    </div>
  );
}
