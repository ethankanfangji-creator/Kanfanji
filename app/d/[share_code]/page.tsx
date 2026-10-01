import { notFound } from "next/navigation";
import {
  DiscussionBoard,
  type DiscussionComment,
  type DiscussionHouse,
  type DiscussionRow,
} from "@/components/discussion/DiscussionBoard";
import { MEDIA_SIGNED_TTL_SECONDS, absoluteStorageSignedUrl, assertOwnerMediaPath } from "@/lib/media-sign";
import { MEDIA_BUCKET } from "@/lib/supabase";
import { isLiveCode } from "@/lib/viewing-session-code";
import { createAdminClient } from "@/utils/supabase/admin";

const STATUS = new Set(["good", "bad", "unsure"]);

async function signPhotos(paths: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const safe = paths.filter((path) => path && !path.startsWith("http"));
  if (safe.length === 0) return signed;
  const admin = createAdminClient();
  const result = await admin.storage.from(MEDIA_BUCKET).createSignedUrls(safe, MEDIA_SIGNED_TTL_SECONDS);
  result.data?.forEach((row, index) => {
    const raw = row.signedUrl || ("signedURL" in row ? String(row.signedURL) : "");
    const url = absoluteStorageSignedUrl(raw);
    if (url) signed.set(safe[index], url);
  });
  return signed;
}

export default async function DiscussionPage({
  params,
}: {
  params: Promise<{ share_code: string }>;
}) {
  const { share_code: shareCode } = await params;
  if (!isLiveCode(shareCode)) notFound();

  const admin = createAdminClient();
  const { data: room, error } = await admin
    .from("discussion_rooms")
    .select("id, owner_user_id, viewing_ids, share_code")
    .eq("share_code", shareCode)
    .maybeSingle();
  if (error) throw new Error("discussion_unavailable");
  if (!room) notFound();

  const viewingIds = ((room.viewing_ids ?? []) as unknown[]).filter(
    (id): id is string => typeof id === "string",
  );
  const [{ data: viewings }, { data: templates }, { data: saved }, commentsResult] = await Promise.all([
    admin.from("viewings").select("id, address, user_id").in("id", viewingIds),
    admin.from("viewing_card_templates").select("id, name, icon, sort_order, is_system, owner_user_id"),
    admin.from("viewing_cards").select("id, viewing_id, template_id, status, notes, voice_transcript, photos").in("viewing_id", viewingIds),
    admin.from("discussion_comments").select("id, card_id, nickname, content, vote, created_at").eq("room_id", room.id).order("created_at", { ascending: true }),
  ]);
  const comments = commentsResult.error ? [] : commentsResult.data;

  const houseRows = (viewings ?? []) as Array<{ id: string; address: string; user_id: string | null }>;
  const houses: DiscussionHouse[] = viewingIds
    .map((id) => houseRows.find((viewing) => viewing.id === id))
    .filter((viewing): viewing is { id: string; address: string; user_id: string | null } => Boolean(viewing))
    .map((viewing) => ({ id: viewing.id, address: viewing.address }));
  const ownerIds = new Set(
    houses
      .map((house) => houseRows.find((viewing) => viewing.id === house.id)?.user_id)
      .filter((id): id is string => typeof id === "string"),
  );
  const templateRows = (templates ?? [])
    .filter((template) => template.is_system || ownerIds.has(template.owner_user_id))
    .sort((a, b) => Number(b.is_system) - Number(a.is_system) || a.sort_order - b.sort_order);
  const paths = (saved ?? []).flatMap((card) => (Array.isArray(card.photos) ? card.photos.slice(0, 4) : []));
  const signed = await signPhotos(
    paths.filter((path): path is string => {
      if (typeof path !== "string" || !ownerIds.has(path.split("/")[0] ?? "")) return false;
      try {
        assertOwnerMediaPath(path, path.split("/")[0] ?? "");
        return true;
      } catch {
        return false;
      }
    }),
  );

  const rows: DiscussionRow[] = templateRows.map((template) => ({
    templateId: template.id,
    name: template.name,
    icon: template.icon,
    cells: Object.fromEntries(
      houses.map((house) => {
        const card = (saved ?? []).find(
          (item) => item.viewing_id === house.id && item.template_id === template.id,
        );
        const photos = Array.isArray(card?.photos) ? card.photos.filter((path): path is string => typeof path === "string") : [];
        return [
          house.id,
          {
            cardId: card?.id ?? null,
            status: card?.status && STATUS.has(card.status) ? card.status : null,
            notes: card?.notes ?? null,
            voiceTranscript: card?.voice_transcript ?? null,
            photoUrls: photos.map((path) => signed.get(path)).filter((url): url is string => Boolean(url)),
          },
        ];
      }),
    ),
  }));

  const visibleComments: DiscussionComment[] = (comments ?? []).map((comment) => ({
    id: comment.id,
    cardId: comment.card_id,
    nickname: comment.nickname,
    content: comment.content,
    vote: comment.vote,
  }));

  return (
    <DiscussionBoard
      shareCode={room.share_code}
      houses={houses}
      rows={rows}
      comments={visibleComments}
      commentsFailed={Boolean(commentsResult.error)}
    />
  );
}
