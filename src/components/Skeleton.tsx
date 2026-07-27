/**
 * Loading placeholders. These mirror the real layouts closely enough that the
 * page does not jump when the data lands.
 */

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`animate-pulse rounded-lg bg-plum-100/70 ${className}`} style={style} />;
}

export function HeroSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] bg-gradient-to-br from-plum-800 to-plum-900 p-5">
      <div className="h-3 w-16 animate-pulse rounded bg-white/20" />
      <div className="mt-2 h-8 w-40 animate-pulse rounded bg-white/25" />
      <div className="mt-2 h-3 w-32 animate-pulse rounded bg-white/15" />
      <div className="mt-6 flex items-end justify-between gap-2" style={{ height: 110 }}>
        {[45, 70, 55, 85, 60, 100].map((h, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-lg bg-white/15"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function StatRowSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="dinx-tile text-center">
          <Skeleton className="mx-auto h-3 w-12" />
          <Skeleton className="mx-auto mt-2 h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="dinx-card">
      <Skeleton className="h-4 w-28" />
      <div className="mt-4">
        <ListSkeleton rows={rows} />
      </div>
    </div>
  );
}

export function CycleSwitcherSkeleton() {
  return (
    <div className="flex items-center justify-between gap-2 rounded-full bg-card p-1.5">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="text-center">
        <Skeleton className="mx-auto h-3.5 w-24" />
        <Skeleton className="mx-auto mt-1.5 h-2.5 w-20" />
      </div>
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
    </div>
  );
}
