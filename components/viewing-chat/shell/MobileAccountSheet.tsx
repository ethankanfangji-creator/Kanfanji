"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LifeBuoy, List, LogIn, LogOut, Share2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { AnalyticsToggle } from "@/components/analytics/AnalyticsToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { useI18n } from "@/components/I18nProvider";
import { MobileSheet } from "@/components/viewing-chat/shell/MobileSheet";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { signOutAndClearLocal } from "@/lib/auth/sign-out-client";

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

function RowLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex min-h-[var(--touch-target)] w-full items-center gap-2.5 rounded-2xl px-3 text-left text-[14px] font-bold text-[#111] hover:bg-[#FAF6F1] active:bg-[#F3EEE7]"
    >
      {children}
    </Link>
  );
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
      <div className="space-y-4 px-4 py-3">
        {!ready ? (
          <div className="h-11 animate-pulse rounded-2xl bg-[#EFEAE4]" />
        ) : (
          <>
            {!user ? (
              <Link
                href="/login"
                onClick={onClose}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-black px-4 text-[14px] font-bold text-white active:scale-[0.99]"
              >
                <LogIn className="h-4 w-4" aria-hidden />
                {messages.nav.signIn}
              </Link>
            ) : null}

            <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-[#FAF6F1]/60">
              <RowLink href="/viewings" onClick={onClose}>
                <List className="h-4 w-4 shrink-0 text-[#6B7280]" aria-hidden />
                {messages.viewings.navLabel}
              </RowLink>
              <div className="mx-3 border-t border-black/[0.05]" />
              <RowLink href="/shares" onClick={onClose}>
                <Share2 className="h-4 w-4 shrink-0 text-[#6B7280]" aria-hidden />
                {messages.nav.sharesHub}
              </RowLink>
              {user ? (
                <>
                  <div className="mx-3 border-t border-black/[0.05]" />
                  <div className="px-0">
                    <NotificationsBell expanded rail={false} />
                  </div>
                </>
              ) : null}
            </section>

            <section className="space-y-2">
              <LanguageSwitcher className="w-full" />
              <AnalyticsToggle />
              <a
                href={supportMailto(locale, user?.email)}
                onClick={onClose}
                className="flex min-h-[var(--touch-target)] w-full items-center gap-2.5 rounded-2xl px-3 text-left text-[14px] font-bold text-[#111] hover:bg-[#FAF6F1]"
              >
                <LifeBuoy className="h-4 w-4 shrink-0 text-[#6B7280]" aria-hidden />
                {messages.nav.contactSupport}
              </a>
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    void signOutAndClearLocal().then((ok) => {
                      if (!ok) return;
                      onClose();
                      router.replace("/login");
                    });
                  }}
                  className="flex min-h-[var(--touch-target)] w-full items-center gap-2.5 rounded-2xl px-3 text-left text-[14px] font-bold text-[#991B1B] hover:bg-[#FEF2F2]"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                  {messages.nav.signOut}
                </button>
              ) : null}
            </section>
          </>
        )}
      </div>
    </MobileSheet>
  );
}
