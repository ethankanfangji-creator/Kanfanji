"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Shared secondary chip — outline / soft fill, not a saturated brand pill. */
export function QuickActionChip({
  children,
  className = "",
  accent = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** Optional 2px brand-blue accent bar (not a full fill). */
  accent?: boolean;
}) {
  return (
    <button
      {...props}
      type="button"
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 text-[12px] font-semibold leading-none text-[#1F2937] shadow-[0_1px_0_rgba(0,0,0,0.03)] transition-[transform,opacity] active:scale-[0.98] active:opacity-80 disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      {accent ? (
        <span
          className="h-3 w-0.5 shrink-0 rounded-full bg-[#2563EB]"
          aria-hidden
        />
      ) : null}
      <span className="max-w-[11rem] truncate whitespace-nowrap">{children}</span>
    </button>
  );
}

/** Single-row horizontal scroller — ~3 chips visible at ~390px. */
export function QuickActionRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}
