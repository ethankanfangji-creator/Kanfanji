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
  /** Hide while the soft keyboard is open so it cannot cover the composer. */
  hidden?: boolean;
  disabledTabs?: Partial<Record<MobileNavTabId, string>>;
}) {
  if (hidden) return null;

  const tabs: TabDef[] = [
    {
      id: "new",
      label: labels.new,
      icon: <Plus className="h-5 w-5" strokeWidth={2.25} aria-hidden />,
    },
    {
      id: "history",
      label: labels.history,
      icon: <History className="h-5 w-5" strokeWidth={2} aria-hidden />,
    },
    {
      id: "search",
      label: labels.search,
      icon: <Search className="h-5 w-5" strokeWidth={2} aria-hidden />,
    },
    {
      id: "media",
      label: labels.media,
      icon: <Database className="h-5 w-5" strokeWidth={2} aria-hidden />,
    },
    {
      id: "account",
      label: labels.account,
      icon: <UserRound className="h-5 w-5" strokeWidth={2} aria-hidden />,
    },
  ];

  return (
    <nav
      className="z-[var(--z-sticky)] flex shrink-0 border-t border-black/8 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom, 0px))" }}
      aria-label={labels.nav}
    >
      <ul className="flex w-full items-stretch justify-between px-1 pt-1">
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
                title={disabledHint ?? tab.label}
                className={`flex min-h-[var(--touch-target)] w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 touch-manipulation disabled:cursor-default ${
                  active ? "text-[#111]" : "text-[#6B7280]"
                } ${disabled && !active ? "opacity-50" : ""}`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    active ? "bg-black text-white" : ""
                  }`}
                >
                  {tab.icon}
                </span>
                <span className="max-w-full truncate text-[10px] font-bold leading-tight">
                  {tab.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
