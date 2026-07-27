import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 pb-6">
      <Skeleton className="h-7 w-24" />

      <div className="dinx-card flex items-center gap-4">
        <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-3 w-40" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      </div>

      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-[var(--radius-tile)]" />
        ))}
      </div>
    </div>
  );
}
