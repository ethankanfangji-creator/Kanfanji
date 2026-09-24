"use client";

import { X } from "lucide-react";

/** Shared sheet / overlay close control — 44×44 hit target, 20px icon. */
export function SheetCloseButton({
  label,
  onClick,
  className = "",
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#4B5563] hover:bg-black/5 active:bg-black/8 ${className}`}
      aria-label={label}
    >
      <X className="h-5 w-5" strokeWidth={2} aria-hidden />
    </button>
  );
}
