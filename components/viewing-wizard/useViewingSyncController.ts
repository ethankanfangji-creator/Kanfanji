"use client";

import { useCallback } from "react";
import { getSyncEngine } from "@/lib/sync";

export function useViewingSyncController({
  userId,
  isPro,
}: {
  userId: string | null;
  isPro: boolean;
}) {
  const getEngine = useCallback(
    (overrideUserId: string | null = userId) =>
      getSyncEngine({ userId: overrideUserId, isPro }),
    [isPro, userId],
  );
  return { getEngine };
}
