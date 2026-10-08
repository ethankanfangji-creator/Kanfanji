"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  ExternalLink,
  FileSearch,
  Loader2,
  Pencil,
  Share2,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { ViewingTagsPicker } from "@/components/portfolio/ViewingTagsPicker";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { ReportSectionsView } from "@/components/viewing-chat/ReportSectionsView";
import { ShareReportCommentsPanel } from "@/components/viewing-chat/ShareReportCommentsPanel";
import { ClaimLimitDialog } from "@/components/viewing-chat/ClaimLimitDialog";
import { ShareReportDialog } from "@/components/viewing-chat/ShareReportDialog";
import { ViewingChatComposer } from "@/components/viewing-chat/ViewingChatComposer";
import { claimAccountThreads } from "@/lib/viewing-chat/claim-account";
import {
  consumeClaimLimitNotice,
  hasBlockedLimitThreads,
} from "@/lib/viewing-chat/claim-limit-notice";
import { startProCheckout } from "@/lib/viewing-chat/start-pro-checkout";
import { useChatMediaUrl } from "@/components/viewing-chat/useChatMediaUrl";
import { BriefingLoadingPanel } from "@/components/viewing-session/BriefingLoadingPanel";
import { AI_CONSENT_VERSION } from "@/lib/ai-boundary/client";
import { blobToDataUrl, normalizeImageForAi } from "@/lib/ai-boundary/browser";
import { track } from "@/lib/analytics/client";
import {
  collectFrequentViewingTags,
  effectiveViewingTags,
  viewingTagsPatch,
} from "@/lib/portfolio";
import {
  briefingDisplaySources,
  briefingDisplaySummary,
  briefingHasContent,
  briefingMatchesAddress,
  coerceViewingBriefing,
  emptyBriefing,
  notesFingerprint,
  userNotesOnly,
  type ViewingBriefing,
  type ViewingBriefingFeedback,
} from "@/lib/viewing-chat/briefing";
import { localPreferenceBlock } from "@/lib/viewing-chat/ai-preferences";
import { applyChatStateToLocal } from "@/lib/viewing-chat/chat-state";
import {
  buildChatStatePayload,
  pushViewingThreadWithConflictRetry,
} from "@/lib/viewing-chat/cloud-push";
import { localNotesAreAuthoritative } from "@/lib/viewing-chat/merge-messages";
import {
  getLocalThread,
  listLocalThreads,
  patchLocalThread,
  saveLocalMessages,
  threadVisibleToAccount,
  upsertLocalThread,
} from "@/lib/viewing-chat/local-store";
import { mergeMessagesForHydrate } from "@/lib/viewing-chat/merge-messages-hydrate";
import {
  appendMessageToList,
  buildAudioNoteMessage,
  mediaRefFromAudioBlob,
  patchMessageTranscript,
} from "@/lib/viewing-chat/append-audio-note";
import { getEphemeralMedia, putEphemeralMedia } from "@/lib/viewing-chat/ephemeral-media";
import { guestDaysLeft } from "@/lib/viewing-chat/guest-retention";
import { addMediaFile, getMediaBlob } from "@/lib/viewing-chat/media-library";
import { submitAiFeedback } from "@/lib/viewing-chat/submit-ai-feedback";
import { uploadViewingFile, appendViewingPath } from "@/lib/media";
import { isReadableAttachment, isVideoAttachment } from "@/lib/media-import";
import { getSupabase } from "@/lib/supabase";
import {
  createUserMessage,
  type ChatMessage,
  type ChatReportFeedback,
  type ChatReportSnapshot,
  type ViewingChatThread,
} from "@/lib/viewing-chat/types";

function consentSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "kanfangji.chat.consentSession";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c_${Date.now()}`;
  window.sessionStorage.setItem(key, next);
  return next;
}

async function hydrateViewingThread(
  threadId: string,
  ownerUserId: string,
): Promise<{ ok: boolean; needsSync: boolean }> {
  const detail = await fetch(`/api/viewing-chat/threads/${threadId}`);
  if (!detail.ok) return { ok: false, needsSync: false };
  const row = (await detail.json()) as {
    id: string;
    address: string;
    messages: ChatMessage[];
    report: ViewingChatThread["report"];
    metadata: ViewingChatThread["metadata"];
    chat_state: Record<string, unknown> | null;
    revision: number;
    updated_at: string;
    created_at?: string;
  };
  const local = getLocalThread(threadId);
  const base: ViewingChatThread = local ?? {
    id: row.id,
    address: row.address,
    createdAt: row.created_at ?? row.updated_at,
    updatedAt: row.updated_at,
    messages: [],
    report: null,
    metadata: null,
    pinned: false,
  };
  const restored = applyChatStateToLocal(base, row.chat_state);
  // Re-read after the network round-trip — user may have deleted notes meanwhile.
  const freshLocal = getLocalThread(threadId);
  const localUpdatedAt =
    freshLocal?.updatedAt ?? local?.updatedAt ?? restored.updatedAt;
  const localCloudState = freshLocal?.cloud?.state ?? local?.cloud?.state;
  const keepLocalNotes = localNotesAreAuthoritative({
    hasLocalMessages: Boolean(freshLocal ?? local),
    localUpdatedAt,
    remoteUpdatedAt: row.updated_at,
    localCloudState,
  });
  const localMessages = freshLocal?.messages ?? restored.messages ?? [];
  const mergedMessages = keepLocalNotes
    ? localMessages
    : mergeMessagesForHydrate(
        localMessages,
        row.messages ?? [],
        localUpdatedAt,
        row.updated_at,
      );
  upsertLocalThread({
    ...restored,
    address: row.address || restored.address,
    messages: mergedMessages,
    report: row.report ?? restored.report,
    metadata: row.metadata ?? restored.metadata,
    // Keep the newer clock so a just-deleted local note is not treated as stale.
    updatedAt: keepLocalNotes && (freshLocal ?? local)
      ? (freshLocal ?? local)!.updatedAt
      : row.updated_at,
    ownerUserId,
    cloud: keepLocalNotes
      ? {
          state: "syncing",
          lastSyncedAt: (freshLocal ?? local)?.cloud?.lastSyncedAt ?? null,
          revision: row.revision,
        }
      : {
          state: "synced",
          lastSyncedAt: row.updated_at,
          revision: row.revision,
        },
  });
  return { ok: true, needsSync: keepLocalNotes };
}

/** Compact note footer actions — same visual weight, keeps timestamp optically centered. */
const noteActionIconClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A]";

function NoteMedia({ message }: { message: ChatMessage }) {
  const ref = message.media?.[0] ?? null;
  const { url } = useChatMediaUrl(ref);
  const kind = ref?.kind;
  if ((message.type === "photo" || kind === "image") && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="mt-2 max-h-56 w-full rounded-xl object-cover" />;
  }
  if ((message.type === "video" || kind === "video") && url) {
    return <video className="mt-2 max-h-56 w-full rounded-xl" controls preload="metadata" src={url} />;
  }
  if (message.type === "audio" && url) {
    return <audio className="mt-2 w-full" controls src={url} />;
  }
  return null;
}

function NoteFileActions({
  message,
  openLabel,
  downloadLabel,
}: {
  message: ChatMessage;
  openLabel: string;
  downloadLabel: string;
}) {
  const ref = message.media?.[0] ?? null;
  const { url } = useChatMediaUrl(ref);
  if (!url) return null;
  const name = ref?.name || message.fileName || "file";
  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={openLabel}
        title={openLabel}
        className={noteActionIconClass}
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
      <a
        href={url}
        download={name}
        aria-label={downloadLabel}
        title={downloadLabel}
        className={noteActionIconClass}
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
      </a>
    </>
  );
}

function ReportGallery({
  refs,
  openLabel,
  downloadLabel,
}: {
  refs: NonNullable<ChatReportSnapshot["mediaRefs"]>;
  openLabel?: string;
  downloadLabel?: string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {refs.map((item) => (
        <ReportGalleryItem
          key={item.path || item.id}
          item={item}
          openLabel={openLabel}
          downloadLabel={downloadLabel}
        />
      ))}
    </div>
  );
}

function ReportGalleryItem({
  item,
  openLabel,
  downloadLabel,
}: {
  item: NonNullable<ChatReportSnapshot["mediaRefs"]>[number];
  openLabel?: string;
  downloadLabel?: string;
}) {
  const { url } = useChatMediaUrl(item);
  if (item.kind === "file") {
    return (
      <div className="flex h-20 min-w-[9rem] shrink-0 flex-col justify-center gap-1 rounded-lg bg-black/5 px-2.5 py-2">
        <p className="truncate text-[11px] font-semibold text-[#111]">{item.name || "file"}</p>
        {url ? (
          <div className="flex items-center gap-0.5">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={openLabel || "Open"}
              title={openLabel || "Open"}
              className={noteActionIconClass}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <a
              href={url}
              download={item.name || "file"}
              aria-label={downloadLabel || "Download"}
              title={downloadLabel || "Download"}
              className={noteActionIconClass}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        ) : (
          <p className="text-[10px] text-[#9CA3AF]">…</p>
        )}
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-black/5 text-[11px] text-[#6B7280]">
        {item.kind === "video" ? "▶" : "…"}
      </div>
    );
  }
  if (item.kind === "video") {
    return <video src={url} controls preload="metadata" className="h-20 w-28 shrink-0 rounded-lg object-cover" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />;
}

export function ViewingSessionApp({ viewingId }: { viewingId: string }) {
  const router = useRouter();
  const { messages: t, locale } = useI18n();
  const c = t.chat;
  const [thread, setThread] = useState<ViewingChatThread | null>(null);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<ViewingBriefing | null>(null);
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [shownReport, setShownReport] = useState<ChatReportSnapshot | null>(null);
  const [status, setStatus] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteProcessingHint, setNoteProcessingHint] = useState<string | null>(null);
  const [mediaBusyIds, setMediaBusyIds] = useState<Record<string, "caption" | "read">>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [feedbackPrompt, setFeedbackPrompt] = useState<null | "briefing" | "report">(null);
  const [feedbackReasonDraft, setFeedbackReasonDraft] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharePublishHint, setSharePublishHint] = useState(false);
  const [guestSaveHint, setGuestSaveHint] = useState(false);
  const [claimLimitOpen, setClaimLimitOpen] = useState(false);
  const syncTimer = useRef(0);
  const notesEndRef = useRef<HTMLDivElement>(null);

  const notes = useMemo(
    () => (thread ? userNotesOnly(thread.messages) : []),
    [thread],
  );
  const fingerprint = useMemo(
    () => (thread ? notesFingerprint(thread.messages) : ""),
    [thread],
  );
  const reportFingerprint =
    shownReport?.notesFingerprint ?? thread?.reportNotesFingerprint ?? null;
  const reportStale = Boolean(
    shownReport && fingerprint && reportFingerprint && reportFingerprint !== fingerprint,
  );
  const reportUpToDate = Boolean(
    shownReport && fingerprint && reportFingerprint === fingerprint,
  );

  function refresh() {
    const next = getLocalThread(viewingId);
    setThread(next);
    if (next?.briefing) {
      const coerced = coerceViewingBriefing(next.briefing);
      if (
        coerced &&
        briefingMatchesAddress(coerced, next.address) &&
        briefingHasContent(coerced)
      ) {
        setBriefing(coerced);
      }
    }
  }

  async function requestBriefing(args: {
    address: string;
    signal?: AbortSignal;
  }) {
    setBriefingBusy(true);
    const postBriefing = () =>
      fetch("/api/viewing-chat/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: args.address,
          locale,
          viewingId,
          preferenceBlock: !userId ? localPreferenceBlock("briefing") : undefined,
          consentVersion: AI_CONSENT_VERSION,
          consentSessionId: consentSessionId(),
          identityKind: userId ? "user" : "guest",
        }),
        signal: args.signal,
      });
    try {
      let response = await postBriefing();
      // One automatic retry on transient OpenAI upstream failures.
      if (
        (response.status === 502 || response.status === 504) &&
        !args.signal?.aborted
      ) {
        response = await postBriefing();
      }
      if (args.signal?.aborted) return;
      const body = (await response.json().catch(() => ({}))) as {
        briefing?: ViewingBriefing;
        revision?: number;
        code?: string;
      };
      const coerced =
        coerceViewingBriefing(body.briefing) ?? emptyBriefing(args.address);
      // Fresh generation never carries over a prior like/dislike.
      const next: ViewingBriefing = {
        ...coerced,
        feedback: null,
        feedbackAt: null,
      };
      setBriefing(next);
      if (briefingHasContent(next)) {
        const cloudPatch =
          typeof body.revision === "number"
            ? {
                briefing: next,
                cloud: {
                  state: "synced" as const,
                  lastSyncedAt: new Date().toISOString(),
                  revision: body.revision,
                },
              }
            : { briefing: next };
        patchLocalThread(viewingId, cloudPatch);
        // Server already persisted briefing + bumped revision — skip a conflicting PUT.
        if (typeof body.revision !== "number") queueSync();
      } else {
        // Keep local free of empty shells so a remount can retry.
        patchLocalThread(viewingId, { briefing: null });
        if (body.code) {
          console.warn("[briefing]", body.code, args.address);
        }
      }
      refresh();
    } catch (error) {
      if (args.signal?.aborted) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setBriefing(emptyBriefing(args.address));
      patchLocalThread(viewingId, { briefing: null });
    } finally {
      if (!args.signal?.aborted) setBriefingBusy(false);
    }
  }

  async function flushCloudSync(ownerId: string | null) {
    if (!ownerId) return false;
    const current = getLocalThread(viewingId);
    if (!current) return false;
    const pushed = await pushViewingThreadWithConflictRetry({
      threadId: viewingId,
      address: current.address,
      baseRevision: current.cloud?.revision,
      previouslySynced:
        current.cloud?.state === "synced" || typeof current.cloud?.revision === "number",
      messages: current.messages,
      chatState: buildChatStatePayload(current),
      clientUpdatedAt: new Date().toISOString(),
      report: current.report,
      metadata: current.metadata,
    });
    if (pushed.status >= 200 && pushed.status < 300) {
      patchLocalThread(viewingId, {
        ownerUserId: ownerId,
        cloud: {
          state: "synced",
          lastSyncedAt: new Date().toISOString(),
          revision: pushed.revision,
        },
      });
      refresh();
      return true;
    }
    if (pushed.status === 409) {
      patchLocalThread(viewingId, { cloud: { state: "failed" } });
    }
    return false;
  }

  function queueSync() {
    if (!userId) return;
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      void flushCloudSync(userId);
    }, 600);
  }

  async function ensureSyncedForShare(): Promise<boolean> {
    const current = getLocalThread(viewingId);
    if (!current) return false;
    if (current.cloud?.state === "synced") return true;
    const previouslySynced = typeof current.cloud?.revision === "number";
    const pushed = await pushViewingThreadWithConflictRetry({
      threadId: viewingId,
      address: current.address,
      baseRevision: current.cloud?.revision,
      previouslySynced,
      messages: current.messages,
      chatState: buildChatStatePayload(current),
      clientUpdatedAt: new Date().toISOString(),
      report: current.report,
      metadata: current.metadata,
    });
    if (pushed.status < 200 || pushed.status >= 300) {
      setStatus(pushed.status === 403 ? c.shareBlockedLimit : c.shareSyncing);
      return false;
    }
    patchLocalThread(viewingId, {
      ownerUserId: userId ?? undefined,
      cloud: {
        state: "synced",
        lastSyncedAt: new Date().toISOString(),
        revision: pushed.revision,
      },
    });
    refresh();
    return true;
  }

  async function requestShare() {
    if (!shownReport) {
      setStatus(c.shareNoReportYet);
      return;
    }
    if (!getSupabase() || !userId) {
      router.push(`/login?next=${encodeURIComponent(`/viewings/${viewingId}`)}`);
      return;
    }
    if (!(await ensureSyncedForShare())) return;
    setShareError(null);
    setShareCopied(false);
    setShareUrl(null);
    setShareBusy(true);
    setShareOpen(true);

    try {
      const existingRes = await fetch(
        `/api/share/links?viewingId=${encodeURIComponent(viewingId)}`,
      );
      let absolute: string | null = null;
      if (existingRes.ok) {
        const existing = (await existingRes.json()) as {
          url?: string | null;
          link?: { id?: string; status?: string };
        };
        if (existing.url && existing.link?.id && existing.link.status === "closed") {
          const reopenRes = await fetch(`/api/share/links/${existing.link.id}/reopen`, {
            method: "POST",
          });
          if (reopenRes.ok) {
            absolute = `${window.location.origin}${existing.url}`;
          }
        } else if (existing.url && existing.link?.status !== "closed") {
          absolute = `${window.location.origin}${existing.url}`;
        }
      }

      if (!absolute) {
        const createRes = await fetch("/api/share/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ viewingId }),
        });
        const created = (await createRes.json()) as {
          urlPath?: string;
          code?: string;
        };
        if (createRes.status === 429) {
          setShareError(c.shareRateLimited);
          return;
        }
        if (createRes.status === 503) {
          setShareError(c.shareUnavailable);
          return;
        }
        if (created.code === "VIEWING_NOT_FOUND" || createRes.status === 404) {
          setShareError(c.viewingNotFound);
          return;
        }
        if (createRes.status === 409) {
          setShareError(c.shareNoReportYet);
          return;
        }
        if (!createRes.ok || !created.urlPath) {
          setShareError(c.shareUnavailable);
          return;
        }
        absolute = `${window.location.origin}${created.urlPath}`;
      }

      setShareUrl(absolute);
      try {
        await navigator.clipboard.writeText(absolute);
        setShareCopied(true);
      } catch {
        setShareError("COPY_FAILED");
      }
    } catch {
      setShareError(c.shareUnavailable);
    } finally {
      setShareBusy(false);
    }
  }

  function setBriefingFeedback(value: ViewingBriefingFeedback) {
    if (!briefing || !briefingHasContent(briefing)) return;
    if (briefing.feedback === value) {
      const next: ViewingBriefing = {
        ...briefing,
        feedback: null,
        feedbackAt: null,
        feedbackReason: null,
      };
      setBriefing(next);
      patchLocalThread(viewingId, { briefing: next });
      setFeedbackPrompt(null);
      setFeedbackReasonDraft("");
      queueSync();
      return;
    }
    if (value === "dislike") {
      setFeedbackPrompt("briefing");
      setFeedbackReasonDraft("");
      return;
    }
    void commitBriefingFeedback("like", null);
  }

  async function commitBriefingFeedback(
    rating: ViewingBriefingFeedback,
    reason: string | null,
  ) {
    if (!briefing || !briefingHasContent(briefing)) return;
    const next: ViewingBriefing = {
      ...briefing,
      feedback: rating,
      feedbackAt: new Date().toISOString(),
      feedbackReason: rating === "dislike" ? reason : null,
    };
    setBriefing(next);
    patchLocalThread(viewingId, { briefing: next });
    setFeedbackPrompt(null);
    setFeedbackReasonDraft("");
    queueSync();
    await submitAiFeedback({
      kind: "briefing",
      rating,
      reason,
      artifactExcerpt: next.summary,
      viewingId,
      generatedAt: next.generatedAt,
      identityKind: userId ? "user" : "guest",
    });
  }

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;

    // Show a guest-local thread immediately — never block the notes UI on auth.
    const localFirst = getLocalThread(viewingId);
    if (localFirst && threadVisibleToAccount(localFirst, null)) {
      setThread(localFirst);
      setReady(true);
      if (localFirst.briefing) {
        const coerced = coerceViewingBriefing(localFirst.briefing);
        if (
          coerced &&
          briefingMatchesAddress(coerced, localFirst.address) &&
          briefingHasContent(coerced)
        ) {
          setBriefing(coerced);
        }
      }
      if (localFirst.report) {
        const fp = notesFingerprint(localFirst.messages);
        setShownReport({
          ...localFirst.report,
          notesFingerprint:
            localFirst.report.notesFingerprint ??
            localFirst.reportNotesFingerprint ??
            fp,
        });
      }
    }

    void (async () => {
      let uid: string | null = null;
      if (supabase) {
        try {
          const result = await Promise.race([
            supabase.auth.getUser(),
            new Promise<null>((resolve) => {
              window.setTimeout(() => resolve(null), 2500);
            }),
          ]);
          if (result && "data" in result) {
            uid = result.data.user?.id ?? null;
          }
        } catch {
          uid = null;
        }
        if (!cancelled) setUserId(uid);
      }
      if (cancelled) return;

      if (uid) {
        const hydrated = await hydrateViewingThread(viewingId, uid);
        if (cancelled) return;
        if (!hydrated.ok && !getLocalThread(viewingId)) {
          setMissing(true);
          setReady(true);
          return;
        }
        if (hydrated.needsSync) {
          window.setTimeout(() => {
            void flushCloudSync(uid);
          }, 0);
        }
      } else if (!getLocalThread(viewingId)) {
        setMissing(true);
        setReady(true);
        return;
      }

      const local = getLocalThread(viewingId);
      if (!local || !threadVisibleToAccount(local, uid)) {
        setMissing(true);
        setReady(true);
        return;
      }
      setThread(local);
      setMissing(false);
      setReady(true);
      if (local.briefing) {
        const coerced = coerceViewingBriefing(local.briefing);
        if (
          coerced &&
          briefingMatchesAddress(coerced, local.address) &&
          briefingHasContent(coerced)
        ) {
          setBriefing(coerced);
        }
      }
      // Restore a previously generated report product; never invent one without a press.
      if (local.report) {
        const fp = notesFingerprint(local.messages);
        setShownReport({
          ...local.report,
          notesFingerprint: local.report.notesFingerprint ?? local.reportNotesFingerprint ?? fp,
        });
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(syncTimer.current);
    };
  }, [viewingId]);

  useEffect(() => {
    if (!thread || !ready || missing) return;
    // Empty shells must not block regeneration (OpenAI blips used to stick forever).
    if (briefingHasContent(briefing) && briefingMatchesAddress(briefing, thread.address)) {
      return;
    }
    const controller = new AbortController();
    void requestBriefing({
      address: thread.address,
      signal: controller.signal,
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per address
  }, [thread?.id, thread?.address, ready, missing, locale, userId]);

  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes.length]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const claim = await claimAccountThreads(userId);
      if (cancelled) return;
      const overLimit = claim.blocked > 0 || hasBlockedLimitThreads(userId);
      if (consumeClaimLimitNotice(overLimit)) {
        setClaimLimitOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function patchNoteFields(
    messageId: string,
    patch: Partial<Pick<ChatMessage, "text" | "analysis" | "transcript">>,
  ) {
    const latest = getLocalThread(viewingId);
    if (!latest) return;
    const nextMessages = latest.messages.map((item) =>
      item.id === messageId ? { ...item, ...patch } : item,
    );
    const next = saveLocalMessages(viewingId, nextMessages);
    if (next) setThread(next);
    markReportStaleFromNotes();
    queueSync();
  }

  async function runPhotoAutocaption(messageId: string, image: File) {
    setMediaBusyIds((prev) => ({ ...prev, [messageId]: "caption" }));
    try {
      const normalized = await normalizeImageForAi(image);
      const dataUrl = await blobToDataUrl(normalized);
      const response = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "caption",
          base64: dataUrl,
          tag: "on-site",
          locale,
          market: "OTHER",
          mediaId: messageId,
          consentVersion: AI_CONSENT_VERSION,
          consentSessionId: consentSessionId(),
          identityKind: userId ? "user" : "guest",
        }),
      });
      if (!response.ok) return;
      const body = (await response.json()) as { caption?: string };
      const caption = body.caption?.trim();
      if (!caption) return;
      const latest = getLocalThread(viewingId);
      const existing = latest?.messages.find((item) => item.id === messageId);
      const hadUserText = Boolean(existing?.text?.trim());
      patchNoteFields(messageId, {
        analysis: caption,
        ...(hadUserText ? {} : { text: caption }),
      });
    } catch {
      // Best-effort — photo note remains without caption.
    } finally {
      setMediaBusyIds((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    }
  }

  async function readAttachedFile(note: ChatMessage) {
    const media = note.media?.[0];
    if (!media || note.type !== "file") return;
    const blob =
      getEphemeralMedia(media.id) ?? (await getMediaBlob(media.id).catch(() => null));
    if (!blob) {
      setStatus(c.readFileMissing || c.syncRetry || "找不到檔案");
      return;
    }
    setMediaBusyIds((prev) => ({ ...prev, [note.id]: "read" }));
    setStatus(c.readingFile || "");
    try {
      const file = new File([blob], media.name || note.fileName || "file", {
        type: media.mime || blob.type || "application/octet-stream",
      });
      const form = new FormData();
      form.append("file", file);
      form.append("consentVersion", AI_CONSENT_VERSION);
      form.append("consentSessionId", consentSessionId());
      form.append("identityKind", userId ? "user" : "guest");
      form.append("locale", locale);
      const response = await fetch("/api/viewing-chat/read-file", {
        method: "POST",
        body: form,
      });
      const body = (await response.json().catch(() => null)) as {
        text?: string;
        error?: string;
      } | null;
      if (!response.ok || !body?.text?.trim()) {
        setStatus(body?.error || c.readFileFailed || c.syncRetry || "讀檔失敗");
        return;
      }
      const text = body.text.trim();
      patchNoteFields(note.id, {
        analysis: text,
        text: note.text?.trim() && note.text !== note.fileName ? note.text : text,
      });
      setStatus("");
    } catch {
      setStatus(c.readFileFailed || c.syncRetry || "讀檔失敗");
    } finally {
      setMediaBusyIds((prev) => {
        const next = { ...prev };
        delete next[note.id];
        return next;
      });
    }
  }

  async function uploadNoteMedia(
    file: File,
    kind: "image" | "video" | "audio" | "file",
  ) {
    let id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `media_${Date.now()}`;
    let mime = file.type || "application/octet-stream";
    let name = file.name || "upload";
    let size = file.size;
    let mediaKind: "image" | "video" | "audio" | "file" =
      kind === "image"
        ? "image"
        : kind === "video"
          ? "video"
          : kind === "audio"
            ? "audio"
            : "file";

    try {
      const saved = await addMediaFile(file, viewingId, thread?.address ?? "");
      id = saved.id;
      mime = saved.mime;
      name = saved.name;
      size = saved.size;
      mediaKind = saved.kind;
    } catch {
      // IndexedDB can fail (private mode / quota). Keep a session blob so the note still plays.
      putEphemeralMedia(id, file);
    }
    putEphemeralMedia(id, file);

    let path: string | null = null;
    if (userId) {
      try {
        const folder =
          kind === "audio"
            ? "audios"
            : kind === "video"
              ? "videos"
              : kind === "file"
                ? "files"
                : "photos";
        const storageName =
          kind === "file"
            ? `${id}.${(file.name.split(".").pop() || "bin").replace(/[^\w.-]+/g, "").slice(0, 12) || "bin"}`
            : id;
        path = await uploadViewingFile(viewingId, folder, file, storageName);
        if (kind !== "file") {
          const column =
            kind === "audio"
              ? "audio_urls"
              : kind === "video"
                ? "video_urls"
                : "photo_urls";
          await appendViewingPath(viewingId, column, path);
        }
      } catch {
        path = null;
      }
    }
    return {
      id,
      kind: mediaKind,
      name,
      mime,
      size,
      path,
    };
  }

  async function appendNote(payload: {
    text: string;
    audio: Blob | null;
    image: File | null;
    file: File | null;
  }) {
    // Prefer fresh localStorage; fall back to React state and re-hydrate store.
    let current = getLocalThread(viewingId);
    if (!current && thread && thread.id === viewingId) {
      current = upsertLocalThread(thread);
    }
    if (!current) {
      setStatus(c.viewingNotFound || "找不到這則看房");
      throw new Error("missing_local_thread");
    }

    setStatus("");
    setNoteBusy(true);
    // Composer fallback label is uploadProcessing; only audio needs the STT copy.
    setNoteProcessingHint(payload.audio ? t.composer.transcribing : null);

    try {
      let message: ChatMessage;

      if (payload.image) {
        const media = await uploadNoteMedia(payload.image, "image");
        message = createUserMessage({
          type: "photo",
          text: payload.text.trim() || undefined,
          media: [media],
        });
      } else if (payload.audio) {
        if (payload.audio.size === 0) {
          throw new Error("empty_audio");
        }
        const file = new File(
          [payload.audio],
          `note-${Date.now()}.webm`,
          { type: payload.audio.type || "audio/webm" },
        );
        const mediaId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `media_${Date.now()}`;
        // Land the note in the list immediately (ephemeral blob) — never wait on
        // IndexedDB / cloud upload before the user sees their recording.
        const media = mediaRefFromAudioBlob(file, mediaId, file.name);
        message = buildAudioNoteMessage({
          audio: file,
          caption: payload.text,
          media,
        });
        const base = getLocalThread(viewingId) ?? current;
        const withAudio = appendMessageToList(base.messages, message);
        const saved = saveLocalMessages(viewingId, withAudio);
        if (!saved) throw new Error("save_failed");
        if (shownReport) {
          patchLocalThread(viewingId, {
            reportNotesFingerprint:
              shownReport.notesFingerprint ?? base.reportNotesFingerprint,
          });
        }
        setThread(saved);
        setNoteProcessingHint(t.composer.transcribing);

        // Best-effort durable/cloud media — failure must not remove the note.
        void uploadNoteMedia(file, "audio").then((uploaded) => {
          const latest = getLocalThread(viewingId);
          if (!latest) return;
          const patched = latest.messages.map((item) =>
            item.id === message.id
              ? {
                  ...item,
                  media: [
                    {
                      ...uploaded,
                      // Keep the same id so ephemeral + IDB lookups stay aligned.
                      id: media.id,
                    },
                  ],
                }
              : item,
          );
          const next = saveLocalMessages(viewingId, patched);
          if (next) setThread(next);
        });

        let transcript = "";
        try {
          const form = new FormData();
          form.append("audio", file);
          form.append("consentVersion", AI_CONSENT_VERSION);
          form.append("consentSessionId", consentSessionId());
          form.append("identityKind", userId ? "user" : "guest");
          const response = await fetch("/api/viewing-chat/transcribe-note", {
            method: "POST",
            body: form,
          });
          if (response.ok) {
            const body = (await response.json()) as { transcript?: string };
            transcript = body.transcript?.trim() || "";
          }
        } catch {
          transcript = "";
        }

        if (transcript) {
          const latest = getLocalThread(viewingId);
          if (latest) {
            const patched = patchMessageTranscript(
              latest.messages,
              message.id,
              transcript,
              payload.text,
            );
            const next = saveLocalMessages(viewingId, patched);
            if (next) setThread(next);
          }
        }
        queueSync();
        return;
      } else if (payload.file) {
        if (isVideoAttachment(payload.file)) {
          const media = await uploadNoteMedia(payload.file, "video");
          message = createUserMessage({
            type: "video",
            text: payload.text.trim() || undefined,
            fileName: payload.file.name,
            media: [{ ...media, kind: "video" }],
          });
        } else {
          const media = await uploadNoteMedia(payload.file, "file");
          message = createUserMessage({
            type: "file",
            text: payload.text.trim() || undefined,
            fileName: payload.file.name,
            media: [media],
          });
        }
      } else {
        const text = payload.text.trim();
        if (!text) return;
        message = createUserMessage({ type: "text", text });
      }

      const imageForCaption = payload.image;
      const latest = getLocalThread(viewingId) ?? current;
      const nextMessages = [...latest.messages, message];
      const saved = saveLocalMessages(viewingId, nextMessages);
      if (!saved) throw new Error("save_failed");
      if (shownReport) {
        patchLocalThread(viewingId, {
          reportNotesFingerprint:
            shownReport.notesFingerprint ?? latest.reportNotesFingerprint,
        });
      }
      setThread(saved);
      if (imageForCaption && message.type === "photo") {
        void runPhotoAutocaption(message.id, imageForCaption);
      }
      queueSync();
    } catch (error) {
      console.error("[appendNote]", error);
      setStatus(
        error instanceof Error && error.message === "empty_audio"
          ? c.emptyComposer
          : c.syncRetry || "筆記儲存失敗，請再試一次",
      );
      throw error;
    } finally {
      setNoteBusy(false);
      setNoteProcessingHint(null);
    }
  }

  function markReportStaleFromNotes() {
    if (!thread || !shownReport) return;
    patchLocalThread(viewingId, {
      reportNotesFingerprint: shownReport.notesFingerprint ?? thread.reportNotesFingerprint,
    });
  }

  function deleteNote(noteId: string) {
    if (!thread) return;
    if (!window.confirm(c.noteDeleteConfirm)) return;
    // Prefer store + React state so a late cloud hydrate cannot resurrect the note
    // from a stale in-memory `thread.messages` snapshot.
    const latest = getLocalThread(viewingId) ?? thread;
    const nextMessages = latest.messages.filter((message) => message.id !== noteId);
    const saved = saveLocalMessages(viewingId, nextMessages);
    if (!saved) {
      setStatus(c.syncRetry || "筆記儲存失敗，請再試一次");
      return;
    }
    markReportStaleFromNotes();
    if (editingNoteId === noteId) {
      setEditingNoteId(null);
      setEditingText("");
    }
    setThread(saved);
    queueSync();
  }

  function beginEditNote(note: ChatMessage) {
    const body =
      note.transcript?.trim() || note.text?.trim() || note.analysis?.trim() || "";
    setEditingNoteId(note.id);
    setEditingText(body);
  }

  function saveEditNote() {
    if (!thread || !editingNoteId) return;
    const nextText = editingText.trim();
    if (!nextText) return;
    const nextMessages = thread.messages.map((message) => {
      if (message.id !== editingNoteId) return message;
      if (message.type === "audio" || message.transcript != null) {
        return { ...message, transcript: nextText, text: nextText };
      }
      return { ...message, text: nextText };
    });
    saveLocalMessages(viewingId, nextMessages);
    markReportStaleFromNotes();
    setEditingNoteId(null);
    setEditingText("");
    refresh();
    queueSync();
  }

  function canEditNote(note: ChatMessage): boolean {
    return Boolean(
      note.text?.trim() || note.transcript?.trim() || note.analysis?.trim(),
    );
  }

  function setOverallRating(value: number | null) {
    patchLocalThread(viewingId, { overallRating: value });
    refresh();
    queueSync();
  }

  function setReportFeedback(value: ChatReportFeedback) {
    if (!shownReport) return;
    if (shownReport.feedback === value) {
      const next: ChatReportSnapshot = {
        ...shownReport,
        followUps: shownReport.followUps ?? [],
        feedback: null,
        feedbackAt: null,
        feedbackReason: null,
      };
      setShownReport(next);
      patchLocalThread(viewingId, { report: next });
      setFeedbackPrompt(null);
      setFeedbackReasonDraft("");
      queueSync();
      return;
    }
    if (value === "dislike") {
      setFeedbackPrompt("report");
      setFeedbackReasonDraft("");
      return;
    }
    void commitReportFeedback("like", null);
  }

  async function commitReportFeedback(rating: ChatReportFeedback, reason: string | null) {
    if (!shownReport) return;
    const next: ChatReportSnapshot = {
      ...shownReport,
      followUps: shownReport.followUps ?? [],
      feedback: rating,
      feedbackAt: new Date().toISOString(),
      feedbackReason: rating === "dislike" ? reason : null,
    };
    setShownReport(next);
    patchLocalThread(viewingId, { report: next });
    setFeedbackPrompt(null);
    setFeedbackReasonDraft("");
    queueSync();
    await submitAiFeedback({
      kind: "report",
      rating,
      reason,
      artifactExcerpt: next.summary,
      viewingId,
      notesFingerprint: next.notesFingerprint,
      generatedAt: next.generatedAt,
      identityKind: userId ? "user" : "guest",
    });
  }

  async function viewingHasActiveShareLink(): Promise<boolean> {
    if (!userId) return false;
    try {
      const response = await fetch(
        `/api/share/links?viewingId=${encodeURIComponent(viewingId)}`,
      );
      if (!response.ok) return false;
      const payload = (await response.json()) as {
        url?: string | null;
        link?: { status?: string } | null;
      };
      return Boolean(payload.url && payload.link?.status === "active");
    } catch {
      return false;
    }
  }

  async function generateReport() {
    if (!thread || notes.length === 0) return;
    setReportBusy(true);
    setStatus("");
    setSharePublishHint(false);
    try {
      const response = await fetch("/api/viewing-chat/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: thread.address,
          locale,
          viewingId: thread.id,
          messages: userNotesOnly(thread.messages),
          chatState: buildChatStatePayload(thread),
          preferenceBlock: !userId ? localPreferenceBlock("report") : undefined,
          consentVersion: AI_CONSENT_VERSION,
          consentSessionId: consentSessionId(),
          identityKind: userId ? "user" : "guest",
        }),
      });
      const data = (await response.json()) as {
        report?: ChatReportSnapshot;
        notesFingerprint?: string;
        revision?: number;
        error?: string;
      };
      if (!response.ok || !data.report) {
        setStatus(data.error || c.reportFailed);
        return;
      }
      const fingerprintNext = data.notesFingerprint ?? notesFingerprint(thread.messages);
      patchLocalThread(viewingId, {
        report: data.report,
        reportNotesFingerprint: fingerprintNext,
        ...(typeof data.revision === "number"
          ? {
              cloud: {
                state: "synced" as const,
                lastSyncedAt: new Date().toISOString(),
                revision: data.revision,
              },
            }
          : {}),
      });
      // Keep report as a product — do not append AI report bubbles into the notes stream.
      setShownReport({ ...data.report, notesFingerprint: fingerprintNext });
      setStatus("");
      refresh();
      queueSync();
      if (!userId) {
        setGuestSaveHint(true);
      }
      if (await viewingHasActiveShareLink()) {
        setSharePublishHint(true);
      }
    } catch {
      setStatus(c.reportFailed);
    } finally {
      setReportBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-[#FAF6F1] text-[14px] text-[#6B7280]">
        …
      </div>
    );
  }

  if (missing || !thread) {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center gap-3 bg-[#FAF6F1] px-6 text-center">
        <p className="text-[15px] font-bold">找不到這則看房。</p>
        <BackHomeLink label={t.loginPage.backHome} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100svh] w-full max-w-[520px] flex-col bg-[#FAF6F1] text-[#1A1A1A]">
      <header className="sticky top-0 z-10 border-b border-black/8 bg-[#FAF6F1]/95 px-4 py-3 backdrop-blur">
        <BackHomeLink label={t.loginPage.backHome} />
        <h1 className="mt-2 text-[18px] font-bold leading-snug">{thread.address}</h1>
        <div className="mt-3">
          <ViewingTagsPicker
            value={effectiveViewingTags({
              tags: thread.tags,
              decisionStatus: thread.decisionStatus,
            })}
            frequentTags={collectFrequentViewingTags(listLocalThreads(), {
              exclude: effectiveViewingTags({
                tags: thread.tags,
                decisionStatus: thread.decisionStatus,
              }),
            })}
            displayLabels={{
              liked: t.portfolio.decisionLiked,
              shortlist: t.portfolio.decisionShortlist,
              passed: t.portfolio.decisionPassed,
              revisit: t.portfolio.decisionRevisit,
            }}
            labels={{
              label: t.portfolio.decisionLabel,
              placeholder: t.portfolio.tagsPlaceholder,
              frequent: t.portfolio.tagsFrequent,
              addAria: t.portfolio.tagsAddAria,
            }}
            onChange={(next) => {
              const patch = viewingTagsPatch(next);
              patchLocalThread(viewingId, patch);
              track({
                name: "decision_status_changed",
                props: { status: patch.decisionStatus ?? "none", surface: "session" },
              });
              queueSync();
              refresh();
            }}
          />
        </div>
      </header>

      <section className="border-b border-black/8 px-4 py-4" aria-labelledby="briefing-heading">
        <h2
          id="briefing-heading"
          className="flex items-center gap-2 text-[13px] font-bold tracking-wide"
        >
          {c.briefingTitle}
          {briefingBusy && briefingHasContent(briefing) ? (
            <span
              className="inline-block h-3 w-3 rounded-full border-2 border-black/15 border-t-[#1A1A1A] animate-spin"
              aria-label={c.briefingLoading}
              role="status"
            />
          ) : null}
        </h2>
        {briefingBusy && !briefingHasContent(briefing) ? (
          <BriefingLoadingPanel
            ariaLabel={c.briefingLoading}
            stages={[
              c.briefingLoadingStageLocate,
              c.briefingLoadingStageSearch,
              c.briefingLoadingStageWrite,
            ]}
          />
        ) : briefing ? (
          !briefingHasContent(briefing) ? (
            <p className="mt-3 text-[13px] text-[#6B7280]">{c.briefingEmpty}</p>
          ) : (
            <div className="mt-3 rounded-2xl bg-white px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
              <p className="text-[14px] leading-relaxed">
                {briefingDisplaySummary(briefing)}
              </p>
              {briefingDisplaySources(briefing).length ? (
                <p className="mt-2 text-[11px] font-semibold text-[#6B7280]">
                  {c.briefingSource}: {briefingDisplaySources(briefing).join(" · ")}
                </p>
              ) : null}
              <div
                className="mt-3 flex items-center gap-1"
                role="group"
                aria-label={`${c.briefingLike} / ${c.briefingDislike}`}
              >
                <button
                  type="button"
                  onClick={() => setBriefingFeedback("like")}
                  aria-label={c.briefingLike}
                  title={c.briefingLike}
                  aria-pressed={briefing.feedback === "like"}
                  className={`inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full transition ${
                    briefing.feedback === "like"
                      ? "bg-[#1A1A1A] text-white"
                      : "text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A]"
                  }`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setBriefingFeedback("dislike")}
                  aria-label={c.briefingDislike}
                  title={c.briefingDislike}
                  aria-pressed={briefing.feedback === "dislike"}
                  className={`inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full transition ${
                    briefing.feedback === "dislike"
                      ? "bg-[#1A1A1A] text-white"
                      : "text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A]"
                  }`}
                >
                  <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              {feedbackPrompt === "briefing" ? (
                <div className="mt-3 space-y-2 rounded-xl bg-[#FAF6F1] px-3 py-3">
                  <textarea
                    value={feedbackReasonDraft}
                    onChange={(event) => setFeedbackReasonDraft(event.target.value)}
                    rows={2}
                    maxLength={280}
                    placeholder={c.feedbackReasonPlaceholder}
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-[13px] outline-none focus:border-black/30"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void commitBriefingFeedback("dislike", feedbackReasonDraft.trim() || null)}
                      className="rounded-full bg-black px-3 py-1.5 text-[12px] font-bold text-white"
                    >
                      {c.feedbackReasonSubmit}
                    </button>
                    <button
                      type="button"
                      onClick={() => void commitBriefingFeedback("dislike", null)}
                      className="rounded-full bg-black/5 px-3 py-1.5 text-[12px] font-semibold text-[#374151]"
                    >
                      {c.feedbackReasonSkip}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )
        ) : null}
      </section>

      <section className="flex min-h-0 flex-1 flex-col px-4 py-4" aria-labelledby="notes-heading">
        <h2 id="notes-heading" className="text-[13px] font-bold tracking-wide">
          {c.notesTitle}
        </h2>
        <div className="mt-3 flex-1 space-y-3">
          {notes.length === 0 ? (
            <p className="text-[13px] text-[#6B7280]">{c.notesEmpty}</p>
          ) : (
            notes.map((note) => {
              const showAttachOnlyBadge =
                note.type === "file" &&
                editingNoteId !== note.id &&
                !note.analysis?.trim() &&
                !isReadableAttachment({
                  type: note.media?.[0]?.mime || "",
                  name: note.media?.[0]?.name || note.fileName || "",
                });
              return (
              <article
                key={note.id}
                className="relative rounded-2xl bg-white px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
              >
                {showAttachOnlyBadge ? (
                  <span
                    className="absolute right-3 top-3 z-[1] rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-medium text-[#6B7280]"
                    title={c.fileAttachOnlyHint}
                  >
                    {c.fileAttachOnly || "已保存"}
                  </span>
                ) : null}
                {editingNoteId === note.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingText}
                      onChange={(event) => setEditingText(event.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-black/10 bg-[#FAF6F1] px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-black/30"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={saveEditNote}
                        aria-label={c.noteSave}
                        title={c.noteSave}
                        className="inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full bg-black text-white hover:bg-black/85"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(null);
                          setEditingText("");
                        }}
                        aria-label={c.noteCancel}
                        title={c.noteCancel}
                        className="inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A]"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p
                      className={`whitespace-pre-wrap text-[14px] leading-relaxed ${
                        showAttachOnlyBadge ? "pr-14" : ""
                      } ${
                        (note.type === "audio" &&
                          !note.transcript?.trim() &&
                          !note.text?.trim() &&
                          noteBusy) ||
                        (note.type === "photo" && mediaBusyIds[note.id] === "caption")
                          ? "font-semibold text-[#4B5563] animate-pulse"
                          : ""
                      }`}
                    >
                      {note.transcript?.trim() ||
                        note.text?.trim() ||
                        note.analysis?.trim() ||
                        (note.type === "audio"
                          ? noteBusy
                            ? t.composer.transcribing
                            : "…"
                          : note.type === "photo"
                            ? mediaBusyIds[note.id] === "caption"
                              ? c.autoCaptioning || "…"
                              : "📷"
                            : note.type === "video"
                              ? "▶"
                              : note.fileName) ||
                        "…"}
                    </p>
                    {note.type === "photo" &&
                    note.analysis?.trim() &&
                    note.text?.trim() &&
                    note.analysis.trim() !== note.text.trim() ? (
                      <p className="mt-1 text-[12px] text-[#6B7280]">
                        {c.autoCaptionLabel || "AI"}: {note.analysis.trim()}
                      </p>
                    ) : null}
                    {note.type === "file" && note.analysis?.trim() ? (
                      <p className="mt-1 whitespace-pre-wrap text-[12px] text-[#6B7280]">
                        {note.analysis.trim().slice(0, 600)}
                        {note.analysis.trim().length > 600 ? "…" : ""}
                      </p>
                    ) : null}
                    {/* Audio notes surface as transcript text — no mic/player chrome. */}
                    {note.type === "audio" || note.type === "file" ? null : (
                      <NoteMedia message={note} />
                    )}
                  </>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[10px] leading-8 text-[#9CA3AF]">
                    {new Date(note.timestamp).toLocaleString()}
                  </p>
                  {editingNoteId !== note.id ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {note.type === "file" ? (
                        <NoteFileActions
                          message={note}
                          openLabel={c.openAttachment}
                          downloadLabel={c.downloadAttachment}
                        />
                      ) : null}
                      {note.type === "file" &&
                      !note.analysis?.trim() &&
                      isReadableAttachment({
                        type: note.media?.[0]?.mime || "",
                        name: note.media?.[0]?.name || note.fileName || "",
                      }) ? (
                        <button
                          type="button"
                          disabled={Boolean(mediaBusyIds[note.id])}
                          onClick={() => void readAttachedFile(note)}
                          aria-label={
                            mediaBusyIds[note.id] === "read"
                              ? c.readingFile
                              : c.readFile
                          }
                          title={c.readFileHint}
                          className={`${noteActionIconClass} disabled:opacity-40 ${
                            mediaBusyIds[note.id] === "read" ? "text-[#1D4ED8]" : ""
                          }`}
                        >
                          {mediaBusyIds[note.id] === "read" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <FileSearch className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                      ) : null}
                      {canEditNote(note) ? (
                        <button
                          type="button"
                          onClick={() => beginEditNote(note)}
                          aria-label={c.noteEdit}
                          title={c.noteEdit}
                          className={noteActionIconClass}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => deleteNote(note.id)}
                        aria-label={c.noteDelete}
                        title={c.noteDelete}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#9CA3AF] hover:bg-[#FEE2E2] hover:text-[#991B1B]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
              );
            })
          )}
          <div ref={notesEndRef} />
        </div>
      </section>

      <section className="border-t border-black/8 px-4 py-4" aria-labelledby="report-heading">
        <h2 id="report-heading" className="text-[13px] font-bold tracking-wide">
          {c.reportTitle}
        </h2>
        <div className="mt-3 rounded-2xl bg-white px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
          <p className="text-[12px] font-bold text-[#374151]">{c.reportYourRating}</p>
          <div className="mt-1.5 flex items-center gap-1" role="group" aria-label={c.reportYourRating}>
            {[1, 2, 3, 4, 5].map((n) => {
              const active = (thread?.overallRating ?? 0) >= n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`${c.reportYourRating}: ${n} / 5`}
                  aria-pressed={(thread?.overallRating ?? null) === n}
                  onClick={() =>
                    setOverallRating(thread?.overallRating === n ? null : n)
                  }
                  className="inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full active:bg-black/5"
                >
                  <Star
                    className={`h-6 w-6 ${
                      active
                        ? "fill-[#B45309] text-[#B45309]"
                        : "fill-none text-[#D1D5DB]"
                    }`}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </div>
        {!shownReport ? (
          <p className="mt-2 text-[13px] text-[#6B7280]">{c.reportNone}</p>
        ) : (
          <div className="mt-3 space-y-3 rounded-2xl bg-white px-4 py-4 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
            {reportStale ? (
              <p className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-[12px] font-semibold text-[#92400E]">
                {c.reportStale}
              </p>
            ) : null}
            {shownReport.version != null ? (
              <p className="text-[11px] text-[#6B7280]">
                {c.reportVersion.replace("{n}", String(shownReport.version))}
                {shownReport.generatedAt
                  ? ` · ${new Date(shownReport.generatedAt).toLocaleString()}`
                  : null}
              </p>
            ) : shownReport.generatedAt ? (
              <p className="text-[11px] text-[#6B7280]">
                {new Date(shownReport.generatedAt).toLocaleString()}
              </p>
            ) : null}
            <ReportSectionsView
              report={shownReport}
              labels={{
                overview: c.reportOverview,
                interior: c.reportInterior,
                outdoorLand: c.reportOutdoorLand,
                transitLifestyle: c.reportTransitLifestyle,
                pricing: c.reportPricing,
                pros: c.reportPros,
                risks: c.reportRisks,
                scores: c.reportScores,
                highlight: c.reportHighlight,
                biggestQuestion: c.reportBiggestQuestion,
                overall: c.reportOverall,
                verdict: c.reportVerdict,
                nextSteps: c.reportNextSteps,
                meta: {
                  viewingDate: c.reportMetaViewingDate,
                  propertyType: c.reportMetaPropertyType,
                  yearBuilt: c.reportMetaYearBuilt,
                  askingPrice: c.reportMetaAskingPrice,
                  lotSize: c.reportMetaLotSize,
                  interiorSize: c.reportMetaInteriorSize,
                  layout: c.reportMetaLayout,
                  neighborhood: c.reportMetaNeighborhood,
                },
              }}
              className="text-[14px]"
            />
            {(shownReport.mediaRefs?.length ?? 0) > 0 ? (
              <div>
                <p className="mb-1 text-[12px] font-bold text-[#374151]">{c.reportMedia}</p>
                <ReportGallery
                  refs={shownReport.mediaRefs ?? []}
                  openLabel={c.openAttachment}
                  downloadLabel={c.downloadAttachment}
                />
              </div>
            ) : null}
            <div className="flex items-center gap-1 pt-1">
              <div
                className="flex items-center gap-1"
                role="group"
                aria-label={`${c.reportLike} / ${c.reportDislike}`}
              >
                <button
                  type="button"
                  onClick={() => setReportFeedback("like")}
                  aria-label={c.reportLike}
                  title={c.reportLike}
                  aria-pressed={shownReport.feedback === "like"}
                  className={`inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full transition ${
                    shownReport.feedback === "like"
                      ? "bg-[#1A1A1A] text-white"
                      : "text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A]"
                  }`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setReportFeedback("dislike")}
                  aria-label={c.reportDislike}
                  title={c.reportDislike}
                  aria-pressed={shownReport.feedback === "dislike"}
                  className={`inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full transition ${
                    shownReport.feedback === "dislike"
                      ? "bg-[#1A1A1A] text-white"
                      : "text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A]"
                  }`}
                >
                  <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <button
                type="button"
                onClick={() => void requestShare()}
                aria-label={c.shareReport}
                title={c.shareReport}
                className="ml-auto inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full bg-black text-white hover:bg-black/85"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            {feedbackPrompt === "report" ? (
              <div className="space-y-2 rounded-xl bg-[#FAF6F1] px-3 py-3">
                <textarea
                  value={feedbackReasonDraft}
                  onChange={(event) => setFeedbackReasonDraft(event.target.value)}
                  rows={2}
                  maxLength={280}
                  placeholder={c.feedbackReasonPlaceholder}
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-[13px] outline-none focus:border-black/30"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void commitReportFeedback("dislike", feedbackReasonDraft.trim() || null)}
                    className="rounded-full bg-black px-3 py-1.5 text-[12px] font-bold text-white"
                  >
                    {c.feedbackReasonSubmit}
                  </button>
                  <button
                    type="button"
                    onClick={() => void commitReportFeedback("dislike", null)}
                    className="rounded-full bg-black/5 px-3 py-1.5 text-[12px] font-semibold text-[#374151]"
                  >
                    {c.feedbackReasonSkip}
                  </button>
                </div>
              </div>
            ) : null}
            <ShareReportCommentsPanel
              viewingId={viewingId}
              labels={{
                title: c.shareCommentsTitle,
                empty: c.shareCommentsEmpty,
                guestDefault: c.shareCommentsGuestDefault,
                loadFailed: c.shareCommentsLoadFailed,
              }}
            />
          </div>
        )}
        <button
          type="button"
          disabled={reportBusy || notes.length === 0 || reportUpToDate}
          onClick={() => void generateReport()}
          title={
            notes.length === 0
              ? c.generateReportNeedNotes
              : reportUpToDate
                ? c.generateReportUpToDate
                : undefined
          }
          aria-describedby={
            notes.length === 0
              ? "generate-report-need-notes"
              : reportUpToDate
                ? "generate-report-up-to-date"
                : undefined
          }
          aria-busy={reportBusy || undefined}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-black text-[14px] font-bold text-white disabled:opacity-40"
        >
          {reportBusy ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          ) : null}
          {reportBusy ? c.generatingReport : c.generateReport}
        </button>
        {notes.length === 0 && !reportBusy ? (
          <p
            id="generate-report-need-notes"
            className="mt-2 text-center text-[12px] font-semibold text-[#6B7280]"
            role="status"
          >
            {c.generateReportNeedNotes}
          </p>
        ) : null}
        {reportUpToDate && !reportBusy ? (
          <p
            id="generate-report-up-to-date"
            className="mt-2 text-center text-[12px] font-semibold text-[#6B7280]"
            role="status"
          >
            {c.generateReportUpToDate}
          </p>
        ) : null}
        {guestSaveHint && !userId && thread ? (
          <div
            className="mt-2 space-y-2 rounded-xl bg-[#FEF3C7] px-3 py-2.5 text-center"
            role="status"
          >
            <p className="text-[12px] font-semibold text-[#92400E]">
              {guestDaysLeft(thread) <= 1
                ? c.guestLocalNoticeToday
                : c.guestLocalNotice.replace(
                    "{days}",
                    String(guestDaysLeft(thread)),
                  )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={`/login?mode=signup&next=${encodeURIComponent(`/viewings/${viewingId}`)}`}
                className="inline-flex rounded-full bg-[#1A1A1A] px-3 py-1.5 text-[12px] font-bold text-white"
              >
                {c.guestLocalSave}
              </a>
              <button
                type="button"
                onClick={() => setGuestSaveHint(false)}
                className="text-[12px] font-semibold text-[#92400E] underline underline-offset-2"
              >
                {c.guestLimitCancel}
              </button>
            </div>
          </div>
        ) : null}
        {sharePublishHint ? (
          <div
            className="mt-2 space-y-2 rounded-xl bg-[#FEF3C7] px-3 py-2.5 text-center"
            role="status"
          >
            <p className="text-[12px] font-semibold text-[#92400E]">{c.sharePublishAfterReport}</p>
            <a
              href="/shares"
              className="inline-flex text-[12px] font-bold text-[#92400E] underline underline-offset-2"
            >
              {c.shareHubCta}
            </a>
          </div>
        ) : null}
        {status ? (
          <p className="mt-2 text-center text-[12px] font-semibold text-[#92400E]" role="status">
            {status}
          </p>
        ) : null}
      </section>

      <div className="sticky bottom-0 border-t border-black/8 bg-[#FAF6F1]">
        <ViewingChatComposer
          edgeToBottom
          busy={noteBusy}
          processing={noteBusy}
          processingHint={noteProcessingHint}
          permissionCopy={t.permissions}
          labels={{
            placeholder: c.notesEmpty,
            send: c.send,
            recording: c.recording,
            voiceToText: c.voiceToText,
            stop: c.stop,
            attach: c.attach,
            camera: c.photo,
            uploadImage: c.photo,
            uploadFile: c.attachFile,
            empty: c.emptyComposer,
            micDenied: c.micDenied,
            importAudio: c.importAudio,
            audioTooLarge: t.composer.audioTooLarge,
            imageTooLarge: t.composer.imageTooLarge,
            imageBadType: t.composer.imageBadType,
            emptyFile: t.mediaImport.emptyFile,
            videoTooLarge: t.mediaImport.videoTooLarge,
            fileTooLarge: t.mediaImport.fileTooLarge,
            processing: c.uploadProcessing,
            uploading: c.uploadProcessing,
          }}
          onSubmit={async (payload) => {
            await appendNote(payload);
          }}
        />
      </div>
      {claimLimitOpen ? (
        <ClaimLimitDialog
          title={c.claimLimitTitle}
          body={c.claimLimitBody}
          upgradeLabel={c.claimLimitUpgrade}
          manageLabel={c.claimLimitManage}
          laterLabel={c.claimLimitLater}
          onLater={() => setClaimLimitOpen(false)}
          onManage={() => {
            setClaimLimitOpen(false);
            router.push("/");
          }}
          onUpgrade={() => {
            setClaimLimitOpen(false);
            void (async () => {
              const result = await startProCheckout("claim_limit");
              if (!result.ok) setStatus(result.error || t.paywall.syncFailed);
            })();
          }}
        />
      ) : null}
      <ShareReportDialog
        open={shareOpen}
        url={shareUrl}
        copied={shareCopied}
        busy={shareBusy}
        error={shareError}
        labels={{
          title: c.shareNoticeTitle,
          copied: c.shareCopied,
          copyFailed: c.shareCopyFailed,
          hubGuide: c.shareHubGuide,
          hubCta: c.shareHubCta,
          close: c.shareClose,
          preparing: c.sharePreparing,
        }}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}
