"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Info, LifeBuoy, LogIn, LogOut, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { formatMessage } from "@/lib/i18n";
import {
  FREE_VIEWING_LIMIT,
  GUEST_LOCAL_VIEWING_LIMIT,
} from "@/lib/viewing-wizard/free-tier";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { resetSyncEngineSingleton } from "@/lib/sync";
import { setPersistenceAccountScope } from "@/lib/idb/draft-store";

function supportMailto(locale: string, email?: string | null): string {
  const to =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@kanfangji.app";
  const subject = encodeURIComponent(`[Kanfangji] Support (${locale})`);
  const body = encodeURIComponent(
    [
      email ? `Account: ${email}` : "Account: guest",
      `Locale: ${locale}`,
      "",
      "Please describe the issue:",
      "",
    ].join("\n"),
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

/** Mobile account sheet opened from the bottom tab. */
export function MobileAccountSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { messages, locale } = useI18n();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(() => !isSupabaseConfigured());
  const [guestPlanOpen, setGuestPlanOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setGuestPlanOpen(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const guestPlanBody = formatMessage(messages.chat.guestPlanBody, {
    guestLimit: GUEST_LOCAL_VIEWING_LIMIT,
    freeLimit: FREE_VIEWING_LIMIT,
  });

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={messages.nav.signIn}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label={messages.chat.searchClose}
        onClick={onClose}
      />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-[24px] border border-black/8 bg-white p-4 shadow-2xl"
        style={{ paddingBottom: "max(1rem, var(--mobile-nav-safe-bottom))" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[15px] font-bold">
            {user?.email || messages.nav.signIn}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full text-[#4B5563]"
            aria-label={messages.chat.searchClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!ready ? (
          <div className="h-11 animate-pulse rounded-2xl bg-[#EFEAE4]" />
        ) : (
          <div className="space-y-2">
            <LanguageSwitcher className="w-full" />

            {!user ? (
              <div className="rounded-2xl border border-black/8 bg-[#FAF6F1] p-3">
                <button
                  type="button"
                  onClick={() => setGuestPlanOpen((v) => !v)}
                  className="flex w-full items-start gap-2 text-left"
                  aria-expanded={guestPlanOpen}
                >
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4ED8]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-[#1A1A1A]">
                      {messages.chat.guestPlanTitle}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-semibold text-[#1D4ED8]">
                      {messages.chat.guestPlanCta}
                    </span>
                  </span>
                </button>
                {guestPlanOpen ? (
                  <div className="mt-2 space-y-2 border-t border-black/8 pt-2">
                    <p className="text-[12px] leading-snug text-[#4B5563]">
                      {guestPlanBody}
                    </p>
                    <p className="text-[11px] leading-snug text-[#6B7280]">
                      {messages.paywall.body}
                    </p>
                    <Link
                      href="/login"
                      onClick={onClose}
                      className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-2xl bg-black px-3 text-[13px] font-bold text-white"
                    >
                      {messages.nav.signIn}
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            <a
              href={supportMailto(locale, user?.email)}
              onClick={onClose}
              className="flex min-h-[var(--touch-target)] w-full items-center gap-2 rounded-2xl px-3 text-left text-[13px] font-bold hover:bg-[#FAF6F1]"
            >
              <LifeBuoy className="h-4 w-4 shrink-0" />
              {messages.nav.contactSupport}
            </a>
            {user ? (
              <button
                type="button"
                onClick={() => {
                  const supabase = getSupabase();
                  void supabase?.auth.signOut().then(() => {
                    resetSyncEngineSingleton();
                    setPersistenceAccountScope(null);
                    onClose();
                    router.replace("/login");
                  });
                }}
                className="flex min-h-[var(--touch-target)] w-full items-center gap-2 rounded-2xl px-3 text-left text-[13px] font-bold hover:bg-[#FAF6F1]"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {messages.nav.signOut}
              </button>
            ) : (
              <Link
                href="/login"
                onClick={onClose}
                className="flex min-h-[var(--touch-target)] w-full items-center gap-2 rounded-2xl px-3 text-left text-[13px] font-bold hover:bg-[#FAF6F1]"
              >
                <LogIn className="h-4 w-4 shrink-0" />
                {messages.nav.signIn}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
