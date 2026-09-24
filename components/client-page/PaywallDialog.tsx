"use client";

import { X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import {
  shouldShowManagePortalButton,
  shouldShowPaywallResyncButton,
} from "@/lib/billing-ui";

export type PaywallDialogCopy = {
  title: string;
  body: string;
  close: string;
  perMonth: string;
  feature1: string;
  feature2: string;
  feature3: string;
  loading: string;
  cta: string;
  manage: string;
  manageLoading: string;
  sync: string;
  syncLoading: string;
  footer: string;
};

export function PaywallDialog({
  open,
  copy,
  hasStripeCustomer,
  checkoutTimedOut,
  checkoutLoading,
  portalLoading,
  billingSyncLoading,
  onClose,
  onCheckout,
  onOpenPortal,
  onResync,
}: {
  open: boolean;
  copy: PaywallDialogCopy;
  hasStripeCustomer: boolean;
  checkoutTimedOut: boolean;
  checkoutLoading: boolean;
  portalLoading: boolean;
  billingSyncLoading: boolean;
  onClose: () => void;
  onCheckout: () => void;
  onOpenPortal: () => void;
  onResync: () => void;
}) {
  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.title}
      description={copy.body}
      backdropClassName="z-50 backdrop-blur-[2px] overflow-auto"
      className="relative"
    >
      <button
        type="button"
        aria-label={copy.close}
        onClick={onClose}
        className="absolute right-4 top-4 min-w-11 min-h-11 rounded-full bg-[#F5F3F0] flex items-center justify-center"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="mt-4 rounded-[18px] bg-[#111] text-white p-4">
        <p className="text-[11px] tracking-[0.16em] opacity-60">KANFANGJI PRO</p>
        <p className="text-[28px] font-[800] mt-1">
          $6.99
          <span className="text-[13px] font-medium opacity-70"> {copy.perMonth}</span>
        </p>
        <ul className="mt-3 space-y-1.5 text-[12px] opacity-90">
          <li>{copy.feature1}</li>
          <li>{copy.feature2}</li>
          <li>{copy.feature3}</li>
        </ul>
      </div>

      <button
        type="button"
        onClick={onCheckout}
        disabled={checkoutLoading}
        className="mt-4 w-full h-[48px] rounded-full bg-black text-white text-[14px] font-bold disabled:opacity-60"
      >
        {checkoutLoading ? copy.loading : copy.cta}
      </button>
      {shouldShowManagePortalButton({ hasStripeCustomer }) && (
        <button
          type="button"
          onClick={onOpenPortal}
          disabled={portalLoading}
          className="mt-2 w-full h-[44px] rounded-full bg-white border border-black/10 text-[13px] font-bold disabled:opacity-60"
        >
          {portalLoading ? copy.manageLoading : copy.manage}
        </button>
      )}
      {shouldShowPaywallResyncButton({ hasStripeCustomer, checkoutTimedOut }) && (
        <button
          type="button"
          onClick={onResync}
          disabled={billingSyncLoading}
          className="mt-2 w-full h-[44px] rounded-full bg-white border border-black/10 text-[13px] font-bold disabled:opacity-60"
        >
          {billingSyncLoading ? copy.syncLoading : copy.sync}
        </button>
      )}
      <p className="mt-3 text-[11px] text-[#9CA3AF] text-center">{copy.footer}</p>
    </Dialog>
  );
}
