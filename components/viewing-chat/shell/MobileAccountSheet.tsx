"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LifeBuoy, LogIn, LogOut, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { resetSyncEngineSingleton } from "@/lib/sync";
import { setPersistenceAccountScope } from "@/lib/idb/draft-store";
import { buildSupportMailto } from "@/lib/i18n/support-mailto";

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

  useEffect(() => {
    if (!open) return;
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
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
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
          <div
            className="h-11 animate-pulse rounded-2xl bg-[#EFEAE4]"
            aria-label={messages.nav.loadingAccount}
            role="status"
          />
        ) : (
          <div className="space-y-2">
            <LanguageSwitcher className="w-full" />
            <a
              href={buildSupportMailto({
                locale,
                email: user?.email,
                copy: messages.nav,
              })}
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
