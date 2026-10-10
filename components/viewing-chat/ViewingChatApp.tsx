"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddressAutocomplete } from "@/components/viewing-wizard/AddressAutocomplete";
import { AddressConfirmationCard } from "@/components/viewing-wizard/AddressConfirmationCard";
import {
  clearAddressPinDraft,
  readAddressPinDraft,
  writeActiveThreadId,
  writeAddressPinDraft,
  type AddressPinDraft,
} from "@/lib/address-pin-session";
import { COQUITLAM_PORT_MOODY_CENTER } from "@/lib/map-pin";
import { useI18n } from "@/components/I18nProvider";
import { IconRail } from "@/components/viewing-chat/IconRail";
import { MobileAccountSheet } from "@/components/viewing-chat/shell/MobileAccountSheet";
import {
  MobileBottomNav,
  type MobileNavTabId,
} from "@/components/viewing-chat/shell/MobileBottomNav";
import { MobileHistoryDrawer } from "@/components/viewing-chat/shell/MobileHistoryDrawer";
import { track } from "@/lib/analytics/client";
import type { AddressSource, AnalyticsRegion } from "@/lib/analytics/events";
import {
  splitAddressQuery,
  withUnitLabel,
  type AddressSuggestion,
} from "@/lib/address-suggest";
import {
  buildAddressConfirmationCandidate,
  candidateFromSuggestion,
  type AddressConfirmationCandidate,
  type AddressLookupPayloadLike,
} from "@/lib/address-confirmation";
import { getSupabase } from "@/lib/supabase";
import { applyChatStateToLocal } from "@/lib/viewing-chat/chat-state";
import {
  createLocalThread,
  deleteLocalThread,
  filterThreadsForAccount,
  getLocalThread,
  listLocalThreads,
  patchLocalThread,
  remintLocalThreadForCloud,
  saveLocalMessages,
  setLocalThreadPinned,
  threadVisibleToAccount,
  upsertLocalThread,
} from "@/lib/viewing-chat/local-store";
import { getMediaBlob, removeMediaByThread } from "@/lib/viewing-chat/media-library";
import { uploadViewingFile, appendViewingPath } from "@/lib/media";
import { claimAccountThreads, pullCloudThreads } from "@/lib/viewing-chat/claim-account";
import { deleteViewingThread } from "@/lib/viewing-chat/delete-thread";
import { sameViewingAddress } from "@/lib/viewing-chat/same-address";
import { resolvePropertyIdentity } from "@/lib/property-identity";
import {
  canStartLocalViewing,
  FREE_VIEWING_LIMIT,
} from "@/lib/viewing-wizard/free-tier";
import {
  buildChatStatePayload,
  pushViewingThread,
  withCloudSyncState,
} from "@/lib/viewing-chat/cloud-push";
import { appendChatMessages } from "@/lib/viewing-chat/append-messages";
import { mergeMessagesForHydrate } from "@/lib/viewing-chat/merge-messages-hydrate";
import { mergeChatMessages } from "@/lib/viewing-chat/merge-messages";
import { ClaimLimitDialog } from "@/components/viewing-chat/ClaimLimitDialog";
import { GuestLimitDialog } from "@/components/viewing-chat/GuestLimitDialog";
import {
  consumeClaimLimitNotice,
  hasBlockedLimitThreads,
} from "@/lib/viewing-chat/claim-limit-notice";
import { startProCheckout } from "@/lib/viewing-chat/start-pro-checkout";
import { syncWithRetry } from "@/lib/viewing-chat/cloud-sync";
import { sweepExpiredGuestThreads } from "@/lib/viewing-chat/sweep-guest-threads";
import type { ChatMessage, ViewingChatThread } from "@/lib/viewing-chat/types";
import { detectMarketRegion } from "@/lib/property-intel/types";
import { shouldStartNewViewing } from "@/lib/viewing-chat/should-start-new-viewing";

