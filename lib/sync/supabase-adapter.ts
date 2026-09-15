import { extensionFor, uploadViewingFile, appendViewingPath } from "@/lib/media";
import { getSupabase } from "@/lib/supabase";
import { saveViewingRecord } from "@/lib/viewing-sync";
import type { MediaKind } from "@/lib/draft-db";
import type {
  SaveRemoteViewingInput,
  SaveRemoteViewingResult,
  UploadRemoteMediaInput,
  UploadRemoteMediaResult,
  ViewingSyncAdapter,
  RemoteViewingSnapshot,
} from "./types";

function folderFor(kind: MediaKind): "photos" | "videos" | "audios" {
  if (kind === "photo") return "photos";
  if (kind === "video") return "videos";
  return "audios";
}

function columnFor(kind: MediaKind): "photo_urls" | "video_urls" | "audio_urls" {
  if (kind === "photo") return "photo_urls";
  if (kind === "video") return "video_urls";
  return "audio_urls";
}

/**
 * Production adapter — wraps existing Supabase helpers only (no new HTTP endpoints).
 */
export function createSupabaseViewingSyncAdapter(): ViewingSyncAdapter {
  return {
    isOnline() {
      return typeof navigator === "undefined" ? true : navigator.onLine;
    },

    async getCurrentUserId() {
      const supabase = getSupabase();
      if (!supabase) return null;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id ?? null;
    },

    async getRemoteViewing(remoteId: string): Promise<RemoteViewingSnapshot | null> {
      const supabase = getSupabase();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("viewings")
        .select("id, address, client_updated_at, updated_at, share_token")
        .eq("id", remoteId)
        .maybeSingle();
      if (error || !data) return null;
      return {
        id: String(data.id),
        address: String(data.address ?? ""),
        clientUpdatedAt: data.client_updated_at ? String(data.client_updated_at) : null,
        updatedAt: data.updated_at ? String(data.updated_at) : null,
        shareToken: data.share_token ? String(data.share_token) : null,
      };
    },

    async saveRemoteViewing(input: SaveRemoteViewingInput): Promise<SaveRemoteViewingResult> {
      const supabase = getSupabase();
      if (!supabase) throw new Error("尚未設定 Supabase");

      // Pre-check conflict when remote is newer and caller expects a push.
      if (input.remoteViewingId) {
        const remote = await this.getRemoteViewing(input.remoteViewingId);
        if (remote?.clientUpdatedAt) {
          const remoteTs = Date.parse(remote.clientUpdatedAt) || 0;
          const localTs = Date.parse(input.clientUpdatedAt) || 0;
          if (remoteTs > localTs) {
            return {
              id: input.remoteViewingId,
              shareToken: remote.shareToken || input.shareToken || "",
              conflict: true,
              skippedAsStale: true,
            };
          }
        }
      }

      const result = await saveViewingRecord(
        supabase,
        input.userId,
        {
          address: input.address,
          tags: input.tags,
          market: input.market,
          questions: input.questions,
          notes: input.notes,
          pros: input.pros,
          risks: input.risks,
          property: input.property,
          propertyId: input.propertyId,
          isPro: input.isPro,
          clientUpdatedAt: input.clientUpdatedAt,
          shareToken: input.shareToken,
        },
        input.remoteViewingId,
      );

      return {
        id: result.id,
        shareToken: result.shareToken,
        conflict: false,
        skippedAsStale: result.skippedAsStale,
      };
    },

    async uploadRemoteMedia(input: UploadRemoteMediaInput): Promise<UploadRemoteMediaResult> {
      const path = await uploadViewingFile(
        input.remoteViewingId,
        folderFor(input.kind),
        input.blob,
        input.filename,
      );
      return { storagePath: path, alreadyExisted: false };
    },

    async appendRemoteMediaPath(remoteViewingId, kind, storagePath) {
      await appendViewingPath(remoteViewingId, columnFor(kind), storagePath);
    },
  };
}

export { extensionFor };
