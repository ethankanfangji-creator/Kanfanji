import { notFound, redirect } from "next/navigation";
import { LiveCardsSync } from "@/components/house/LiveCardsSync";
import type { LiveCard } from "@/components/house/LiveCards";
import { isLiveCode } from "@/lib/viewing-session-code";
import { MEDIA_SIGNED_TTL_SECONDS, absoluteStorageSignedUrl } from "@/lib/media-sign";
import { MEDIA_BUCKET } from "@/lib/supabase";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

type RawLiveCard = LiveCard & { photos?: unknown };

function photoPaths(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  return photos.filter((item): item is string => typeof item === "string" && !item.startsWith("http"));
}

async function withPhotoUrls(cards: RawLiveCard[]): Promise<LiveCard[]> {
  const paths = cards.flatMap((card) => photoPaths(card.photos));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const admin = createAdminClient();
    const result = await admin.storage.from(MEDIA_BUCKET).createSignedUrls(paths, MEDIA_SIGNED_TTL_SECONDS);
    result.data?.forEach((row, index) => {
      const raw = row.signedUrl || ("signedURL" in row ? String(row.signedURL) : "");
      const url = absoluteStorageSignedUrl(raw);
      if (url) signed.set(paths[index], url);
    });
  }
  return cards.map((card) => {
    const pathsForCard = photoPaths(card.photos);
    return {
      ...card,
      photoCount: pathsForCard.length,
      photoUrls: pathsForCard.map((path) => signed.get(path)).filter((url): url is string => Boolean(url)),
    };
  });
}

export default async function LiveViewingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isLiveCode(code)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/live/${code}`)}`);

  const { data, error } = await supabase.rpc("read_live_viewing", { p_code: code });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") notFound();

  const payload = data as {
    address?: string;
    code?: string;
    viewingId?: string;
    cards?: RawLiveCard[];
  };
  if (!payload.code || !payload.address || !payload.viewingId || !Array.isArray(payload.cards)) notFound();

  return (
    <LiveCardsSync
      viewingId={payload.viewingId}
      address={payload.address}
      code={payload.code}
      cards={await withPhotoUrls(payload.cards)}
    />
  );
}