async function hydrateViewingThread(threadId: string, ownerUserId: string) {
  const detail = await fetch(`/api/viewing-chat/threads/${threadId}`);
  if (!detail.ok) return false;
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
  const freshLocal = getLocalThread(threadId);
  const mergedMessages = mergeMessagesForHydrate(
    freshLocal?.messages ?? restored.messages ?? [],
    row.messages ?? [],
    freshLocal?.updatedAt ?? local?.updatedAt ?? restored.updatedAt,
    row.updated_at,
    freshLocal?.cloud?.revision ?? local?.cloud?.revision,
    row.revision,
  );
  const keepLocalClock =
    Boolean(freshLocal?.updatedAt) && freshLocal!.updatedAt > row.updated_at;
  upsertLocalThread({
    ...restored,
    address: row.address || restored.address,
    messages: mergedMessages,
    report: row.report ?? restored.report,
    metadata: row.metadata ?? restored.metadata,
    ...(keepLocalClock && freshLocal
      ? {
          overallRating: freshLocal.overallRating,
          tags: freshLocal.tags,
          decisionStatus: freshLocal.decisionStatus,
        }
      : {}),
    updatedAt: keepLocalClock ? freshLocal!.updatedAt : row.updated_at,
    ownerUserId,
    cloud: {
      state: "synced",
      lastSyncedAt: row.updated_at,
      revision: row.revision,
    },
  });
  return true;
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function pendingFromPinDraft(draft: AddressPinDraft): {
  queryAddress: string;
  candidate: AddressConfirmationCandidate;
  payload: AddressLookupPayloadLike;
  source: AddressSource | null;
  region: AnalyticsRegion | null;
  droppedPin: { lat: number; lng: number } | null;
} {
  const source =
    draft.source === "bc_geocoder" ||
    draft.source === "nominatim" ||
    draft.source === "google" ||
    draft.source === "photon"
      ? draft.source
      : null;
  return {
    queryAddress: draft.queryAddress,
    source,
    region: draft.region,
    droppedPin: draft.picked,
    candidate: {
      displayAddress: draft.displayAddress,
      propertyId: draft.propertyId,
      lat: draft.hintLat,
      lng: draft.hintLng,
      market: "CA",
      source,
      tags: [],
      mapEmbedUrl: null,
      openMapUrl: null,
      adminDistrictMismatch: false,
      needsMapPin: true,
    },
    payload: {
      displayAddress: draft.displayAddress,
      details: { lat: draft.hintLat, lng: draft.hintLng },
    },
  };
}

/**
 * Home shell: address create + history / compare / ask nav.
 * On-site capture lives in ViewingSessionApp (`/viewings/[id]`).
 */
export function ViewingChatApp({
  viewingId = null,
  startOnly: _startOnly = true,
}: {
  viewingId?: string | null;
  /** @deprecated Ignored — notes session is the only capture surface. */
  startOnly?: boolean;
} = {}) {
  const { messages: t, locale } = useI18n();
  const c = t.chat;
  const router = useRouter();
  const searchParams = useSearchParams();
  const shellRef = useRef<HTMLDivElement>(null);
  const restoredView = useRef(false);

  const [threads, setThreads] = useState<ViewingChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(viewingId);
  const [threadReady, setThreadReady] = useState(() => !viewingId);
  const [addressDraft, setAddressDraft] = useState("");
  const [pendingAddressConfirm, setPendingAddressConfirm] = useState<{
    queryAddress: string;
    candidate: AddressConfirmationCandidate;
    payload: AddressLookupPayloadLike;
    source: AddressSource | null;
    region: AnalyticsRegion | null;
    droppedPin: { lat: number; lng: number } | null;
  } | null>(null);
  const [proLimitOpen, setProLimitOpen] = useState(false);
  const [claimLimitOpen, setClaimLimitOpen] = useState(false);
  const [guestLimitOpen, setGuestLimitOpen] = useState(false);
  const [addressCue, setAddressCue] = useState(false);
  const [addressFocusToken, setAddressFocusToken] = useState(0);
  const [status, setStatus] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareItemMax, setCompareItemMax] = useState(2);
  const [compareSelectedIds, setCompareSelectedIds] = useState<string[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [mobileNavTab, setMobileNavTab] = useState<MobileNavTabId | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const syncTimers = useRef(new Map<string, number>());
  const threadCreations = useRef(new Map<string, Promise<void>>());

  const visibleThreads = useMemo(
    () => filterThreadsForAccount(threads, userId),
    [threads, userId],
  );
  const active = useMemo(
    () => visibleThreads.find((thread) => thread.id === activeId) ?? null,
    [visibleThreads, activeId],
  );

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
      if (viewingId) await hydrateViewingThread(viewingId, userId);
      if (cancelled) return;
      refreshLocal();
      const overLimit =
        claim.blocked > 0 || hasBlockedLimitThreads(userId);
      if (consumeClaimLimitNotice(overLimit)) {
        setClaimLimitOpen(true);
      }
      if (viewingId) {
        setActiveId(viewingId);
        setThreadReady(true);
        return;
      }
      const threadId = searchParams.get("thread");
      if (threadId) router.replace(`/viewings/${threadId}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, searchParams, router, viewingId]);

  useEffect(() => {
    if (viewingId) return;
    if (searchParams.get("new") !== "1") return;
    setActiveId(null);
    setAddressDraft("");
    setPendingAddressConfirm(null);
    clearAddressPinDraft();
    setStatus("");
    setAddressCue(true);
    setAddressFocusToken((token) => token + 1);
    router.replace("/", { scroll: false });
  }, [viewingId, searchParams, router]);

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
    const stored = listLocalThreads();
    setThreads(stored);
    if (viewingId) {
      setActiveId(viewingId);
      const found = stored.find((thread) => thread.id === viewingId);
      if (found) setAddressDraft(found.address);
    } else {
      // Home shell: restore in-progress pin draft, not a prior chat thread.
      const draft = readAddressPinDraft();
      if (draft) {
        setAddressDraft(draft.queryAddress);
        setPendingAddressConfirm(pendingFromPinDraft(draft));
      }
    }
    const mq = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => {
      const mobile = mq.matches;
      setIsMobileViewport(mobile);
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
  }, [viewingId]);

  useEffect(() => {
    if (!restoredView.current) {
      restoredView.current = true;
      return;
    }
    writeActiveThreadId(activeId);
    if (activeId) clearAddressPinDraft();
  }, [activeId]);

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
    setAccountOpen(false);
  }

  function handleMobileNav(tab: MobileNavTabId) {
    setMobileNavTab(tab);
    if (tab === "ask") {
      closeMobileOverlays();
      router.push("/ask?from=tab");
      return;
    }
    if (tab === "history") {
      setAccountOpen(false);
      setHistoryOpen(true);
      return;
    }
    setHistoryOpen(false);
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
    const reminted = remintLocalThreadForCloud(threadId);
    const cloudId = reminted.threadId;
    if (reminted.remapped && activeId === threadId) setActiveId(cloudId);
    const thread = getLocalThread(cloudId);
    if (!thread || !userId || thread.cloud?.state === "blocked_limit") return;
    const result = await syncWithRetry({
      put: async () => {
        const current = getLocalThread(cloudId);
        if (!current) return { status: 404 };
        const pushed = await pushViewingThread({
          threadId: cloudId,
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
          deleteLocalThread(cloudId);
          if (activeId === cloudId) setActiveId(null);
          return { status: 200 };
        }
        if (pushed.status === 409 && typeof pushed.revision === "number") {
          // Keep LOCAL messages (incl. deletes); only adopt the newer revision and retry.
          // Merging remote messages here used to resurrect notes the user just deleted.
          patchLocalThread(cloudId, {
            cloud: { ...current.cloud, state: "syncing", revision: pushed.revision },
          });
          setStatus(c.syncNewer);
          return { status: 409 };
        }
        if (pushed.status >= 200 && pushed.status < 300) {
          patchLocalThread(cloudId, {
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
      const latest = getLocalThread(cloudId);
      patchLocalThread(cloudId, { cloud: withCloudSyncState(latest?.cloud, result) });
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
          const path = await uploadChatFile(
            threadId,
            new File([blob], ref.name, { type: ref.mime }),
            ref.id,
            ref.kind,
          );
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

  /** Same reaction as tapping the address field: focus + short highlight. */
  function cueAddressInput() {
    setAddressCue(true);
    setAddressFocusToken((token) => token + 1);
  }

  function startNewProperty() {
    setActiveId(null);
    setAddressDraft("");
    setPendingAddressConfirm(null);
    clearAddressPinDraft();
    setStatus("");
    cueAddressInput();
  }

  function goToNewProperty() {
    // Desktop sidebar stays open; close mobile history drawer + covering sheets.
    if (isMobileViewport) setHistoryOpen(false);
    setAccountOpen(false);
    setMobileNavTab(null);
    if (viewingId) {
      router.push("/?new=1");
      return;
    }
    if (shouldStartNewViewing(Boolean(active))) {
      startNewProperty();
      return;
    }
    // Already on home setup — show the address field and focus it, same as a tap.
    if (pendingAddressConfirm) {
      setPendingAddressConfirm(null);
      clearAddressPinDraft();
    }
    cueAddressInput();
  }

  /** Bind a confirmed normalized address to a new local viewing thread, then open session. */
  async function bindConfirmedAddress(
    label: string,
    place?: { placeId: string | null; placeSource: string | null },
    sitePin?: { lat: number; lng: number; source: "civic" | "map" },
  ) {
    const trimmed = label.trim();
    if (!trimmed) {
      setStatus(c.needAddress);
      return;
    }
    const identity = resolvePropertyIdentity({
      address: trimmed,
      lat: sitePin?.lat ?? null,
      lng: sitePin?.lng ?? null,
      placeId: place?.placeId ?? null,
    });
    const unitPatch = {
      ...(identity.unitKey ? { unitKey: identity.unitKey } : {}),
      ...(identity.unitLabel ? { unitLabel: identity.unitLabel } : {}),
      ...(identity.placeId ? { placeId: identity.placeId } : {}),
    };
    const pool = filterThreadsForAccount(listLocalThreads(), userId);
    const duplicate = pool.find(
      (thread) =>
        sameViewingAddress(thread.address, trimmed) ||
        sameViewingAddress(thread.normalizedAddress ?? "", trimmed),
    );
    if (duplicate) {
      setPendingAddressConfirm(null);
      setAddressCue(false);
      router.replace(`/viewings/${duplicate.id}`);
      return;
    }

    if (!userId) {
      const localCount = listLocalThreads().filter((thread) => !thread.ownerUserId).length;
      const localGate = canStartLocalViewing({
        authenticated: false,
        localViewingCount: localCount,
      });
      if (!localGate.allowed) {
        setGuestLimitOpen(true);
        return;
      }
      const market = detectMarketRegion(trimmed) ?? "OTHER";
      const thread = createLocalThread(trimmed, [], null);
      patchLocalThread(thread.id, {
        normalizedAddress: trimmed,
        skippedSources: true,
        agendaMarket: market,
        briefing: null,
        reportNotesFingerprint: null,
        report: null,
        cloud: { state: "local_only" },
        ...(sitePin ? { sitePin } : {}),
        ...unitPatch,
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
      router.replace(`/viewings/${thread.id}`);
      return;
    }

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
    const market = detectMarketRegion(trimmed) ?? "OTHER";
    const thread = createLocalThread(trimmed, [], null);
    patchLocalThread(thread.id, {
      normalizedAddress: trimmed,
      skippedSources: true,
      agendaMarket: market,
      briefing: null,
      reportNotesFingerprint: null,
      report: null,
      ...(sitePin ? { sitePin } : {}),
      ...unitPatch,
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

    patchLocalThread(thread.id, { cloud: { state: "syncing" }, ownerUserId: userId });
    const creating = fetch("/api/viewing-chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: thread.id,
        address: trimmed,
        clientUpdatedAt: new Date().toISOString(),
        messages: [],
        chatState: {
          v: 1,
          normalizedAddress: trimmed,
          briefing: null,
          reportNotesFingerprint: null,
          ...(sitePin ? { sitePin } : {}),
          ...unitPatch,
        },
      }),
    })
      .then(async (response) => {
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
        if (response.ok) router.replace(`/viewings/${thread.id}`);
        else if (response.status === 402) setProLimitOpen(true);
        else setStatus(c.syncRetry);
      })
      .catch(() => {
        const latest = getLocalThread(thread.id);
        patchLocalThread(thread.id, {
          cloud: withCloudSyncState(latest?.cloud, "failed"),
          ownerUserId: userId,
        });
        refreshLocal();
        setStatus(c.syncRetry);
      });
    threadCreations.current.set(thread.id, creating);
  }

  function acceptPendingAddress(pin: { lat: number; lng: number } | null) {
    if (!pendingAddressConfirm) return;
    const { candidate, source, region, queryAddress } = pendingAddressConfirm;
    if (candidate.needsMapPin && !pin) return;
    if (source && region) {
      track({ name: "address_confirmed", props: { source, region } });
    }
    const sitePin = candidate.needsMapPin
      ? pin
        ? { lat: pin.lat, lng: pin.lng, source: "map" as const }
        : undefined
      : candidate.lat != null && candidate.lng != null
        ? { lat: candidate.lat, lng: candidate.lng, source: "civic" as const }
        : undefined;
    void bindConfirmedAddress(
      candidate.needsMapPin ? queryAddress : candidate.displayAddress,
      {
        placeId: candidate.needsMapPin ? null : candidate.propertyId,
        placeSource: candidate.source,
      },
      sitePin,
    );
  }

  function rejectPendingAddress() {
    if (!pendingAddressConfirm) return;
    const { queryAddress, source, region } = pendingAddressConfirm;
    if (source && region) {
      track({ name: "address_rejected", props: { source, region } });
    }
    clearAddressPinDraft();
    setPendingAddressConfirm(null);
    setAddressDraft(queryAddress);
    setStatus("");
  }

  function onSelectSuggestion(
    suggestion: AddressSuggestion,
    index: number,
    region: AnalyticsRegion,
  ) {
    const split = splitAddressQuery(addressDraft || suggestion.label);
    const labeled = {
      ...suggestion,
      label: withUnitLabel(suggestion.label, split.unit),
      formatted: withUnitLabel(suggestion.formatted || suggestion.label, split.unit),
    };
    const candidate = candidateFromSuggestion(labeled, labeled.label);
    if (!candidate) {
      setStatus(t.address.suggestError);
      return;
    }
    const source = suggestion.source;
    const next = {
      queryAddress: labeled.label,
      candidate,
      source,
      region,
      droppedPin: null,
      payload: {
        displayAddress: candidate.displayAddress,
        propertyId: candidate.propertyId ?? undefined,
        market: candidate.market ?? undefined,
        source: candidate.source ?? undefined,
        details: { lat: candidate.lat, lng: candidate.lng },
      },
    };
    setPendingAddressConfirm(next);
    if (candidate.needsMapPin) {
      writeAddressPinDraft({
        queryAddress: next.queryAddress,
        displayAddress: candidate.displayAddress,
        hintLat: candidate.lat ?? COQUITLAM_PORT_MOODY_CENTER.latitude,
        hintLng: candidate.lng ?? COQUITLAM_PORT_MOODY_CENTER.longitude,
        picked: null,
        propertyId: candidate.propertyId,
        source,
        region,
      });
    } else {
      clearAddressPinDraft();
    }
    setAddressDraft(candidate.displayAddress);
    setStatus("");
    track({
      name: "address_suggestion_selected",
      props: { source, region, rank: index },
    });
  }

  async function onCommitAddressDraft(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    setStatus(t.address.suggestLoading);
    try {
      const response = await fetch(
        `/api/address-lookup?q=${encodeURIComponent(trimmed)}&locale=${encodeURIComponent(locale)}`,
      );
      const body = (await response.json().catch(() => ({}))) as AddressLookupPayloadLike & {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        setStatus(t.address.suggestEmpty);
        return;
      }
      const candidate = buildAddressConfirmationCandidate(body, trimmed);
      if (!candidate || candidate.lat == null || candidate.lng == null) {
        setStatus(t.address.suggestEmpty);
        return;
      }
      const region: AnalyticsRegion =
        candidate.market === "US" || candidate.market === "TW" || candidate.market === "CA"
          ? candidate.market
          : "OTHER";
      const sourceRaw = (candidate.source || "").toLowerCase();
      const source: AddressSource =
        sourceRaw.includes("nominatim") || sourceRaw.includes("osm")
          ? "nominatim"
          : sourceRaw.includes("photon")
            ? "photon"
            : sourceRaw.includes("bc")
              ? "bc_geocoder"
              : "google";
      const next = {
        queryAddress: trimmed,
        candidate,
        source,
        region,
        droppedPin: null,
        payload: {
          displayAddress: candidate.displayAddress,
          propertyId: candidate.propertyId ?? undefined,
          market: candidate.market ?? undefined,
          source: candidate.source ?? undefined,
          details: { lat: candidate.lat, lng: candidate.lng },
        },
      };
      setPendingAddressConfirm(next);
      if (candidate.needsMapPin) {
        writeAddressPinDraft({
          queryAddress: next.queryAddress,
          displayAddress: candidate.displayAddress,
          hintLat: candidate.lat ?? COQUITLAM_PORT_MOODY_CENTER.latitude,
          hintLng: candidate.lng ?? COQUITLAM_PORT_MOODY_CENTER.longitude,
          picked: null,
          propertyId: candidate.propertyId,
          source,
          region,
        });
      } else {
        clearAddressPinDraft();
      }
      setAddressDraft(candidate.displayAddress);
      setStatus("");
    } catch {
      setStatus(t.address.suggestError);
    }
  }

  function selectThread(id: string) {
    const found = listLocalThreads().find((item) => item.id === id);
    if (found && !threadVisibleToAccount(found, userId)) return;
    if (id !== viewingId) {
      router.push(`/viewings/${id}`);
      return;
    }
    setActiveId(id);
    if (found) setAddressDraft(found.address);
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
        track({
          name: "compare_gate_shown",
          props: { reason: "too_many_items", source: "chat_history" },
        });
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
      if (viewingId) {
        router.push("/");
        return;
      }
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
          signInHref={`/login?mode=signup&next=${encodeURIComponent("/")}`}
          onCancel={() => setGuestLimitOpen(false)}
        />
      ) : null}

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
            setHistoryOpen(true);
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
              const result = await startProCheckout("paywall");
              if (!result.ok) setStatus(result.error || t.paywall.syncFailed);
            })();
          }}
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <IconRail
          sidebarOpen={historyOpen}
          onToggleSidebar={() => {
            setHistoryOpen((v) => !v);
          }}
          onNew={goToNewProperty}
          threads={visibleThreads}
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

        <section className="mx-auto flex min-h-0 min-w-0 max-w-[var(--page-max-width-wide)] flex-1 flex-col">
          {viewingId ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
              <div>
                <p className="text-[14px] font-semibold text-[#6B7280]">
                  {threadReady ? "這則聊天讀不到。" : "正在打開這則聊天…"}
                </p>
                {threadReady ? (
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="mt-4 text-[13px] font-bold underline"
                  >
                    {t.loginPage.backHome}
                  </button>
                ) : null}
              </div>
            </div>
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
                    key={pendingAddressConfirm.queryAddress}
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
                      mapPinHint: t.address.mapPinHint,
                      mapPinZoomIn: t.address.mapPinZoomIn,
                      mapPinZoomOut: t.address.mapPinZoomOut,
                      mapPinUseCenter: t.address.mapPinUseCenter,
                    }}
                    busy={false}
                    initialPin={pendingAddressConfirm.droppedPin}
                    onPinChange={(pin) => {
                      setPendingAddressConfirm((current) => {
                        if (!current) return current;
                        const next = { ...current, droppedPin: pin };
                        writeAddressPinDraft({
                          queryAddress: next.queryAddress,
                          displayAddress: next.candidate.displayAddress,
                          hintLat:
                            next.candidate.lat ?? COQUITLAM_PORT_MOODY_CENTER.latitude,
                          hintLng:
                            next.candidate.lng ?? COQUITLAM_PORT_MOODY_CENTER.longitude,
                          picked: pin,
                          propertyId: next.candidate.propertyId,
                          source: next.source,
                          region: next.region,
                        });
                        return next;
                      });
                    }}
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
                    focusToken={addressFocusToken}
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
        hidden={keyboardOpen}
        activeTab={
          accountOpen
            ? "account"
            : historyOpen && isMobileViewport
              ? "history"
              : mobileNavTab
        }
        labels={{
          nav: c.mobileNavLabel,
          ask: c.tabAsk,
          history: c.tabHistory,
          account: c.tabAccount,
        }}
        onSelect={handleMobileNav}
      />

      <MobileHistoryDrawer
        open={historyOpen && isMobileViewport}
        threads={visibleThreads}
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
        onStartNew={goToNewProperty}
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
    </div>
  );
}
