"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useI18n } from "@/components/I18nProvider";
import { createClient } from "@/utils/supabase/client";

export function ClientAuthBar() {
  const { messages } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });

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
          const supabase = createClient();
          void supabase.auth.signOut().then(() => {
            window.location.href = "/login";
          });
        }}
        className="h-8 px-3 rounded-full bg-white border border-black/10 text-[11px] font-bold"
      >
        {messages.nav.signOut}
      </button>
    </div>
  );
}
