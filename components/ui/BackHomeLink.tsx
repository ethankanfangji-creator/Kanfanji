"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const BACK_HOME_CLASS =
  "inline-flex min-h-[var(--touch-target)] items-center gap-1 text-[12px] font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]";

/**
 * Shared ← 回首頁 control for page headers (viewings, session, ask, shares, …).
 */
export function BackHomeLink({
  label,
  href = "/",
  className = "",
  onClick,
}: {
  label: string;
  href?: string;
  className?: string;
  /** Prefer for in-app back that is not a plain Link navigation. */
  onClick?: () => void;
}) {
  const classes = `${BACK_HOME_CLASS} ${className}`.trim();
  const content = (
    <>
      <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }

  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
