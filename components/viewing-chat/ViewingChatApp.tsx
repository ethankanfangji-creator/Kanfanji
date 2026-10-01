"use client";

import { ChevronDown, ChevronLeft, ChevronUp, Clipboard, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddressAutocomplete } from "@/components/viewing-wizard/AddressAutocomplete";
import { AddressConfirmationCard } from "@/components/viewing-wizard/AddressConfirmationCard";
import { useI18n } from "@/components/I18nProvider";
import { ChatMessageList } from "@/components/viewing-chat/ChatMessageList";
import { ChatFaces } from "@/components/viewing-chat/ChatFaces";
import { ChatInvite } from "@/components/viewing-chat/ChatInvite";
import { IconRail } from "@/components/viewing-chat/IconRail";
import {
  MobileAccountSheet,
} from "@/components/viewing-chat/shell/MobileAccountSheet";
import {
  MobileBottomNav,
  type MobileNavTabId,
} from "@/components/viewing-chat/shell/MobileBottomNav";
import { MobileHistoryDrawer } from "@/components/viewing-chat/shell/MobileHistoryDrawer";
import { MediaLibraryPanel } from "@/components/viewing-chat/MediaLibraryPanel";
import { PropertySummaryPanel } from "@/components/viewing-chat/PropertySummaryPanel";
import { ReviewCard, type ReviewFieldDraft } from "@/components/viewing-chat/ReviewCard";
import { ViewingChatComposer } from "@/components/viewing-chat/ViewingChatComposer";
import { AI_CONSENT_VERSION } from "@/lib/ai-boundary/client";
import {
  aiErrorUiCopyFromBoundary,
  mapAiErrorToUi,
  type AiUiAction,
} from "@/lib/ai-boundary/map-ai-error-ui";
import { track } from "@/lib/analytics/client";
import type { AddressSource, AnalyticsRegion } from "@/lib/analytics/events";
import type { AddressSuggestion } from "@/lib/address-suggest";
import {
  candidateFromSuggestion,
  type AddressConfirmationCandidate,
  type AddressLookupPayloadLike,
} from "@/lib/address-confirmation";
import { shortenAddressLabel } from "@/lib/shorten-address";
import { toggleChatReaction } from "@/lib/viewing-chat/chat-reactions";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  createLocalThread,
  deleteLocalThread,
  getLocalThread,
  listLocalThreads,
  patchLocalThread,
  saveLocalMessages,
  setLocalThreadPinned,
} from "@/lib/viewing-chat/local-store";
import { addMediaFile, getMediaBlob, removeMediaByThread } from "@/lib/viewing-chat/media-library";
import { uploadViewingFile, appendViewingPath } from "@/lib/media";
import { claimAccountThreads, pullCloudThreads } from "@/lib/viewing-chat/claim-account";
import { deleteViewingThread } from "@/lib/viewing-chat/delete-thread";
import { sameViewingAddress } from "@/lib/viewing-chat/same-address";
import { FREE_VIEWING_LIMIT } from "@/lib/viewing-wizard/free-tier";
import { buildChatStatePayload, pushViewingThread } from "@/lib/viewing-chat/cloud-push";
import { appendChatMessages } from "@/lib/viewing-chat/append-messages";
import { mergeChatMessages } from "@/lib/viewing-chat/merge-messages";
import { GuestLimitDialog } from "@/components/viewing-chat/GuestLimitDialog";
import { ShareReportDialog } from "@/components/viewing-chat/ShareReportDialog";
import { syncWithRetry } from "@/lib/viewing-chat/cloud-sync";
import { guestDaysLeft } from "@/lib/viewing-chat/guest-retention";
import { sweepExpiredGuestThreads } from "@/lib/viewing-chat/sweep-guest-threads";
import {
  createAiMessage,
  createUserMessage,
  messageSearchHaystack,
  type ChatMediaRef,
  type ChatMessage,
  type ChatReplyRef,
  type ViewingChatThread,
} from "@/lib/viewing-chat/types";
import { agendaIdToFieldId } from "@/lib/viewing-chat/collection/field-map";
import { resolveAgendaId } from "@/lib/viewing-chat/agenda-catalog";
import { ConflictingDataAlert } from "@/components/viewing-chat/ConflictingDataAlert";
import type {
  PropertySource,
  PropertyData,
  PipelineStepLog,
  PropertySourceRole,
} from "@/lib/property-source/types";
import type { InitialPropertyReport } from "@/lib/property-source/initial-report-schema";
import type { FieldConflict } from "@/lib/property-source/completeness";
import {
  isSourceSoftFailCode,
  sourceExtractErrorMessage,
} from "@/lib/property-source/error-messages";
import type { PropertyChatStage } from "@/lib/viewing-chat/stage";
import {
  countAgendaProgress,
  inferAgendaMarket,
  openingAgendaActiveId,
  projectAgenda,
} from "@/lib/viewing-chat/agenda";
import { createAgendaLabelResolver } from "@/lib/viewing-chat/agenda-labels";
import { createEmptyPropertyRecord, mergePropertyFacts } from "@/lib/viewing-chat/collection";
import { applyPropertyIntelInferences } from "@/lib/viewing-chat/collection/apply-intel-inferences";
import type {
  PropertyCollectionRecord,
  PropertyFactEvidence,
  PropertyFieldId,
} from "@/lib/viewing-chat/collection/types";
import type { RecordChange } from "@/lib/viewing-chat/collection/orchestrator-types";
import { buildOpeningBubble } from "@/lib/viewing-chat/opening";
import type { PropertyIntel } from "@/lib/property-intel/types";
import type { Locale } from "@/lib/i18n/config";
import { shouldStartNewViewing } from "@/lib/viewing-chat/should-start-new-viewing";
import { isChatFocusMode } from "@/lib/viewing-chat/chat-focus-mode";
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

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function ViewingChatApp() {
  const { messages: t, locale } = useI18n();
  const c = t.chat;
  const router = useRouter();
  const searchParams = useSearchParams();
  const configured = isSupabaseConfigured();
  const shellRef = useRef<HTMLDivElement>(null);

  const [threads, setThreads] = useState<ViewingChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState("");
  const [pendingAddressConfirm, setPendingAddressConfirm] = useState<{
    queryAddress: string;
    candidate: AddressConfirmationCandidate;
    payload: AddressLookupPayloadLike;
    source: AddressSource | null;
    region: AnalyticsRegion | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [conflicts, setConflicts] = useState<FieldConflict[]>([]);
  const [guestLimitOpen, setGuestLimitOpen] = useState(false);
  const [proLimitOpen, setProLimitOpen] = useState(false);
  const [addressCue, setAddressCue] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLinkId, setShareLinkId] = useState<string | null>(null);
  const [shareNeedsRegenerate, setShareNeedsRegenerate] = useState(false);
  const [shareExpires, setShareExpires] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const hoaDocInputRef = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareItemMax, setCompareItemMax] = useState(2);
  const [compareSelectedIds, setCompareSelectedIds] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [mobileNavTab, setMobileNavTab] = useState<MobileNavTabId | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatReplyRef | null>(null);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatMatchIndex, setChatMatchIndex] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [turnErrorActions, setTurnErrorActions] = useState<AiUiAction[]>([]);
  const [lastTurnPayload, setLastTurnPayload] = useState<{
    text: string;
    audio: Blob | null;
    image: File | null;
    file: File | null;
  } | null>(null);
  /** Optimistic user message id — stripped on retry so input is not duplicated */
  const [pendingUserMessageId, setPendingUserMessageId] = useState<string | null>(
    null,
  );
  const [composerHint, setComposerHint] = useState<string | null>(null);
  const chatSearchInputRef = useRef<HTMLInputElement>(null);
  const syncTimers = useRef(new Map<string, number>());
  const threadCreations = useRef(new Map<string, Promise<void>>());
  const requestShareRef = useRef<() => void>(() => undefined);
  const claimNoticeRef = useRef("");

  const active = useMemo(
    () => threads.find((thread) => thread.id === activeId) ?? null,
    [threads, activeId],
  );

  const chatFocusMode = isChatFocusMode({
    hasActiveThread: Boolean(active),
    historyOpen,
    searchOpen,
    mediaOpen,
    accountOpen,
    isMobileViewport,
  });

  const agenda = useMemo(() => {
    if (!active) return [];
    const market = active.agendaMarket ?? inferAgendaMarket(active.address);
    return projectAgenda({
      messages: active.messages,
      activeId: active.agendaActiveId ?? openingAgendaActiveId(market),
      skippedIds: active.agendaSkippedIds ?? [],
      market,
      resolveLabels: createAgendaLabelResolver(c),
    });
  }, [active, c]);

  const chatMatchIds = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase();
    if (!active || !q) return [] as string[];
    return active.messages
      .filter((m) => messageSearchHaystack(m).toLowerCase().includes(q))
      .map((m) => m.id);
  }, [active, chatSearchQuery]);

  const activeChatMatchId =
    chatMatchIds.length > 0
      ? chatMatchIds[Math.min(chatMatchIndex, chatMatchIds.length - 1)] ?? null
      : null;

  useEffect(() => {
    let timer = 0;
    const run = () => {
      void sweepExpiredGuestThreads().then((removed) => {
        if (removed > 0) refreshLocal();
      });
    };
    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    timer = window.setInterval(run, 30 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const claim = await claimAccountThreads(userId);
      await pullCloudThreads(userId);
      if (cancelled) return;
      refreshLocal();
      if (claim.blocked > 0 && !sessionStorage.getItem("kf.claim.notice")) {
        sessionStorage.setItem("kf.claim.notice", "1");
        setStatus(claimNoticeRef.current);
      }
      const threadId = searchParams.get("thread");
      if (threadId) setActiveId(threadId);
      if (searchParams.get("share") !== "1") return;
      if (threadId) setActiveId(threadId);
      window.setTimeout(() => requestShareRef.current(), 0);
      router.replace(threadId ? `/?thread=${threadId}` : "/");
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, searchParams, router]);

  useEffect(() => {
    if (!userId || !activeId) return;
    const threadId = activeId;
    const current = getLocalThread(threadId);
    if (current?.cloud?.state !== "synced") return;
    const supabase = getSupabase();
    if (!supabase) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function subscribe() {
      const {
        data: { session },
      } = await supabase!.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) await supabase!.realtime.setAuth(session.access_token);
      if (cancelled) return;
      channel = supabase!
        .channel(`viewing-chat:${threadId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "viewings",
            filter: `id=eq.${threadId}`,
          },
          () => {
            void (async () => {
              const response = await fetch(`/api/viewing-chat/threads/${threadId}`);
              if (!response.ok) return;
              const row = (await response.json()) as {
                messages?: ChatMessage[];
                revision?: number;
                updated_at?: string;
              };
              const local = getLocalThread(threadId);
              if (!local || !Array.isArray(row.messages)) return;
              if (
                typeof row.revision === "number" &&
                typeof local.cloud?.revision === "number" &&
                row.revision <= local.cloud.revision
              ) {
                return;
              }
              saveLocalMessages(threadId, mergeChatMessages(local.messages, row.messages));
              patchLocalThread(threadId, {
                cloud: {
                  state: "synced",
                  lastSyncedAt: row.updated_at ?? new Date().toISOString(),
                  revision: row.revision,
                },
              });
              refreshLocal();
            })();
          },
        )
        .subscribe();
    }

    void subscribe();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, activeId]);

  useEffect(() => {
    if (!chatSearchOpen) return;
    chatSearchInputRef.current?.focus();
  }, [chatSearchOpen]);

  function closeChatSearch() {
    setChatSearchOpen(false);
    setChatSearchQuery("");
    setChatMatchIndex(0);
  }

  function stepChatMatch(delta: number) {
    if (chatMatchIds.length === 0) return;
    setChatMatchIndex((prev) => {
      const next = (prev + delta + chatMatchIds.length) % chatMatchIds.length;
      return next;
    });
  }

  useEffect(() => {
    setThreads(listLocalThreads());
    const mq = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => {
      const mobile = mq.matches;
      setIsMobileViewport(mobile);
      // Desktop keeps the history rail expanded; mobile keeps the drawer closed.
      setHistoryOpen(!mobile);
    };
    syncViewport();
    mq.addEventListener("change", syncViewport);
    const supabase = getSupabase();
    if (!supabase) {
      return () => mq.removeEventListener("change", syncViewport);
    }
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      mq.removeEventListener("change", syncViewport);
      subscription.unsubscribe();
    };
  }, []);

  // Lock shell to svh so Safari chrome show/hide does not reflow the page.
  // Only follow visualViewport while a text field is focused (soft keyboard).
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const vv = window.visualViewport;

    const clearShellOffset = () => {
      shell.style.height = "";
      shell.style.transform = "";
      setKeyboardOpen(false);
    };

    const syncShellToKeyboard = () => {
      if (!vv || !isTextEditingTarget(document.activeElement)) {
        clearShellOffset();
        return;
      }
      shell.style.height = `${Math.round(vv.height)}px`;
      shell.style.transform = vv.offsetTop ? `translateY(${Math.round(vv.offsetTop)}px)` : "";
      setKeyboardOpen(true);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (isTextEditingTarget(event.target)) syncShellToKeyboard();
    };
    const onFocusOut = () => {
      window.setTimeout(() => {
        if (!isTextEditingTarget(document.activeElement)) clearShellOffset();
      }, 0);
    };

    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", syncShellToKeyboard);
    return () => {
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", syncShellToKeyboard);
      clearShellOffset();
    };
  }, []);

  function closeMobileOverlays() {
    setHistoryOpen(false);
    setSearchOpen(false);
    setMediaOpen(false);
    setAccountOpen(false);
  }

  /** Close a deep panel first; otherwise leave the thread for the empty start state. */
  function exitChatFocus() {
    setReplyTo(null);
    if (
      accountOpen ||
      searchOpen ||
      mediaOpen ||
      (historyOpen && isMobileViewport)
    ) {
      closeMobileOverlays();
      setMobileNavTab(null);
      return;
    }
    startNewProperty();
    setMobileNavTab(null);
  }

  function handleMobileNav(tab: MobileNavTabId) {
    setReplyTo(null);
    setMobileNavTab(tab);
    if (tab === "new") {
      closeMobileOverlays();
      // Already on address setup — keep the draft; do not wipe input.
      if (shouldStartNewViewing(Boolean(active))) {
        startNewProperty();
      }
      return;
    }
    if (tab === "history") {
      setSearchOpen(false);
      setMediaOpen(false);
      setAccountOpen(false);
      setHistoryOpen(true);
      return;
    }
    if (tab === "search") {
      setHistoryOpen(false);
      setMediaOpen(false);
      setAccountOpen(false);
      setSearchOpen(true);
      return;
    }
    if (tab === "media") {
      setHistoryOpen(false);
      setSearchOpen(false);
      setAccountOpen(false);
      setMediaOpen(true);
      return;
    }
    setHistoryOpen(false);
    setSearchOpen(false);
    setMediaOpen(false);
    setAccountOpen(true);
  }

  function refreshLocal() {
    setThreads(listLocalThreads());
  }

  function queueCloudSync(threadId: string) {
    if (!userId) return;
    const previous = syncTimers.current.get(threadId);
    if (previous) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      void pushLocalThread(threadId);
    }, 800);
    syncTimers.current.set(threadId, timer);
  }

  async function pushLocalThread(threadId: string) {
    if (userId) await attachStoredMedia(threadId);
    const thread = getLocalThread(threadId);
    if (!thread || !userId || thread.cloud?.state === "blocked_limit") return;
    const result = await syncWithRetry({
      put: async () => {
        const current = getLocalThread(threadId);
        if (!current) return { status: 404 };
        const pushed = await pushViewingThread({
          threadId,
          address: current.address,
          baseRevision: current.cloud?.revision,
          previouslySynced: current.cloud?.state === "synced" || typeof current.cloud?.revision === "number",
          messages: current.messages,
          chatState: buildChatStatePayload(current),
          clientUpdatedAt: new Date().toISOString(),
          report: current.report,
          metadata: current.metadata,
        });
        if (pushed.deleted) {
          deleteLocalThread(threadId);
          if (activeId === threadId) setActiveId(null);
          return { status: 200 };
        }
        if (pushed.status === 409 && pushed.remote?.messages) {
          const remoteMessages = pushed.remote.messages as ChatMessage[];
          saveLocalMessages(threadId, appendChatMessages(remoteMessages, current.messages));
          patchLocalThread(threadId, {
            cloud: { ...current.cloud, state: "syncing", revision: pushed.revision },
          });
          setStatus(c.syncNewer);
        }
        if (pushed.status >= 200 && pushed.status < 300) {
          patchLocalThread(threadId, {
            ownerUserId: userId,
            cloud: {
              state: "synced",
              lastSyncedAt: new Date().toISOString(),
              revision: pushed.revision,
            },
          });
        }
        return { status: pushed.status };
      },
    });
    if (result !== "synced") {
      patchLocalThread(threadId, { cloud: { state: result } });
    }
    refreshLocal();
  }

  async function uploadChatFile(threadId: string, file: File, mediaId: string, kind: string) {
    if (!userId || kind === "file") return null;
    const creating = threadCreations.current.get(threadId);
    if (creating) await creating;
    const folder = kind === "video" ? "videos" : kind === "audio" ? "audios" : "photos";
    const column = kind === "video" ? "video_urls" : kind === "audio" ? "audio_urls" : "photo_urls";
    const path = await uploadViewingFile(threadId, folder, file, mediaId);
    await appendViewingPath(threadId, column, path);
    return path;
  }

  async function attachStoredMedia(threadId: string) {
    const thread = getLocalThread(threadId);
    if (!thread || !userId) return;
    let changed = false;
    const messages = [];
    for (const message of thread.messages) {
      if (!message.media?.length) {
        messages.push(message);
        continue;
      }
      const media = [];
      for (const ref of message.media) {
        if (ref.path || ref.kind === "file") {
          media.push(ref);
          continue;
        }
        const blob = await getMediaBlob(ref.id);
        if (!blob) {
          media.push(ref);
          continue;
        }
        try {
          const path = await uploadChatFile(threadId, new File([blob], ref.name, { type: ref.mime }), ref.id, ref.kind);
          media.push({ ...ref, path });
          changed = changed || Boolean(path);
        } catch {
          media.push(ref);
        }
      }
      messages.push({ ...message, media });
    }
    if (changed) saveLocalMessages(threadId, messages);
  }

  async function rememberMedia(file: File, threadId: string, address: string) {
    const saved = await addMediaFile(file, threadId, address);
    let path: string | null = null;
    try {
      path = await uploadChatFile(threadId, file, saved.id, saved.kind);
    } catch {
      path = null;
    }
    return {
      id: saved.id,
      kind: saved.kind,
      name: saved.name,
      mime: saved.mime,
      size: saved.size,
      path,
    };
  }

  function startNewProperty() {
    setActiveId(null);
    setAddressDraft("");
    setPendingAddressConfirm(null);
    setStatus("");
    setReplyTo(null);
    closeChatSearch();
  }

  /** Bind a confirmed normalized address to a new local viewing thread. */
  async function bindConfirmedAddress(
    label: string,
    place?: { placeId: string | null; placeSource: string | null },
  ) {
    const trimmed = label.trim();
    if (!trimmed) {
      setStatus(c.needAddress);
      return;
    }
    const pool = listLocalThreads().filter((thread) =>
      userId ? thread.ownerUserId === userId || !thread.ownerUserId : !thread.ownerUserId,
    );
    const duplicate = pool.find(
      (thread) =>
        sameViewingAddress(thread.address, trimmed) ||
        sameViewingAddress(thread.normalizedAddress ?? "", trimmed),
    );
    if (duplicate) {
      setActiveId(duplicate.id);
      setAddressDraft(duplicate.address);
      setPendingAddressConfirm(null);
      setAddressCue(false);
      return;
    }
    if (userId) {
      const gate = await fetch("/api/viewing-chat/threads");
      if (!gate.ok) {
        setStatus(c.syncRetry);
        return;
      }
      const quota = (await gate.json()) as { viewingCount?: number; isPro?: boolean };
      if (!quota.isPro && (quota.viewingCount ?? 0) >= FREE_VIEWING_LIMIT) {
        setProLimitOpen(true);
        return;
      }
    }
    if (!userId) {
      const existingGuest = listLocalThreads().some((thread) => !thread.ownerUserId);
      if (existingGuest) {
        setGuestLimitOpen(true);
        return;
      }
    }
    const market = inferAgendaMarket(trimmed);
    const opening = buildOpeningBubble(trimmed, locale as Locale);
    const seedRecord = createEmptyPropertyRecord({
      address: trimmed,
      mode: "collecting",
      fields: {
        address: {
          fieldId: "address",
          value: trimmed,
          status: "confirmed",
          confidence: 0.95,
          sourceMessageId: null,
          rawText: trimmed,
          updatedAt: new Date().toISOString(),
        },
      },
    });
    const thread = createLocalThread(trimmed, [opening.message], null);
    patchLocalThread(thread.id, {
      stage: "viewing_preparation",
      normalizedAddress: trimmed,
      skippedSources: true,
      agendaActiveId: fieldIdToAgenda(opening.focusFieldIds[0]),
      agendaSkippedIds: [],
      agendaMarket: market,
      propertyRecord: seedRecord,
      propertyEvidence: [],
      collectionSkippedFields: [],
      collectionFocusFieldIds: opening.focusFieldIds,
      lastTurnChanges: [],
      conversationStatus: "collecting",
      turnWarnings: [],
    });
    refreshLocal();
    track({
      name: "viewing_created",
      props: { storage: "local", market },
    });
    setActiveId(thread.id);
    setAddressDraft(trimmed);
    setPendingAddressConfirm(null);
    setStatus("");
    setTurnError(null);
    setTurnErrorActions([]);
    setConflicts([]);

    void enrichAddressIntel(thread.id, trimmed, seedRecord, place);
    if (userId) {
      patchLocalThread(thread.id, { cloud: { state: "syncing" }, ownerUserId: userId });
      const creating = fetch("/api/viewing-chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: thread.id,
          address: trimmed,
          clientUpdatedAt: new Date().toISOString(),
          messages: [opening.message],
          chatState: {
            v: 1,
            normalizedAddress: trimmed,
            stage: "viewing_preparation",
            conversationStatus: "collecting",
            propertyRecord: seedRecord,
          },
        }),
      }).then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { revision?: number };
        const state = response.status === 402 ? "blocked_limit" : response.ok ? "synced" : "failed";
        patchLocalThread(thread.id, {
          ownerUserId: userId,
          cloud: {
            state,
            revision: typeof body.revision === "number" ? body.revision : response.ok ? 1 : undefined,
          },
        });
        refreshLocal();
      }).catch(() => {
        patchLocalThread(thread.id, { cloud: { state: "failed" }, ownerUserId: userId });
        refreshLocal();
      });
      threadCreations.current.set(thread.id, creating);
    }
  }

  function noteQuotaUi(
  ui: { kind?: string; actions?: AiUiAction[] } | null | undefined,
    endpoint: "turn" | "report" | "intel" | "ingest",
  ) {
    if (!ui) return;
    if (ui.kind === "quota") {
      const tier = ui.actions?.includes("sign_in")
        ? "guest"
        : ui.actions?.includes("upgrade")
          ? "free"
          : "pro";
      const limit = ui.actions?.length === 1 && ui.actions[0] === "retry" ? "network" : "tier";
      track({
        name: "ai_quota_exceeded",
        props: { tier, endpoint, limit },
      });
      if (tier === "free" && ui.actions?.includes("upgrade")) {
        track({ name: "paywall_shown", props: { trigger: "ai_quota" } });
      }
    }
  }

  function acceptPendingAddress() {
    if (!pendingAddressConfirm) return;
    const { candidate, source, region } = pendingAddressConfirm;
    if (source && region) {
      track({ name: "address_confirmed", props: { source, region } });
    }
    void bindConfirmedAddress(candidate.displayAddress, {
      placeId: candidate.propertyId,
      placeSource: candidate.source,
    });
  }

  function rejectPendingAddress() {
    if (!pendingAddressConfirm) return;
    const { queryAddress, source, region } = pendingAddressConfirm;
    if (source && region) {
      track({ name: "address_rejected", props: { source, region } });
    }
    setPendingAddressConfirm(null);
    setAddressDraft(queryAddress);
    setStatus("");
  }

  function fieldIdToAgenda(fieldId: PropertyFieldId | undefined): string | null {
    if (!fieldId) return openingAgendaActiveId(inferAgendaMarket(addressDraft || ""));
    const map: Record<string, string> = {
      odor: "q_odor",
      layout: "q_layout",
      noise: "q_noise",
      light: "q_light",
      water_damage: "q_water_damage",
      electrical: "q_electrical",
    };
    return map[fieldId] ?? fieldId;
  }

  async function enrichAddressIntel(
    threadId: string,
    address: string,
    baseRecord: PropertyCollectionRecord,
    place?: { placeId: string | null; placeSource: string | null },
  ) {
    try {
      setStatus(c.externalEnriching);
      const response = await fetch("/api/property-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          viewingId: threadId.startsWith("local_") ? null : threadId,
          includeFactCard: false,
          ...(place?.placeId && place.placeSource
            ? { placeId: place.placeId, placeSource: place.placeSource }
            : {}),
        }),
      });
      if (!response.ok) {
        setStatus("");
        return;
      }
      const data = (await response.json()) as {
        intel?: PropertyIntel | null;
      };
      const facts = applyPropertyIntelInferences(data.intel);
      if (!facts.length) {
        setStatus("");
        return;
      }
      const merged = mergePropertyFacts(baseRecord, facts);
      const changes: RecordChange[] = facts.map((f) => ({
        fieldId: f.fieldId,
        kind: "added" as const,
        nextValue: f.value,
        rawText: f.rawText,
      }));
      patchLocalThread(threadId, {
        propertyRecord: merged.record,
        propertyEvidence: merged.evidence,
        metadata: data.intel ?? null,
        lastTurnChanges: changes,
      });
      refreshLocal();
      setStatus("");
    } catch {
      setStatus("");
    }
  }

  function openReviewCard() {
    if (!active || busy || active.messages.length === 0) return;
    if (active.conversationStatus === "reviewing") {
      setSummaryOpen(true);
      return;
    }
    const last = active.messages[active.messages.length - 1];
    const alreadyHint = last?.role === "ai" && last.text === c.reviewHint;
    const msg = alreadyHint
      ? null
      : createAiMessage({
          type: "follow_up",
          text: c.reviewHint,
        });
    patchLocalThread(active.id, {
      conversationStatus: "reviewing",
      propertyRecord: active.propertyRecord
        ? { ...active.propertyRecord, mode: "confirming" }
        : active.propertyRecord,
      messages: msg ? [...active.messages, msg] : active.messages,
    });
    refreshLocal();
    setSummaryOpen(true);
  }

  function applyReviewDrafts(drafts: ReviewFieldDraft[]) {
    if (!active) return;
    const base =
      active.propertyRecord ??
      createEmptyPropertyRecord({ address: active.address });
    const fields = { ...base.fields };
    const now = new Date().toISOString();
    for (const draft of drafts) {
      fields[draft.fieldId] = {
        fieldId: draft.fieldId,
        value: draft.value.trim() ? draft.value.trim() : null,
        status: draft.status,
        confidence: draft.status === "confirmed" ? 0.95 : 0.2,
        sourceMessageId: null,
        rawText: draft.value.trim() || draft.fieldId,
        updatedAt: now,
        hasConflict: false,
      };
    }
    const nextRecord = {
      ...base,
      fields,
      mode: "confirming" as const,
      updatedAt: now,
    };
    patchLocalThread(active.id, {
      propertyRecord: nextRecord,
      conversationStatus: "reviewing",
    });
    refreshLocal();
    void generateReport({
      record: nextRecord,
      skippedFields: active.collectionSkippedFields ?? [],
    });
  }

  async function ingestSource(opts: {
    sourceType: "listing_url" | "user_text" | "image" | "pdf" | "chat_message";
    text?: string;
    url?: string;
    file?: File | null;
    sourceRole?: PropertySourceRole | null;
  }) {
    if (!active) {
      setStatus(c.needAddress);
      return;
    }
    setSourceBusy(true);
    setStatus(c.sourceExtracting);
    try {
      const form = new FormData();
      form.append("sourceType", opts.sourceType);
      if (opts.sourceRole) form.append("sourceRole", opts.sourceRole);
      form.append("address", active.address);
      form.append("locale", locale);
      form.append("consentVersion", AI_CONSENT_VERSION);
      form.append("consentSessionId", consentSessionId());
      form.append("identityKind", userId ? "user" : "guest");
      form.append("existingSources", JSON.stringify(active.sources ?? []));
      if (active.propertyData) {
        form.append("existingData", JSON.stringify(active.propertyData));
      }
      if (opts.text) form.append("text", opts.text);
      if (opts.url) form.append("url", opts.url);
      if (opts.file) form.append("file", opts.file);

      const userMsg = createUserMessage({
        type:
          opts.sourceType === "image"
            ? "photo"
            : opts.sourceType === "listing_url"
              ? "text"
              : opts.file
                ? "file"
                : "text",
        text:
          opts.url ||
          opts.text ||
          (opts.file
            ? opts.sourceRole === "hoa_doc"
              ? `${c.quickUploadHoaDoc}: ${opts.file.name}`
              : opts.file.name
            : c.sourceAdded),
        fileName: opts.file?.name,
      });
      if (opts.file) {
        userMsg.media = [await rememberMedia(opts.file, active.id, active.address)];
      }
      saveLocalMessages(active.id, [...active.messages, userMsg]);
      refreshLocal();

      const response = await fetch("/api/property-source/ingest", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as {
        source?: PropertySource;
        sources?: PropertySource[];
        propertyData?: PropertyData;
        steps?: PipelineStepLog[];
        conflicts?: FieldConflict[];
        report?: InitialPropertyReport | null;
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        const ui = mapAiErrorToUi(
          {
            code: data.code,
            status: response.status,
            error: data.error,
            tier: (data as { tier?: "guest" | "free" | "pro" }).tier,
            limit: (data as { limit?: "tier" | "network" }).limit,
            resetsAt: (data as { resetsAt?: string | null }).resetsAt,
          },
          aiErrorUiCopyFromBoundary(t.aiBoundary),
          { isAuthenticated: Boolean(userId), locale },
        );
        throw Object.assign(new Error(ui.message), { aiUi: ui });
      }

      const errors = data.source?.extractionErrors ?? [];
      const softFail = errors.some((code) => isSourceSoftFailCode(code));
      const statusText = softFail
        ? sourceExtractErrorMessage(errors[0]!, locale)
        : errors.length
          ? `${c.sourcePartial}\n${sourceExtractErrorMessage(errors[0]!, locale)}`
          : c.sourceAddedOk;

      const statusMsg = createAiMessage({
        type: "source_status",
        text: statusText,
        analysis: data.source?.extractedText
          ? data.source.extractedText.slice(0, 280)
          : data.source?.sourceUrl
            ? `${c.sourceUrlRecorded}: ${data.source.sourceUrl}`
            : undefined,
      });

      const nextMessages = [...active.messages, userMsg, statusMsg];
      let stage: PropertyChatStage = "collecting_sources";
      if (data.steps?.some((s) => s.status === "running")) stage = "extracting_data";
      if ((data.conflicts?.length ?? 0) > 0) stage = "awaiting_user_confirmation";

      patchLocalThread(active.id, {
        messages: nextMessages,
        sources: data.sources ?? active.sources,
        propertyData: data.propertyData ?? active.propertyData,
        pipelineSteps: data.steps ?? active.pipelineSteps,
        stage,
        initialReport: data.report ?? active.initialReport,
      });
      setConflicts(data.conflicts ?? []);
      refreshLocal();
      setStatus("");
    } catch (error) {
      const aiUi =
        error && typeof error === "object" && "aiUi" in error
          ? (error as { aiUi: { kind?: string; message: string; actions: AiUiAction[] } }).aiUi
          : null;
      const message =
        aiUi?.message ?? (error instanceof Error ? error.message : c.sourceIngestFailed);
      setStatus(message);
      setTurnError(message);
      setTurnErrorActions(aiUi?.actions ?? ["retry"]);
      noteQuotaUi(aiUi, "ingest");
    } finally {
      setSourceBusy(false);
    }
  }

  function onSelectSuggestion(
    suggestion: AddressSuggestion,
    index: number,
    region: AnalyticsRegion,
  ) {
    const candidate = candidateFromSuggestion(suggestion, suggestion.label);
    if (!candidate) {
      setStatus(t.address.suggestError);
      return;
    }
    const source = suggestion.source;
    setPendingAddressConfirm({
      queryAddress: suggestion.label,
      candidate,
      source,
      region,
      payload: {
        displayAddress: candidate.displayAddress,
        propertyId: candidate.propertyId ?? undefined,
        market: candidate.market ?? undefined,
        source: candidate.source ?? undefined,
        details: { lat: candidate.lat, lng: candidate.lng },
      },
    });
    setAddressDraft(candidate.displayAddress);
    setStatus("");
    track({
      name: "address_suggestion_selected",
      props: { source, region, rank: index },
    });
  }

  function onCommitAddressDraft(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    setStatus(t.address.suggestEmpty);
  }

  async function submitTurn(payload: {
    text: string;
    audio: Blob | null;
    image: File | null;
    file: File | null;
  }) {
    if (!active) {
      setStatus(c.needAddress);
      return;
    }
    setBusy(true);
    setStatus(
      payload.image || payload.file || payload.audio
        ? c.uploadProcessing
        : c.turnProcessing,
    );
    setTurnError(null);
    setTurnErrorActions([]);
    setLastTurnPayload(payload);
    setComposerHint(null);

    // Save raw user message first (local) so refresh / AI failure cannot erase input
    const priorMessages = pendingUserMessageId
      ? active.messages.filter((m) => m.id !== pendingUserMessageId)
      : active.messages;
    const fileNote = payload.file
      ? locale.startsWith("en")
        ? `[Uploaded file: ${payload.file.name}]`
        : `【已上傳檔案：${payload.file.name}】`
      : "";
    const textForAi = [payload.text, fileNote].filter(Boolean).join("\n");
    const media: ChatMediaRef[] = [];
    const remember = async (blob: Blob, name: string) => {
      const file = blob instanceof File ? blob : new File([blob], name, { type: blob.type || "application/octet-stream" });
      media.push(await rememberMedia(file, active.id, active.address));
    };
    if (payload.image) await remember(payload.image, payload.image.name);
    if (payload.file) await remember(payload.file, payload.file.name);
    if (payload.audio) {
      await remember(
        payload.audio,
        payload.audio instanceof File ? payload.audio.name : "note.webm",
      );
    }
    const optimisticUser = createUserMessage({
      type: payload.image
        ? "photo"
        : payload.audio
          ? "audio"
          : payload.file
            ? "file"
            : "text",
      text: textForAi.trim() || undefined,
      fileName: payload.file?.name,
      replyTo: replyTo ?? undefined,
      media: media.length ? media : undefined,
    });
    setPendingUserMessageId(optimisticUser.id);
    saveLocalMessages(active.id, [...priorMessages, optimisticUser]);
    refreshLocal();

    try {
      const form = new FormData();
      form.append("address", active.address);
      form.append("locale", locale);
      form.append("viewingId", active.id.startsWith("local_") ? "" : active.id);
      form.append("text", textForAi);
      // Send prior messages only — server appends the canonical user message
      form.append("messages", JSON.stringify(priorMessages));
      form.append("consentVersion", AI_CONSENT_VERSION);
      form.append("consentSessionId", consentSessionId());
      form.append("identityKind", userId ? "user" : "guest");
      form.append("agendaActiveId", active.agendaActiveId ?? "");
      form.append(
        "agendaSkippedIds",
        JSON.stringify(active.agendaSkippedIds ?? []),
      );
      form.append(
        "agendaMarket",
        active.agendaMarket ?? inferAgendaMarket(active.address),
      );
      form.append(
        "propertyRecord",
        JSON.stringify(active.propertyRecord ?? null),
      );
      form.append(
        "propertyEvidence",
        JSON.stringify(active.propertyEvidence ?? []),
      );
      form.append(
        "collectionSkippedFields",
        JSON.stringify(active.collectionSkippedFields ?? []),
      );
      form.append(
        "collectionFocusFieldIds",
        JSON.stringify(active.collectionFocusFieldIds ?? []),
      );
      form.append(
        "pendingConfirm",
        JSON.stringify(active.pendingConfirm ?? null),
      );
      if (replyTo) {
        form.append("replyTo", JSON.stringify(replyTo));
        form.append("replyToMessageId", replyTo.messageId);
        const target = priorMessages.find((message) => message.id === replyTo.messageId);
        const fieldIds =
          target?.role === "ai"
            ? (target.matched ?? []).map((row) =>
                agendaIdToFieldId(resolveAgendaId(row.id) ?? row.id),
              )
            : Object.values(active.propertyRecord?.fields ?? {})
                .filter((field) => field?.sourceMessageId === replyTo.messageId)
                .map((field) => field?.fieldId);
        form.append("replyToFieldIds", JSON.stringify(fieldIds.slice(0, 8)));
      }
      if (payload.file && payload.file.type === "application/pdf") {
        form.append("file", payload.file, payload.file.name);
      }
      if (payload.audio) {
        form.append(
          "audio",
          payload.audio,
          payload.audio instanceof File ? payload.audio.name : "note.webm",
        );
      }
      if (payload.image) form.append("image", payload.image);

      const response = await fetch("/api/viewing-chat/turn", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as {
        userMessage?: ChatMessage;
        messages?: ChatMessage[];
        agendaActiveId?: string | null;
        agendaSkippedIds?: string[];
        propertyRecord?: PropertyCollectionRecord | null;
        propertyEvidence?: PropertyFactEvidence[];
        collectionSkippedFields?: PropertyFieldId[];
        changes?: RecordChange[];
        conversationStatus?: ViewingChatThread["conversationStatus"];
        turnWarnings?: string[];
        extractionStatus?: "ok" | "extraction_failed";
        collectionFocusFieldIds?: PropertyFieldId[];
        pendingConfirm?: ViewingChatThread["pendingConfirm"];
        persisted?: boolean;
        error?: string;
        code?: string;
      };
      if (!response.ok || !data.messages) {
        const ui = mapAiErrorToUi(
          {
            code: data.code,
            status: response.status,
            error: data.error,
            tier: (data as { tier?: "guest" | "free" | "pro" }).tier,
            limit: (data as { limit?: "tier" | "network" }).limit,
            resetsAt: (data as { resetsAt?: string | null }).resetsAt,
          },
          aiErrorUiCopyFromBoundary(t.aiBoundary),
          { isAuthenticated: Boolean(userId), locale },
        );
        throw Object.assign(new Error(ui.message), { aiUi: ui });
      }
      const kind = payload.image
        ? "photo"
        : payload.audio
          ? "audio"
          : payload.file
            ? "file"
            : "text";
      track({
        name: "ai_message_sent",
        props: { kind, is_reply: Boolean(replyTo) },
      });
      const nextMessages = data.messages.map((message) => {
        if (!data.userMessage || message.id !== data.userMessage.id) return message;
        return {
          ...message,
          media: media.length ? media : message.media,
          replyTo: replyTo ?? message.replyTo,
          type: optimisticUser.type,
          fileName: optimisticUser.fileName ?? message.fileName,
        };
      });

      saveLocalMessages(active.id, nextMessages);
      if (userId && data.persisted === false) queueCloudSync(active.id);
      setPendingUserMessageId(null);
      patchLocalThread(active.id, {
        agendaActiveId:
          data.agendaActiveId !== undefined
            ? data.agendaActiveId
            : active.agendaActiveId,
        agendaSkippedIds:
          data.agendaSkippedIds !== undefined
            ? data.agendaSkippedIds
            : active.agendaSkippedIds,
        propertyRecord:
          data.propertyRecord !== undefined
            ? data.propertyRecord
            : active.propertyRecord,
        propertyEvidence:
          data.propertyEvidence !== undefined
            ? data.propertyEvidence
            : active.propertyEvidence,
        collectionSkippedFields:
          data.collectionSkippedFields !== undefined
            ? data.collectionSkippedFields
            : active.collectionSkippedFields,
        collectionFocusFieldIds:
          data.collectionFocusFieldIds !== undefined
            ? data.collectionFocusFieldIds
            : active.collectionFocusFieldIds,
        pendingConfirm:
          data.pendingConfirm !== undefined
            ? data.pendingConfirm
            : active.pendingConfirm,
        lastTurnChanges: data.changes ?? [],
        conversationStatus:
          data.conversationStatus ?? active.conversationStatus ?? "collecting",
        turnWarnings: data.turnWarnings ?? [],
      });
      refreshLocal();
      setReplyTo(null);

      if (
        data.extractionStatus === "extraction_failed" ||
        data.turnWarnings?.includes("extraction_failed")
      ) {
        setTurnError(c.extractionFailed);
        setTurnErrorActions(["retry"]);
        // Keep lastTurnPayload so retry stays available
      } else {
        setLastTurnPayload(null);
      }

      if (data.conversationStatus === "reviewing") {
        setSummaryOpen(true);
      }
    } catch (error) {
      // Optimistic user message already saved — keep it visible
      const aiUi =
        error && typeof error === "object" && "aiUi" in error
          ? (error as { aiUi: { kind?: string; message: string; actions: AiUiAction[] } }).aiUi
          : null;
      const message = aiUi?.message ?? (error instanceof Error ? error.message : c.turnFailed);
      setStatus(message);
      setTurnError(message);
      setTurnErrorActions(aiUi?.actions ?? ["retry"]);
      noteQuotaUi(aiUi, "turn");
    } finally {
      setBusy(false);
    }
  }

  async function generateReport(override?: {
    record?: PropertyCollectionRecord;
    skippedFields?: string[];
  }) {
    if (!active) return;
    const progress = countAgendaProgress(agenda);
    if (progress.highPending > 0) {
      const ok = window.confirm(
        c.agendaFinishWarn.replace("{count}", String(progress.highPending)),
      );
      if (!ok) return;
    }
    const record = override?.record ?? active.propertyRecord;
    setBusy(true);
    setStatus(c.generatingReport);
    try {
      const response = await fetch("/api/viewing-chat/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: active.address,
          locale,
          viewingId: active.id.startsWith("local_") ? "" : active.id,
          messages: active.messages,
          propertyRecord: record ?? null,
          skippedFields: override?.skippedFields ?? active.collectionSkippedFields ?? [],
          propertyData: active.propertyData ?? null,
          consentVersion: AI_CONSENT_VERSION,
          consentSessionId: consentSessionId(),
          identityKind: userId ? "user" : "guest",
        }),
      });
      const data = (await response.json()) as {
        messages?: ChatMessage[];
        report?: ViewingChatThread["report"];
        error?: string;
        code?: string;
      };
      if (!response.ok || !data.messages) {
        const ui = mapAiErrorToUi(
          {
            code: data.code,
            status: response.status,
            error: data.error,
            tier: (data as { tier?: "guest" | "free" | "pro" }).tier,
            limit: (data as { limit?: "tier" | "network" }).limit,
            resetsAt: (data as { resetsAt?: string | null }).resetsAt,
          },
          aiErrorUiCopyFromBoundary(t.aiBoundary),
          { isAuthenticated: Boolean(userId), locale },
        );
        throw Object.assign(new Error(ui.message), { aiUi: ui });
      }
      saveLocalMessages(active.id, data.messages, data.report ?? null);
      patchLocalThread(active.id, {
        stage: "report_ready",
        conversationStatus: "completed",
      });
      refreshLocal();
      setStatus("");
    } catch (error) {
      const aiUi =
        error && typeof error === "object" && "aiUi" in error
          ? (error as { aiUi: { kind?: string; message: string; actions: AiUiAction[] } }).aiUi
          : null;
      const message =
        aiUi?.message ?? (error instanceof Error ? error.message : c.reportFailed);
      setStatus(message);
      setTurnError(message);
      setTurnErrorActions(aiUi?.actions ?? ["retry"]);
      noteQuotaUi(aiUi, "report");
    } finally {
      setBusy(false);
    }
  }

  async function handleAiErrorAction(action: AiUiAction) {
    if (action === "retry") {
      if (lastTurnPayload) void submitTurn(lastTurnPayload);
      return;
    }
    if (action === "sign_in") {
      const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      window.location.href = `/login?mode=signup&next=${next}`;
      return;
    }
    if (action === "upgrade") {
      if (!userId) {
        window.location.href = "/login";
        return;
      }
      try {
        const response = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger: "ai_quota" }),
        });
        const payload = (await response.json()) as { url?: string; error?: string };
        if (payload.url) {
          window.location.href = payload.url;
          return;
        }
        setStatus(payload.error || t.paywall.syncFailed);
      } catch {
        setStatus(t.paywall.syncFailed);
      }
    }
  }

  async function requestShare() {
    const queryThread = searchParams.get("thread");
    const target = active ?? (queryThread ? listLocalThreads().find((item) => item.id === queryThread) ?? null : null);
    if (!target) return;
    if (!configured || !userId) {
      router.push(`/login?next=${encodeURIComponent(`/?thread=${target.id}&share=1`)}`);
      return;
    }
    if (target.cloud?.state && target.cloud.state !== "synced") {
      await pushLocalThread(target.id);
      const refreshed = getLocalThread(target.id);
      if (!refreshed || refreshed.cloud?.state !== "synced") {
        setStatus(refreshed?.cloud?.state === "blocked_limit" ? c.shareBlockedLimit : c.syncRetry);
        return;
      }
    }
    setShareError(null);
    setShareOpen(true);
    void fetch(`/api/share/links?viewingId=${encodeURIComponent(target.id)}`).then(async (response) => {
      if (!response.ok) return;
      const data = (await response.json()) as {
        url?: string | null;
        needsRegenerate?: boolean;
        link?: { id?: string; expiresAt?: string | null };
      };
      setShareLinkId(data.link?.id ?? null);
      setShareNeedsRegenerate(Boolean(data.needsRegenerate));
      setShareExpires(data.link?.expiresAt ?? null);
      setShareUrl(data.url ? `${window.location.origin}${data.url}` : null);
    });
  }
  requestShareRef.current = requestShare;
  claimNoticeRef.current = c.claimLimitNotice;

  function selectThread(id: string) {
    setActiveId(id);
    setReplyTo(null);
    closeChatSearch();
    const found = listLocalThreads().find((item) => item.id === id);
    if (found) setAddressDraft(found.address);
    setSearchOpen(false);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setHistoryOpen(false);
      setMobileNavTab(null);
      leaveCompareMode();
    }
  }

  function leaveCompareMode() {
    setCompareMode(false);
    setCompareSelectedIds([]);
  }

  function toggleCompareMode() {
    if (!userId) {
      track({ name: "compare_gate_shown", props: { reason: "login_required", source: "chat_history" } });
      const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      window.location.href = `/login?mode=signup&next=${next}`;
      return;
    }
    setCompareMode((on) => {
      if (on) setCompareSelectedIds([]);
      else {
        void fetch("/api/compare/entitlement")
          .then((response) => response.json())
          .then((body: { maxItems?: number }) => {
            if (body.maxItems) setCompareItemMax(body.maxItems);
          })
          .catch(() => undefined);
      }
      return !on;
    });
  }

  function toggleCompareSelect(id: string) {
    setCompareSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= compareItemMax) {
        track({ name: "compare_gate_shown", props: { reason: "too_many_items", source: "chat_history" } });
        setStatus(compareItemMax <= 2 ? t.compare.gateTooManyFree : t.compare.gateTooManyPro);
        return prev;
      }
      return [...prev, id];
    });
  }

  async function openCompare() {
    if (compareSelectedIds.length < 2) return;
    const response = await fetch("/api/compare/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "chat_history", itemIds: compareSelectedIds }),
    });
    if (response.status === 401) {
      window.location.href = `/login?mode=signup&next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (response.status === 402) {
      track({ name: "compare_gate_shown", props: { reason: "upgrade_required", source: "chat_history" } });
      track({ name: "paywall_shown", props: { trigger: "compare" } });
      setStatus(t.compare.gateUpgradeBody);
      return;
    }
    if (!response.ok) {
      setStatus(t.compare.startFailed);
      return;
    }
    if (compareSelectedIds.length >= 2 && compareSelectedIds.length <= 5) {
      track({
        name: "compare_opened",
        props: { count: compareSelectedIds.length as 2 | 3 | 4 | 5, source: "chat_history" },
      });
    }
    router.push(
      `/compare?ids=${compareSelectedIds.map((id) => encodeURIComponent(id)).join(",")}`,
    );
  }

  function closeHistoryDrawer() {
    setHistoryOpen(false);
    setMobileNavTab(null);
    leaveCompareMode();
  }

  async function deleteThread(id: string) {
    if (!window.confirm(c.deleteHistoryConfirm)) return;
    const result = await deleteViewingThread({ id, userId });
    if (result === "failed") {
      setStatus(c.deleteFailed);
      return;
    }
    void removeMediaByThread(id);
    refreshLocal();
    if (activeId === id) {
      setActiveId(null);
      setAddressDraft("");
      setStatus("");
    }
  }

  function togglePinThread(id: string) {
    const thread = listLocalThreads().find((item) => item.id === id);
    if (!thread) return;
    setLocalThreadPinned(id, !thread.pinned);
    queueCloudSync(id);
    refreshLocal();
  }

  return (
    <div
      ref={shellRef}
      className="fixed inset-0 flex h-[100svh] max-h-[100svh] w-full flex-col overflow-hidden bg-[#FAF6F1] text-[#1A1A1A]"
    >
      {guestLimitOpen ? (
        <GuestLimitDialog
          title={c.guestLimitTitle}
          body={c.guestLimitBody}
          signInLabel={c.guestLimitSignIn}
          cancelLabel={c.guestLimitCancel}
          signInHref="/login?next=/"
          onCancel={() => setGuestLimitOpen(false)}
        />
      ) : null}
      {proLimitOpen ? (
        <GuestLimitDialog
          title={c.proLimitTitle}
          body={c.proLimitBody}
          signInLabel={c.proLimitUpgrade}
          cancelLabel={c.guestLimitCancel}
          onCancel={() => setProLimitOpen(false)}
          onConfirm={() => {
            setProLimitOpen(false);
            void (async () => {
              try {
                const response = await fetch("/api/create-checkout-session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ trigger: "paywall" }),
                });
                const payload = (await response.json()) as { url?: string; error?: string };
                if (payload.url) {
                  window.location.href = payload.url;
                  return;
                }
                setStatus(payload.error || t.paywall.syncFailed);
              } catch {
                setStatus(t.paywall.syncFailed);
              }
            })();
          }}
        />
      ) : null}
      <ShareReportDialog
        open={shareOpen}
        url={shareUrl}
        needsRegenerate={shareNeedsRegenerate}
        error={shareError}
        labels={{
          title: c.shareNoticeTitle,
          body: shareExpires ? c.shareExisting.replace("{date}", shareExpires.slice(0, 10)) : c.shareNoticeBody,
          point1: c.shareNoticePoint1,
          point2: c.shareNoticePoint2,
          point3: c.shareNoticePoint3,
          acknowledge: c.shareAcknowledge,
          create: c.shareCreate,
          revoke: c.shareRevoke,
          regenerate: c.shareRegenerate,
          regenerateConfirm: c.shareRegenerateConfirm,
          copy: c.shareCopy,
          copyFailed: c.shareCopyFailed,
          unavailable: c.shareUnavailable,
          needsRegenerate: c.shareNeedsRegenerate,
          close: c.shareClose,
        }}
        onClose={() => setShareOpen(false)}
        onCreate={() => {
          if (!active) return;
          void fetch("/api/share/links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ viewingId: active.id }),
          }).then(async (response) => {
            const data = (await response.json()) as {
              urlPath?: string;
              error?: string;
              code?: string;
              link?: { id?: string; expiresAt?: string | null };
            };
            if (response.status === 429) setShareError(c.shareRateLimited);
            else if (response.status === 503) setShareError(c.shareUnavailable);
            else if (data.code === "VIEWING_NOT_FOUND" || response.status === 404) setShareError(c.viewingNotFound);
            else if (response.status === 409) setShareError(c.shareNoReportYet);
            else if (!response.ok) setShareError(c.shareUnavailable);
            else {
              setShareError(null);
              setShareLinkId(data.link?.id ?? null);
              setShareExpires(data.link?.expiresAt ?? null);
              setShareNeedsRegenerate(false);
              setShareUrl(data.urlPath ? `${window.location.origin}${data.urlPath}` : null);
            }
          });
        }}
        onCopy={async () => {
          if (!shareUrl) return false;
          try {
            await navigator.clipboard.writeText(shareUrl);
            return true;
          } catch {
            return false;
          }
        }}
        onRevoke={() => {
          if (!shareLinkId) return;
          const previous = shareUrl;
          void fetch(`/api/share/links/${shareLinkId}/revoke`, { method: "POST" }).then(async (response) => {
            if (!response.ok) {
              setShareUrl(previous);
              setShareError(c.shareUnavailable);
              return;
            }
            setShareUrl(null);
            setShareLinkId(null);
            setShareError(null);
            setStatus(c.shareRevoked);
          });
        }}
        onRegenerate={() => {
          if (!shareLinkId) return;
          void fetch(`/api/share/links/${shareLinkId}/rotate`, { method: "POST" }).then(async (response) => {
            const data = (await response.json()) as {
              urlPath?: string;
              code?: string;
              link?: { id?: string; expiresAt?: string | null };
            };
            if (response.status === 429) {
              setShareError(c.shareRateLimited);
              return;
            }
            if (!response.ok || !data.urlPath) {
              setShareError(c.shareUnavailable);
              return;
            }
            setShareError(null);
            setShareLinkId(data.link?.id ?? null);
            setShareExpires(data.link?.expiresAt ?? null);
            setShareUrl(`${window.location.origin}${data.urlPath}`);
          });
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <IconRail
        sidebarOpen={historyOpen}
        onToggleSidebar={() => {
          setHistoryOpen((v) => !v);
          setSearchOpen(false);
          setMediaOpen(false);
        }}
        onNew={() => {
          setSearchOpen(false);
          setMediaOpen(false);
          if (shouldStartNewViewing(Boolean(active))) {
            startNewProperty();
          }
        }}
        onOpenSearch={() => {
          setSearchOpen(true);
          setMediaOpen(false);
        }}
        onOpenMedia={() => {
          setMediaOpen(true);
          setSearchOpen(false);
        }}
        searchOpen={searchOpen}
        mediaOpen={mediaOpen}
        threads={threads}
        activeId={activeId}
        onSelectThread={selectThread}
        onDeleteThread={deleteThread}
        onTogglePinThread={togglePinThread}
        compareMode={compareMode}
        selectedIds={compareSelectedIds}
        onToggleCompareMode={toggleCompareMode}
        onToggleSelect={toggleCompareSelect}
        onOpenCompare={() => void openCompare()}
        maxItems={compareItemMax}
      />

      <section className="mx-auto flex min-h-0 min-w-0 max-w-[1200px] flex-1 flex-col">
        {active ? (
          <>
            <header className="relative z-40 flex shrink-0 items-center gap-1 border-b border-black/8 bg-[#FAF6F1]/95 px-2 py-2.5 pt-[max(0.65rem,env(safe-area-inset-top))] backdrop-blur sm:px-3">
              <button
                type="button"
                onClick={exitChatFocus}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#4B5563] hover:bg-black/5 md:hidden"
                aria-label={c.chatFocusBack}
                title={c.chatFocusBack}
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              {userId && active.cloud?.state === "synced" ? <ChatInvite viewingId={active.id} /> : null}
              <button
                type="button"
                onClick={() => setSummaryOpen((v) => !v)}
                className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold disabled:opacity-40 ${
                  summaryOpen
                    ? "bg-black text-white"
                    : "text-[#4B5563] hover:bg-black/5"
                }`}
                aria-label={summaryOpen ? c.summaryClose : c.summaryOpen}
                title={summaryOpen ? c.summaryClose : c.summaryOpen}
                aria-pressed={summaryOpen}
              >
                <Clipboard className="h-4 w-4" />
                <span className="hidden sm:inline">{c.summaryOpen}</span>
              </button>
              <button
                type="button"
                disabled={active.messages.length === 0}
                onClick={() => {
                  if (chatSearchOpen) closeChatSearch();
                  else setChatSearchOpen(true);
                }}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40 ${
                  chatSearchOpen
                    ? "bg-black text-white"
                    : "text-[#4B5563] hover:bg-black/5"
                }`}
                aria-label={c.chatSearch}
                title={c.chatSearch}
                aria-pressed={chatSearchOpen}
              >
                <Search className="h-4 w-4" />
              </button>
              </div>
            </header>
            <div className="relative flex min-h-0 flex-1">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {conflicts.length > 0 ? (
                <ConflictingDataAlert
                  conflicts={conflicts}
                  title={c.conflictTitle}
                  cta={c.conflictConfirm}
                  onConfirm={() => {
                    setConflicts([]);
                    if (active.stage === "awaiting_user_confirmation") {
                      patchLocalThread(active.id, { stage: "collecting_sources" });
                      refreshLocal();
                    }
                  }}
                />
              ) : null}
              <div className="sticky top-0 z-10 border-b border-black/8 bg-[#FAF6F1]/95 px-4 py-2.5 backdrop-blur">
                <p
                  className="truncate text-center text-[14px] font-bold"
                  title={active.address}
                >
                  {shortenAddressLabel(active.normalizedAddress || active.address)}
                </p>
                {userId && active.cloud?.state === "synced" ? (
                  <div className="mt-2 flex justify-center">
                    <ChatFaces viewingId={active.id} />
                  </div>
                ) : null}
                {!userId ? (
                  <p className="mt-1 text-center text-[11px] text-[#6B7280]">
                    {c.guestLocalNotice.replace("{days}", String(guestDaysLeft(active)))}{" "}
                    <a
                      className="underline"
                      href={`/login?next=${encodeURIComponent(`/?thread=${active.id}`)}`}
                    >
                      {c.guestLocalSave}
                    </a>
                  </p>
                ) : null}
                {status ? (
                  <p
                    className="mt-1 text-center text-[12px] font-semibold text-[#92400E]"
                    role="status"
                  >
                    {status}
                  </p>
                ) : null}
                {chatSearchOpen ? (
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5">
                      <Search className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]" />
                      <input
                        ref={chatSearchInputRef}
                        value={chatSearchQuery}
                        onChange={(event) => setChatSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            stepChatMatch(event.shiftKey ? -1 : 1);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            closeChatSearch();
                          }
                        }}
                        placeholder={c.chatSearchPlaceholder}
                        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#9CA3AF]"
                        aria-label={c.chatSearch}
                      />
                      {chatSearchQuery.trim() ? (
                        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[#6B7280]">
                          {chatMatchIds.length === 0
                            ? "0/0"
                            : `${chatMatchIndex + 1}/${chatMatchIds.length}`}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={chatMatchIds.length === 0}
                      onClick={() => stepChatMatch(-1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[#4B5563] hover:bg-black/5 disabled:opacity-35"
                      aria-label={c.chatSearchPrev}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={chatMatchIds.length === 0}
                      onClick={() => stepChatMatch(1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[#4B5563] hover:bg-black/5 disabled:opacity-35"
                      aria-label={c.chatSearchNext}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={closeChatSearch}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[#4B5563] hover:bg-black/5"
                      aria-label={c.searchClose}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              <ChatMessageList
                messages={active.messages}
                emptyHint={sourceBusy ? c.sourceExtracting : c.emptyChatCapture}
                onShareReport={requestShare}
                shareLabel={c.shareReport}
                replyLabel={c.reply}
                cancelLabel={c.replyMenuCancel}
                matchQuery={chatSearchOpen ? chatSearchQuery : ""}
                highlightMessageId={chatSearchOpen ? activeChatMatchId : null}
                onReply={(target) => {
                  setReplyTo(target);
                  document.getElementById("viewing-chat-composer")?.focus();
                }}
                onReact={(messageId, emoji) => {
                  if (!userId || !active) return;
                  const next = active.messages.map((message) =>
                    message.id === messageId
                      ? { ...message, reactions: toggleChatReaction(message.reactions, emoji, userId) }
                      : message,
                  );
                  saveLocalMessages(active.id, next);
                  queueCloudSync(active.id);
                  refreshLocal();
                }}
              />
            </div>
            <div className="shrink-0 border-t border-black/8 bg-[#FAF6F1]">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void ingestSource({ sourceType: "image", file });
                }}
              />
              <input
                ref={screenshotInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void ingestSource({ sourceType: "image", file });
                }}
              />
              <input
                ref={hoaDocInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const isPdf =
                    file.type === "application/pdf" ||
                    file.name.toLowerCase().endsWith(".pdf");
                  void ingestSource({
                    sourceType: isPdf ? "pdf" : "image",
                    file,
                    sourceRole: "hoa_doc",
                  });
                }}
              />
              {composerHint ? (
                <p className="px-3 pb-1 text-[11px] font-semibold text-[#1D4ED8]">
                  {composerHint}
                </p>
              ) : null}
              <ViewingChatComposer
                busy={busy || sourceBusy}
                processing={busy || sourceBusy}
                edgeToBottom={chatFocusMode}
                processingHint={
                  busy || sourceBusy
                    ? status || c.turnProcessing
                    : null
                }
                externalError={turnError}
                errorActions={turnErrorActions}
                errorActionLabels={{
                  retry: c.turnRetry,
                  signIn: t.nav.signIn,
                  upgrade: t.aiBoundary.ctaUpgrade,
                }}
                onErrorAction={(action) => void handleAiErrorAction(action)}
                onRetry={
                  lastTurnPayload
                    ? () => void submitTurn(lastTurnPayload)
                    : undefined
                }
                replyTo={replyTo}
                onClearReply={() => setReplyTo(null)}
                permissionCopy={t.permissions}
                labels={{
                  placeholder: composerHint || c.composerPlaceholder,
                  send: c.send,
                  recording: c.recording,
                  stop: c.stop,
                  attach: c.attach,
                  camera: c.attachCamera,
                  uploadImage: c.attachImage,
                  uploadFile: c.attachFile,
                  uploadVideo: c.attachVideo,
                  empty: c.emptyComposer,
                  micDenied: c.micDenied,
                  importAudio: c.importAudio,
                  audioTooLarge: t.composer.audioTooLarge,
                  imageTooLarge: t.composer.imageTooLarge,
                  imageBadType: t.composer.imageBadType,
                  emptyFile: t.mediaImport.emptyFile,
                  videoTooLarge: t.mediaImport.videoTooLarge,
                  replyingTo: c.replyingTo,
                  replyCancel: c.replyCancel,
                  processing: c.turnProcessing,
                  uploading: c.uploadProcessing,
                  retry: c.turnRetry,
                }}
                onSubmit={async (payload) => {
                  await submitTurn(payload);
                }}
              />
            </div>
              </div>

              {/* Desktop: right-side summary — chat stays usable */}
              {summaryOpen ? (
                <aside className="hidden min-h-0 w-[340px] shrink-0 flex-col border-l border-black/8 bg-white lg:flex">
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/8 px-3 py-2">
                    <p className="text-[13px] font-bold">
                      {active.conversationStatus === "reviewing"
                        ? c.reviewTitle
                        : c.summaryTitle}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busy || active.messages.length === 0}
                        onClick={openReviewCard}
                        className="rounded-full px-2.5 py-1 text-[12px] font-bold text-[#2563EB] hover:bg-black/5 disabled:opacity-40"
                      >
                        {c.actionFinish}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSummaryOpen(false)}
                        className="rounded-full p-1.5 text-[#4B5563] hover:bg-black/5"
                        aria-label={c.summaryClose}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {active.conversationStatus === "reviewing" ? (
                      <ReviewCard
                        record={active.propertyRecord}
                        skippedFields={
                          (active.collectionSkippedFields ??
                            []) as PropertyFieldId[]
                        }
                        fieldLabels={c.fieldLabels}
                        address={active.address}
                        labels={{
                          title: c.reviewTitle,
                          hint: c.reviewHint,
                          confirm: c.reviewConfirm,
                          keepCollecting: c.reviewKeepCollecting,
                          markUnknown: c.reviewMarkUnknown,
                          saveField: c.reviewConfirm,
                          valuePlaceholder: c.reviewValuePlaceholder,
                          share: c.reviewShare,
                          shared: c.reviewShared,
                          copyFailed: c.reviewCopyFailed,
                          statusConfirmed: c.statusConfirmed,
                          statusSubjective: c.statusSubjective,
                          statusInferred: c.statusInferred,
                          statusMissing: c.statusMissing,
                          statusSkipped: c.statusSkipped,
                          statusConflict: c.statusConflict,
                        }}
                        busy={busy}
                        onConfirm={applyReviewDrafts}
                        onKeepCollecting={() => {
                          patchLocalThread(active.id, {
                            conversationStatus: "collecting",
                            propertyRecord: active.propertyRecord
                              ? {
                                  ...active.propertyRecord,
                                  mode: "collecting",
                                }
                              : active.propertyRecord,
                          });
                          refreshLocal();
                        }}
                      />
                    ) : (
                      <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
                        <PropertySummaryPanel
                          record={active.propertyRecord}
                          skippedFields={
                            (active.collectionSkippedFields ??
                              []) as PropertyFieldId[]
                          }
                          changes={active.lastTurnChanges ?? []}
                          fieldLabels={c.fieldLabels}
                          compact
                          labels={{
                            title: c.summaryTitle,
                            empty: c.summaryEmpty,
                            changesTitle: c.summaryChangesTitle,
                            noChanges: c.summaryNoChanges,
                            statusConfirmed: c.statusConfirmed,
                            statusSubjective: c.statusSubjective,
                            statusInferred: c.statusInferred,
                            statusMissing: c.statusMissing,
                            statusSkipped: c.statusSkipped,
                            statusConflict: c.statusConflict,
                            sectionConfirmed: c.sectionConfirmed,
                            sectionSubjective: c.sectionSubjective,
                            sectionInferred: c.sectionInferred,
                            sectionMissing: c.sectionMissing,
                            sectionSkipped: c.sectionSkipped,
                            changeAdded: c.changeAdded,
                            changeUpdated: c.changeUpdated,
                            changeCorrected: c.changeCorrected,
                            changeConflict: c.changeConflict,
                            changeSkipped: c.changeSkipped,
                            changeUnknown: c.changeUnknown,
                            openSummary: c.summaryOpen,
                            closeSummary: c.summaryClose,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </aside>
              ) : null}

              {/* Mobile: slide down from top */}
              <div
                className={`absolute inset-x-0 top-0 z-30 flex h-[min(72vh,560px)] flex-col overflow-hidden border-b border-black/8 bg-white shadow-[0_12px_28px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out lg:hidden ${
                  summaryOpen
                    ? "translate-y-0"
                    : "pointer-events-none -translate-y-[calc(100%+12px)]"
                }`}
                aria-hidden={!summaryOpen}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/8 px-3 py-2">
                  <p className="text-[13px] font-bold">
                    {active.conversationStatus === "reviewing"
                      ? c.reviewTitle
                      : c.summaryTitle}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={busy || active.messages.length === 0}
                      onClick={openReviewCard}
                      className="rounded-full px-2.5 py-1 text-[12px] font-bold text-[#2563EB] hover:bg-black/5 disabled:opacity-40"
                    >
                      {c.actionFinish}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSummaryOpen(false)}
                      className="rounded-full p-1.5 text-[#4B5563] hover:bg-black/5"
                      aria-label={c.summaryClose}
                    >
                    <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  {active.conversationStatus === "reviewing" ? (
                    <ReviewCard
                      record={active.propertyRecord}
                      skippedFields={
                        (active.collectionSkippedFields ??
                          []) as PropertyFieldId[]
                      }
                      fieldLabels={c.fieldLabels}
                      address={active.address}
                      labels={{
                        title: c.reviewTitle,
                        hint: c.reviewHint,
                        confirm: c.reviewConfirm,
                        keepCollecting: c.reviewKeepCollecting,
                        markUnknown: c.reviewMarkUnknown,
                        saveField: c.reviewConfirm,
                        valuePlaceholder: c.reviewValuePlaceholder,
                        share: c.reviewShare,
                        shared: c.reviewShared,
                        copyFailed: c.reviewCopyFailed,
                        statusConfirmed: c.statusConfirmed,
                        statusSubjective: c.statusSubjective,
                        statusInferred: c.statusInferred,
                        statusMissing: c.statusMissing,
                        statusSkipped: c.statusSkipped,
                        statusConflict: c.statusConflict,
                      }}
                      busy={busy}
                      onConfirm={applyReviewDrafts}
                      onKeepCollecting={() => {
                        patchLocalThread(active.id, {
                          conversationStatus: "collecting",
                          propertyRecord: active.propertyRecord
                            ? {
                                ...active.propertyRecord,
                                mode: "collecting",
                              }
                            : active.propertyRecord,
                        });
                        refreshLocal();
                      }}
                    />
                  ) : (
                    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
                      <PropertySummaryPanel
                        record={active.propertyRecord}
                        skippedFields={
                          (active.collectionSkippedFields ??
                            []) as PropertyFieldId[]
                        }
                        changes={active.lastTurnChanges ?? []}
                        fieldLabels={c.fieldLabels}
                        compact
                        labels={{
                          title: c.summaryTitle,
                          empty: c.summaryEmpty,
                          changesTitle: c.summaryChangesTitle,
                          noChanges: c.summaryNoChanges,
                          statusConfirmed: c.statusConfirmed,
                          statusSubjective: c.statusSubjective,
                          statusInferred: c.statusInferred,
                          statusMissing: c.statusMissing,
                          statusSkipped: c.statusSkipped,
                          statusConflict: c.statusConflict,
                          sectionConfirmed: c.sectionConfirmed,
                          sectionSubjective: c.sectionSubjective,
                          sectionInferred: c.sectionInferred,
                          sectionMissing: c.sectionMissing,
                          sectionSkipped: c.sectionSkipped,
                          changeAdded: c.changeAdded,
                          changeUpdated: c.changeUpdated,
                          changeCorrected: c.changeCorrected,
                          changeConflict: c.changeConflict,
                          changeSkipped: c.changeSkipped,
                          changeUnknown: c.changeUnknown,
                          openSummary: c.summaryOpen,
                          closeSummary: c.summaryClose,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {summaryOpen ? (
                <button
                  type="button"
                  className="absolute inset-0 z-20 bg-black/20 transition-opacity duration-300 lg:hidden"
                  aria-label={c.summaryClose}
                  onClick={() => setSummaryOpen(false)}
                />
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto overscroll-contain px-5 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
            <div className="w-full max-w-md space-y-5">
              <div className="text-center">
                <h1 className="text-[22px] font-black tracking-tight sm:text-[26px]">
                  {t.brand.name}
                </h1>
                <p className="mt-2 text-[15px] font-bold tracking-wide text-[#111111]">
                  {t.brand.subtitle}
                </p>
              </div>
              {pendingAddressConfirm ? (
                <AddressConfirmationCard
                  candidate={pendingAddressConfirm.candidate}
                  copy={{
                    pendingTitle: t.address.pendingConfirmTitle,
                    confirmUse: t.address.confirmUseThisAddress,
                    rejectResearch: t.address.rejectResearch,
                    propertyIdLabel: t.address.propertyIdLabel,
                    coordinatesLabel: t.address.coordinatesLabel,
                    openMap: t.address.openMap,
                    noCoordinates: t.address.noCoordinates,
                    adminMismatchWarning: t.address.adminMismatchWarning,
                  }}
                  busy={false}
                  onConfirm={acceptPendingAddress}
                  onReject={rejectPendingAddress}
                />
              ) : (
                <AddressAutocomplete
                  value={addressDraft}
                  onChange={(value) => {
                    setPendingAddressConfirm(null);
                    setAddressDraft(value);
                    if (value.trim()) setAddressCue(false);
                  }}
                  emphasize={addressCue}
                  onSelect={onSelectSuggestion}
                  onCommit={onCommitAddressDraft}
                  copy={{
                    placeholder: c.addressPlaceholder,
                    loading: t.address.suggestLoading,
                    empty: t.address.suggestEmpty,
                    error: t.address.suggestError,
                    listLabel: t.address.suggestListLabel,
                    search: c.confirmAddress,
                  }}
                />
              )}
              {status ? (
                <p
                  className="text-center text-[12px] font-semibold text-[#92400E]"
                  role="status"
                >
                  {status}
                </p>
              ) : pendingAddressConfirm ? null : (
                <p className="text-center text-[13px] text-[#6B7280]">{c.emptyChat}</p>
              )}
            </div>
          </div>
        )}
      </section>
      </div>

      <MobileBottomNav
        hidden={keyboardOpen || chatFocusMode}
        activeTab={
          accountOpen
            ? "account"
            : mediaOpen
              ? "media"
              : searchOpen
                ? "search"
                : historyOpen && isMobileViewport
                  ? "history"
                  : mobileNavTab === "new"
                    ? null
                    : mobileNavTab
        }
        labels={{
          nav: c.mobileNavLabel,
          history: c.tabHistory,
          search: c.tabSearch,
          media: c.tabMedia,
          account: c.tabAccount,
        }}
        onSelect={handleMobileNav}
      />

      <MobileHistoryDrawer
        open={historyOpen && isMobileViewport}
        threads={threads}
        activeId={activeId}
        onClose={closeHistoryDrawer}
        onSelectThread={selectThread}
        onDeleteThread={deleteThread}
        onTogglePinThread={togglePinThread}
        compareMode={compareMode}
        selectedIds={compareSelectedIds}
        onToggleCompareMode={toggleCompareMode}
        onToggleSelect={toggleCompareSelect}
        onOpenCompare={() => void openCompare()}
        maxItems={compareItemMax}
        onStartNew={() => {
          closeMobileOverlays();
          setMobileNavTab("new");
          if (shouldStartNewViewing(Boolean(active))) {
            startNewProperty();
          }
        }}
        labels={{
          title: c.historyTitle,
          empty: c.emptyHistory,
          close: c.searchClose,
          pin: c.pinHistory,
          unpin: c.unpinHistory,
          delete: c.deleteHistory,
          startNew: c.startNewViewing,
          compareToggle: t.compareLite.compareToggle,
          compareCancel: t.compareLite.compareCancel,
          compareSelectedCount: t.compare.selectedCount,
          compareOpen: t.compareLite.compareOpen,
          compareTooManyFree: t.compare.gateTooManyFree,
          compareTooManyPro: t.compare.gateTooManyPro,
          searchPlaceholder: c.searchPlaceholder,
          syncFailed: c.syncRetry,
        }}
      />

      <MobileAccountSheet
        open={accountOpen}
        onClose={() => {
          setAccountOpen(false);
          setMobileNavTab(null);
        }}
      />

      {mediaOpen ? (
        <MediaLibraryPanel
          onClose={() => {
            setMediaOpen(false);
            setMobileNavTab(null);
          }}
          railExpanded={historyOpen}
          labels={{
            title: c.mediaLibrary,
            hint: c.mediaLibraryHint,
            empty: c.mediaLibraryEmpty,
            close: c.searchClose,
            delete: c.mediaLibraryDelete,
            failed: c.mediaLibraryFailed,
          }}
        />
      ) : null}
    </div>
  );
}
