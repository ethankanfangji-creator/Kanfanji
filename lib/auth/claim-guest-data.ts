import { claimCanonicalGuestData } from "@/lib/idb/draft-store";
import { claimGuestDrafts } from "@/lib/sync";

export type GuestClaimResult = {
  draftRows: number;
  canonicalClaimCompleted: true;
};

/**
 * Claims both persistence generations in a fixed order. The legacy active
 * draft remains intact until its own copy/verification transaction succeeds.
 */
export async function claimGuestViewingData(userId: string): Promise<GuestClaimResult> {
  if (!userId.trim()) throw new Error("userId is required");
  const draftRows = await claimGuestDrafts(userId);
  await claimCanonicalGuestData(userId);
  return {
    draftRows,
    canonicalClaimCompleted: true,
  };
}
