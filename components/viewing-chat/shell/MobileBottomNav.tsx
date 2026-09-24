"use client";

import type { ReactNode } from "react";
import {
  Database,
  History,
  Plus,
  Search,
  UserRound,
} from "lucide-react";

export type MobileNavTabId = "new" | "history" | "search" | "media" | "account";

export type MobileNavLabels = {
  nav: string;
  new: string;
  history: string;
  search: string;
  media: string;
  account: string;
};

type TabDef = {
  id: MobileNavTabId;
  label: string;
  icon: ReactNode;
};

/**
 * Mobile primary navigation. Hidden from md and up (desktop uses IconRail).
 * Icon + short label; selected state uses a filled icon chip + underline.
 * Touch targets are at least 44px; bottom padding respects the home indicator.
 */
export function MobileBottomNav({
  labels,
  activeTab,
  onSelect,
  hidden,
  /** Tabs that stay visible but do not fire onSelect (aria explains why). */
  disabledTabs,
}: {
  labels: MobileNavLabels;
  activeTab: MobileNavTabId | null;
  onSelect: (tab: MobileNavTabId) => void;
  /** Hide while the soft keyboard is open, or in mobile chat focus mode. */
  hidden?: boolean;
  disabledTabs?: Partial<Record<MobileNavTabId, string>>;
}) {
  if (hidden) return null;

  const tabs: TabDef[] = [
    {
      id: "new",
      label: labels.new,
      icon: <Plus className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.25} aria-hidden />,
    },
    {
      id: "history",
      label: labels.history,
      icon: <History className="h-[1.15rem] w-[1.15rem]" strokeWidth={2} aria-hidden />,
    },
    {
      id: "search",
      label: labels.search,
      icon: <Search className="h-[1.15rem] w-[1.15rem]" strokeWidth={2} aria-hidden />,
    },
    {
      id: "media",
      label: labels.media,
      icon: <Database className="h-[1.15rem] w-[1.15rem]" strokeWidth={2} aria-hidden />,
    },
    {
      id: "account",
      label: labels.account,
      icon: <UserRound className="h-[1.15rem] w-[1.15rem]" strokeWidth={2} aria-hidden />,
    },
  ];

  return (
    <nav
      className="z-[var(--z-sticky)] flex shrink-0 border-t border-black/8 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom, 0px))" }}
      aria-label={labels.nav}
    >
      <ul className="flex w-full items-stretch justify-between gap-0 px-0.5 pt-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const disabledHint = disabledTabs?.[tab.id];
          const disabled = Boolean(disabledHint);
          return (
            <li key={tab.id} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onSelect(tab.id);
                }}
                aria-label={disabledHint ?? tab.label}
                aria-current={active ? "page" : undefined}
                aria-disabled={disabled || undefined}
                data-active={active ? "true" : undefined}
                title={disabledHint ?? tab.label}
                className={`relative flex min-h-[var(--touch-target)] w-full flex-col items-center justify-center gap-0.5 px-0.5 pb-1.5 pt-1 touch-manipulation disabled:cursor-default ${
                  active ? "text-[#111]" : "text-[#6B7280]"
                } ${disabled && !active ? "opacity-50" : ""}`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-black text-white" : "bg-transparent"
                  }`}
                >
                  {tab.icon}
                </span>
                <span
                  className={`max-w-full truncate px-0.5 text-center text-[10px] leading-none tracking-tight ${
                    active ? "font-bold text-[#111]" : "font-semibold text-[#6B7280]"
                  }`}
                >
                  {tab.label}
                </span>
                <span
                  aria-hidden
                  className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-opacity ${
                    active ? "bg-[#111] opacity-100" : "opacity-0"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
