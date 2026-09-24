"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useI18n } from "@/components/I18nProvider";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { resetSyncEngineSingleton } from "@/lib/sync";
import { setPersistenceAccountScope } from "@/lib/idb/draft-store";

/**
 * Auth actions only — language lives inside the login UI (/login + LoginGateDialog).
 */
export function ClientAuthBar() {
  const { messages } = useI18n();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(() => !isSupabaseConfigured());

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    void supabase.auth
      .getUser()
      .then(({ data }) => setUser(data.user))
      .catch(() => {
        setPersistenceAccountScope(null);
        setUser(null);
      })
      .finally(() => setReady(true));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <span
        className="h-11 w-16 animate-pulse rounded-full bg-[#EFEAE4]"
        role="status"
        aria-label={messages.nav.loadingAccount}
      />
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <span className="inline-flex min-h-11 items-center rounded-full border border-[#FECACA] bg-[#FEF2F2] px-3 text-[12px] font-bold text-[#991B1B]">
        缺 Supabase env
      </span>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center rounded-full bg-black px-4 text-[12px] font-bold text-white"
      >
        {messages.nav.signIn}
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="max-w-[110px] truncate text-[11px] text-[#6B7280]">
        {user.email}
      </span>
      <button
        type="button"
        onClick={() => {
          const supabase = getSupabase();
          void supabase?.auth.signOut().then(() => {
            resetSyncEngineSingleton();
            setPersistenceAccountScope(null);
            router.replace("/login");
          });
        }}
        className="min-h-11 rounded-full border border-black/10 bg-white px-3 text-[12px] font-bold"
      >
        {messages.nav.signOut}
      </button>
    </div>
  );
}
