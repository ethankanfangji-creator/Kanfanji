"use client";

import Link from "next/link";
import { List } from "lucide-react";
import { ClientAuthBar } from "@/components/ClientAuthBar";
import {
  shouldShowBillingManageRow,
  shouldShowFreeQuota,
  shouldShowManagePortalButton,
  shouldShowProBadge,
  shouldShowResyncButton,
} from "@/lib/billing-ui";
import { FREE_VIEWING_LIMIT } from "@/lib/viewing-wizard/free-tier";

export type WizardHeaderBillingCopy = {
  brandName: string;
  brandSubtitle: string;
  freeQuota: string;
  manage: string;
  manageLoading: string;
  sync: string;
  syncLoading: string;
  records: string;
  loggedIn: string;
  guest: string;
  noKeys: string;
};

export function WizardHeaderBilling({
  copy,
  t,
  user,
  isPro,
  freeCount,
  hasStripeCustomer,
  checkoutTimedOut,
  portalLoading,
  billingSyncLoading,
  configured,
  onOpenPortal,
  onResync,
}: {
  copy: WizardHeaderBillingCopy;
  t: (template: string, vars: Record<string, string | number>) => string;
  user: { id: string } | null;
  isPro: boolean;
  freeCount: number;
  hasStripeCustomer: boolean;
  checkoutTimedOut: boolean;
  portalLoading: boolean;
  billingSyncLoading: boolean;
  configured: boolean;
  onOpenPortal: () => void;
  onResync: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 mb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[20px] font-[800] tracking-tight leading-[1.1] flex flex-wrap items-center gap-2">
          <span>
            {copy.brandName}
            <br />
            <span className="text-[11px] font-[700] tracking-[0.18em] opacity-60">
              {copy.brandSubtitle}
            </span>
          </span>
          {shouldShowProBadge(isPro) && (
            <span className="px-2 py-0.5 rounded-full bg-[#111] text-white text-[10px] font-bold tracking-wide align-middle">
              PRO
            </span>
          )}
        </h1>
        {shouldShowFreeQuota({ user, isPro }) && (
          <p className="mt-1.5 text-[11px] text-[#6B7280]">
            {t(copy.freeQuota, {
              used: Math.min(freeCount, FREE_VIEWING_LIMIT),
              limit: FREE_VIEWING_LIMIT,
            })}
          </p>
        )}
        {shouldShowBillingManageRow({ user, hasStripeCustomer, checkoutTimedOut }) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {shouldShowManagePortalButton({ hasStripeCustomer }) && (
              <button
                type="button"
                onClick={onOpenPortal}
                disabled={portalLoading}
                className="h-7 px-2.5 rounded-full bg-white border border-black/10 text-[10px] font-bold disabled:opacity-60"
              >
                {portalLoading ? copy.manageLoading : copy.manage}
              </button>
            )}
            {shouldShowResyncButton({
              hasStripeCustomer,
              checkoutTimedOut,
              isPro,
            }) && (
              <button
                type="button"
                onClick={onResync}
                disabled={billingSyncLoading}
                className="h-7 px-2.5 rounded-full bg-white border border-black/10 text-[10px] font-bold disabled:opacity-60"
              >
                {billingSyncLoading ? copy.syncLoading : copy.sync}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end sm:mt-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/viewings"
            className="min-h-11 px-3 rounded-full bg-white border border-black/10 text-[12px] font-bold text-[#1A1A1A] inline-flex items-center gap-1.5"
          >
            <List className="w-3.5 h-3.5" /> {copy.records}
          </Link>
          <ClientAuthBar />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
          <span className="text-[11px] font-medium text-[#6B7280] tracking-wide">
            {configured ? (user ? copy.loggedIn : copy.guest) : copy.noKeys}
          </span>
        </div>
      </div>
    </div>
  );
}
