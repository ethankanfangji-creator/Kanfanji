"use client";

import type { ReactNode } from "react";
import { BackHomeLink } from "@/components/ui/BackHomeLink";

/**
 * Shared top chrome for browse surfaces (viewings, shares) and compact chat
 * shells (Ask). Same hierarchy: ← Home · brand eyebrow · title · optional subtitle · actions.
 */
export function BrowsePageHeader({
  backLabel,
  title,
  subtitle,
  eyebrow = "KANFANGJI",
  actions,
  className = "",
  compact = false,
}: {
  backLabel: string;
  title: string;
  subtitle?: string | null;
  /** Brand mark above the title. Pass null to hide. Default: KANFANGJI. */
  eyebrow?: string | null;
  actions?: ReactNode;
  className?: string;
  /** Sticky chat bar: single row, slightly smaller type. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`.trim()}>
        <BackHomeLink label={backLabel} className="shrink-0" />
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="truncate text-[10px] font-bold tracking-[0.16em] text-[#9CA3AF]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="truncate text-[17px] font-bold tracking-tight text-[#1A1A1A]">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-[12px] text-[#6B7280]">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
    );
  }

  return (
    <div className={`mb-5 flex items-start justify-between gap-3 ${className}`.trim()}>
      <div className="min-w-0">
        <BackHomeLink label={backLabel} className="mb-2" />
        {eyebrow ? (
          <p className="text-[11px] font-bold tracking-[0.16em] text-[#9CA3AF]">{eyebrow}</p>
        ) : null}
        <h1
          className={`text-[22px] font-[800] leading-[1.15] tracking-tight text-[#1A1A1A] ${
            eyebrow ? "mt-1" : ""
          }`}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#6B7280]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="mt-1.5 shrink-0">{actions}</div> : null}
    </div>
  );
}
