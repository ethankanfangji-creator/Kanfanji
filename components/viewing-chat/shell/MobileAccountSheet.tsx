"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LifeBuoy, LogIn, LogOut } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { AnalyticsToggle } from "@/components/analytics/AnalyticsToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { MobileSheet } from "@/components/viewing-chat/shell/MobileSheet";
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

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      title={user?.email || messages.nav.signIn}
      closeLabel={messages.chat.searchClose}
      ariaLabel={messages.nav.signIn}
    >
      <div className="space-y-2 px-4 py-3">
        {!ready ? (
          <div className="h-11 animate-pulse rounded-2xl bg-[#EFEAE4]" />
        ) : (
          <>
            <LanguageSwitcher className="w-full" />
            <AnalyticsToggle />
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
          </>
        )}
      </div>
    </MobileSheet>
  );
}
