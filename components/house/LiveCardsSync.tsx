"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveCards, type LiveCard } from "@/components/house/LiveCards";
import { applyViewingCardChange, type ViewingCardChange } from "@/lib/live-card-sync";
import { createClient } from "@/utils/supabase/client";

export function LiveCardsSync({
  viewingId,
  address,
  code,
  cards,
}: {
  viewingId: string;
  address: string;
  code: string;
  cards: LiveCard[];
}) {
  const router = useRouter();
  const [liveCards, setLiveCards] = useState(cards);

  useEffect(() => {
    setLiveCards(cards);
  }, [cards]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`viewing-cards:${viewingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "viewing_cards",
          filter: `viewing_id=eq.${viewingId}`,
        },
        (payload) => {
          const row = (payload.new ?? {}) as ViewingCardChange;
          setLiveCards((current) => applyViewingCardChange(current, row));
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, viewingId]);

  return <LiveCards address={address} code={code} cards={liveCards} />;
}
