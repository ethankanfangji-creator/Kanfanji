"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ViewingChatApp } from "@/components/viewing-chat/ViewingChatApp";
import { createClient } from "@/utils/supabase/client";

export function ViewingChatIndex() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyThread = searchParams.get("thread");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!legacyThread) return;
    router.replace(`/viewings/${legacyThread}`);
  }, [legacyThread, router]);

  useEffect(() => {
    if (legacyThread) return;
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent("/")}`);
        return;
      }
      setReady(true);
    })();
  }, [legacyThread, router]);

  if (legacyThread) return null;
  if (!ready) return null;

  return <ViewingChatApp startOnly />;
}
