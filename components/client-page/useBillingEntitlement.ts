"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { resolveProEntitlement } from "@/lib/billing-status";
import { getSupabase } from "@/lib/supabase";

export type BillingPaywallCopy = {
  processing: string;
  processingTimeout: string;
  syncSuccess: string;
  syncFailed: string;
  statusLine: string;
};

/**
 * Wizard billing entitlement: Pro comes only from server subscription status
 * (or `/api/billing/sync`). `?checkout=success` only starts polling + copy —
 * it never sets isPro locally.
 */
export function useBillingEntitlement(options: {
  user: User | null;
  paywall: BillingPaywallCopy;
  t: (template: string, vars: Record<string, string | number>) => string;
  onStatusMessage: (message: string) => void;
}) {
  const { user, paywall, t, onStatusMessage } = options;
  const [freeCount, setFreeCount] = useState(0);
  const [isPro, setIsPro] = useState(false);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [checkoutTimedOut, setCheckoutTimedOut] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingSyncLoading, setBillingSyncLoading] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;
    let timer: number | null = null;

    if (!supabase || !user) {
      queueMicrotask(() => {
        if (cancelled) return;
        setFreeCount(0);
        setIsPro(false);
        setHasStripeCustomer(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const awaitingCheckout =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("checkout") === "success";
    if (awaitingCheckout) {
      queueMicrotask(() => {
        if (cancelled) return;
        setShowPaywall(false);
        setCheckoutTimedOut(false);
        onStatusMessage(paywall.processing);
      });
    }

    const loadEntitlement = async () => {
      const [{ count }, { data: sub }] = await Promise.all([
        supabase
          .from("viewings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("subscriptions")
          .select("status, plan, stripe_customer_id, manual_pro_until")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return false;
      setFreeCount(count ?? 0);
      setHasStripeCustomer(Boolean(sub?.stripe_customer_id));
      const pro = resolveProEntitlement({
        status: sub?.status,
        manual_pro_until: sub?.manual_pro_until,
      });
      setIsPro(pro);
      if (awaitingCheckout && pro) {
        onStatusMessage(paywall.syncSuccess);
        setCheckoutTimedOut(false);
      }
      return pro;
    };

    void (async () => {
      const pro = await loadEntitlement();
      if (cancelled || pro || !awaitingCheckout) return;
      let attempts = 0;
      const tick = async () => {
        const nextPro = await loadEntitlement();
        if (cancelled || nextPro) return;
        attempts += 1;
        if (attempts < 7) {
          timer = window.setTimeout(() => void tick(), 1500);
        } else {
          setCheckoutTimedOut(true);
          onStatusMessage(paywall.processingTimeout);
        }
      };
      timer = window.setTimeout(() => void tick(), 1500);
    })();

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [
    user,
    paywall.processing,
    paywall.processingTimeout,
    paywall.syncSuccess,
    onStatusMessage,
  ]);

  const startCheckout = useCallback(async () => {
    setCheckoutLoading(true);
    onStatusMessage("");
    try {
      const response = await fetch("/api/create-checkout-session", { method: "POST" });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "無法開啟 Stripe Checkout");
      }
      window.location.href = payload.url;
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : "Checkout 失敗");
      setCheckoutLoading(false);
    }
  }, [onStatusMessage]);

  const openBillingPortal = useCallback(async () => {
    setPortalLoading(true);
    onStatusMessage("");
    try {
      const response = await fetch("/api/create-portal-session", { method: "POST" });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "無法開啟訂閱管理");
      }
      window.location.href = payload.url;
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : "Portal 失敗");
      setPortalLoading(false);
    }
  }, [onStatusMessage]);

  const resyncBilling = useCallback(async () => {
    setBillingSyncLoading(true);
    onStatusMessage("");
    try {
      const response = await fetch("/api/billing/sync", { method: "POST" });
      const payload = (await response.json()) as {
        status?: string;
        isPro?: boolean;
        plan?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || paywall.syncFailed);
      }
      const nextPro = Boolean(payload.isPro);
      setIsPro(nextPro);
      setHasStripeCustomer(true);
      setCheckoutTimedOut(false);
      onStatusMessage(
        nextPro
          ? paywall.syncSuccess
          : t(paywall.statusLine, { status: payload.status ?? "inactive" }),
      );
      if (nextPro) setShowPaywall(false);
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : paywall.syncFailed);
    } finally {
      setBillingSyncLoading(false);
    }
  }, [onStatusMessage, paywall, t]);

  /** After login, refresh Pro from subscriptions row (server truth). */
  const applyServerEntitlement = useCallback(
    (input: {
      freeCount: number;
      status?: string | null;
      manualProUntil?: string | null;
      stripeCustomerId?: string | null;
    }) => {
      setFreeCount(input.freeCount);
      setHasStripeCustomer(Boolean(input.stripeCustomerId));
      setIsPro(
        resolveProEntitlement({
          status: input.status,
          manual_pro_until: input.manualProUntil,
        }),
      );
    },
    [],
  );

  return {
    freeCount,
    setFreeCount,
    isPro,
    setIsPro,
    hasStripeCustomer,
    checkoutTimedOut,
    checkoutLoading,
    portalLoading,
    billingSyncLoading,
    showPaywall,
    setShowPaywall,
    startCheckout,
    openBillingPortal,
    resyncBilling,
    applyServerEntitlement,
  };
}
