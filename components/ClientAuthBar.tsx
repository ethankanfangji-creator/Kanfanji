"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useI18n } from "@/components/I18nProvider";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { resetSyncEngineSingleton } from "@/lib/sync";
import { setPersistenceAccountScope } from "@/lib/idb/draft-store";

export function ClientAuthBar() {
  const { messages } = useI18n();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(() => !isSupabaseConfigured());

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    void supabase.auth.getUser()
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
    return <span className="h-8 w-16 rounded-full bg-[#EFEAE4] animate-pulse" />;
  }

  if (!isSupabaseConfigured()) {
    return (
      <span className="h-8 px-3 rounded-full bg-[#FEF2F2] border border-[#FECACA] text-[11px] font-bold text-[#991B1B] inline-flex items-center">
        缺 Supabase env
      </span>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="h-8 px-3 rounded-full bg-black text-white text-[11px] font-bold inline-flex items-center"
      >
        {messages.nav.signIn}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-[#6B7280] max-w-[110px] truncate">{user.email}</span>
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
        className="h-8 px-3 rounded-full bg-white border border-black/10 text-[11px] font-bold"
      >
        {messages.nav.signOut}
      </button>
    </div>
  );
}
