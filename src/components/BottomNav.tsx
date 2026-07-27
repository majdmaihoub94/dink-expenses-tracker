"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Discover", icon: CompassIcon },
  { href: "/transactions", label: "Receipts", icon: ReceiptIcon },
  { href: "/stats", label: "Stats", icon: StatsIcon },
  { href: "/profile", label: "Profile", icon: PersonIcon },
] as const;

export function BottomNav({ onAdd }: { onAdd: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // The FAB sits between items 2 and 3, so the list is split in half.
  const left = ITEMS.slice(0, 2);
  const right = ITEMS.slice(2);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="relative mx-auto max-w-lg">
        <div className="safe-bottom flex items-stretch justify-between rounded-t-[1.75rem] bg-card px-2 pt-2 shadow-[0_-8px_30px_-16px_rgba(58,42,79,0.35)]">
          {left.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} />
          ))}

          {/* Spacer holding the FAB's footprint. */}
          <div className="w-16 shrink-0" aria-hidden />

          {right.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </div>

        <button
          type="button"
          onClick={onAdd}
          aria-label="Add a transaction"
          className="dinx-tap absolute -top-6 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-coral text-white shadow-[0_10px_24px_-6px_rgba(240,114,74,0.65)] ring-4 ring-page"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 transition-colors ${
        active ? "text-plum-600" : "text-muted"
      }`}
    >
      <Icon className="h-[22px] w-[22px]" />
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}

function CompassIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="m15.2 8.8-2 4.4-4.4 2 2-4.4z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ReceiptIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
      <path d="M9.5 8h5M9.5 12h5" strokeLinecap="round" />
    </svg>
  );
}

function StatsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M5 20V12M12 20V5M19 20v-6" />
    </svg>
  );
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </svg>
  );
}
