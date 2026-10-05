"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ViewingChatApp } from "@/components/viewing-chat/ViewingChatApp";
import { createClient } from "@/utils/supabase/client";

/**
 * Home shell: guests may use a local viewing; signed-in users claim/pull cloud.
 * Legacy `?thread=` deep links still bounce into `/viewings/[id]`.
 */
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
      // Warm auth; do not block guests when signed out.
      try {
        await supabase.auth.getUser();
      } catch {
        // ignore — guest shell still loads
      }
      setReady(true);
    })();
  }, [legacyThread]);

  if (legacyThread) return null;
  if (!ready) return null;

  return <ViewingChatApp startOnly />;
}
