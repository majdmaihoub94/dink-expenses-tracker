"use client";

import { useEffect } from "react";

/** Bottom sheet — the app's one modal pattern, thumb-reachable on mobile. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Stop the page behind the sheet from scrolling with it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-plum-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-card px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="sticky top-0 -mx-5 mb-2 bg-card px-5 pt-1 pb-3">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
          {title && <h2 className="text-lg font-semibold text-ink">{title}</h2>}
        </div>
        {children}
      </div>
    </div>
  );
}
