"use client";

import { ChevronDown, ChevronLeft, ChevronUp, Clipboard, MoreHorizontal, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddressAutocomplete } from "@/components/viewing-wizard/AddressAutocomplete";
import { AddressConfirmationCard } from "@/components/viewing-wizard/AddressConfirmationCard";
import { useI18n } from "@/components/I18nProvider";
import { ChatMessageList } from "@/components/viewing-chat/ChatMessageList";
import { HistorySearchPanel } from "@/components/viewing-chat/HistorySearchPanel";
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
import type { AddressSuggestion } from "@/lib/address-suggest";
import {
  buildAddressConfirmationCandidate,
  type AddressConfirmationCandidate,
  type AddressLookupPayloadLike,
} from "@/lib/address-confirmation";
import { shortenAddressLabel } from "@/lib/shorten-address";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  createLocalThread,
  deleteLocalThread,
  listLocalThreads,
  patchLocalThread,
  saveLocalMessages,
  setLocalThreadPinned,
} from "@/lib/viewing-chat/local-store";
import { addMediaFile } from "@/lib/viewing-chat/media-library";
import {
  createAiMessage,
  createUserMessage,
  messageSearchHaystack,
  type ChatMessage,
  type ChatReplyRef,
  type ViewingChatThread,
} from "@/lib/viewing-chat/types";
import { CollectionQuickActions } from "@/components/viewing-chat/CollectionQuickActions";
import {
  ReportQuickActions,
  type CollectionActionId,
} from "@/components/viewing-chat/ReportQuickActions";
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
import { isCollectingStage } from "@/lib/viewing-chat/stage";
import { SourceSoftFailActions } from "@/components/viewing-chat/SourceSoftFailActions";
import {
  countAgendaProgress,
  getActiveAgendaItem,
  inferAgendaMarket,
  openingAgendaActiveId,
  projectAgenda,
} from "@/lib/viewing-chat/agenda";
import { createAgendaLabelResolver } from "@/lib/viewing-chat/agenda-labels";
import { applyCollectionSkip, createEmptyPropertyRecord, mergePropertyFacts } from "@/lib/viewing-chat/collection";
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
  const configured = isSupabaseConfigured();
  const shellRef = useRef<HTMLDivElement>(null);

  const [threads, setThreads] = useState<ViewingChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState("");
  const [pendingAddressConfirm, setPendingAddressConfirm] = useState<{
    queryAddress: string;
    candidate: AddressConfirmationCandidate;
    payload: AddressLookupPayloadLike;
  } | null>(null);
  const [addressLookingUp, setAddressLookingUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [conflicts, setConflicts] = useState<FieldConflict[]>([]);
  const [softFailCtas, setSoftFailCtas] = useState(false);
  /** Advanced listing intake (hidden on A main path). */
  const [listingIntakeOpen, setListingIntakeOpen] = useState(false);
  const [status, setStatus] = useState("");
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const hoaDocInputRef = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [mobileNavTab, setMobileNavTab] = useState<MobileNavTabId | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [focusMoreOpen, setFocusMoreOpen] = useState(false);
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
    setChatMatchIndex(0);
  }, [chatSearchQuery, activeId]);

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
    setFocusMoreOpen(false);
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
    setFocusMoreOpen(false);
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

  function startNewProperty() {
    setActiveId(null);
    setAddressDraft("");
    setPendingAddressConfirm(null);
    setStatus("");
    setReplyTo(null);
    setListingIntakeOpen(false);
    setSoftFailCtas(false);
    setFocusMoreOpen(false);
    closeChatSearch();
  }

  /** Bind a confirmed normalized address to a new local viewing thread. */
  async function bindConfirmedAddress(label: string) {
    const trimmed = label.trim();
    if (!trimmed) {
      setStatus(c.needAddress);
      return;
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
    setActiveId(thread.id);
    setAddressDraft(trimmed);
    setPendingAddressConfirm(null);
    setStatus("");
    setTurnError(null);
    setTurnErrorActions([]);
    setConflicts([]);
    setListingIntakeOpen(false);
    setSoftFailCtas(false);

    void enrichAddressIntel(thread.id, trimmed, seedRecord);
  }

  /**
   * Lookup → confirmation card. Viewing is not bound until the user accepts.
   * Failed lookup shows an error and does not clear an existing thread.
   */
  async function lookupAddressForConfirmation(label: string) {
    const trimmed = label.trim();
    if (!trimmed) {
      setStatus(c.needAddress);
      return;
    }
    setAddressLookingUp(true);
    setStatus(t.address.lookingUp);
    setPendingAddressConfirm(null);
    try {
      const response = await fetch("/api/lookup-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: trimmed }),
      });
      const payload = (await response.json()) as AddressLookupPayloadLike;
      if (!response.ok) {
        throw new Error(payload.error || t.address.suggestError);
      }
      const candidate = buildAddressConfirmationCandidate(payload, trimmed);
      if (!candidate) {
        throw new Error(t.address.suggestError);
      }
      setPendingAddressConfirm({ queryAddress: trimmed, candidate, payload });
      setAddressDraft(candidate.displayAddress);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.address.suggestError);
    } finally {
      setAddressLookingUp(false);
    }
  }

  function acceptPendingAddress() {
    if (!pendingAddressConfirm) return;
    const { candidate } = pendingAddressConfirm;
    void bindConfirmedAddress(candidate.displayAddress);
  }

  function rejectPendingAddress() {
    if (!pendingAddressConfirm) return;
    const query = pendingAddressConfirm.queryAddress;
    setPendingAddressConfirm(null);
    setAddressDraft(query);
    setStatus("");
  }

  async function confirmAddress(label: string) {
    await lookupAddressForConfirmation(label);
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
  ) {
    try {
      setStatus(c.externalEnriching);
      const response = await fetch("/api/property-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          viewingId: threadId.startsWith("local_") ? null : threadId,
          consentVersion: AI_CONSENT_VERSION,
          consentSessionId: consentSessionId(),
          identityKind: userId ? "user" : "guest",
          includeFactCard: false,
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

  function skipActiveAgendaItem() {
    if (!active) return;
    const current = getActiveAgendaItem(agenda);
    const skipId =
      current?.id ||
      active.agendaActiveId ||
      "area";
    const beforeFields = { ...(active.propertyRecord?.fields ?? {}) };
    const skipped = applyCollectionSkip({
      record:
        active.propertyRecord ??
        createEmptyPropertyRecord({ address: active.address }),
      evidence: active.propertyEvidence ?? [],
      skippedFields: (active.collectionSkippedFields ?? []) as PropertyFieldId[],
      skipId,
      locale,
    });
    // Do not delete field values — only extend skippedFields
    const preservedRecord = {
      ...skipped.record,
      fields: {
        ...beforeFields,
        ...skipped.record.fields,
      },
    };
    const msg = createAiMessage({
      type: "follow_up",
      text: skipped.replyText,
    });
    const change: RecordChange = {
      fieldId: skipId.replace(/^q_/, "") as PropertyFieldId,
      kind: "skipped",
      previousValue: beforeFields[skipId.replace(/^q_/, "") as PropertyFieldId]?.value ?? null,
      nextValue: null,
    };
    patchLocalThread(active.id, {
      agendaActiveId: skipped.focusMatchedId,
      agendaSkippedIds: [
        ...new Set([...(active.agendaSkippedIds ?? []), skipId]),
      ],
      collectionSkippedFields: skipped.skippedFields,
      propertyRecord: preservedRecord,
      propertyEvidence: skipped.evidence,
      lastTurnChanges: [change],
      messages: [...active.messages, msg],
    });
    refreshLocal();
  }

  function enterReviewMode() {
    if (!active) return;
    const msg = createAiMessage({
      type: "follow_up",
      text: c.reviewHint,
    });
    patchLocalThread(active.id, {
      conversationStatus: "reviewing",
      propertyRecord: active.propertyRecord
        ? { ...active.propertyRecord, mode: "confirming" }
        : active.propertyRecord,
      messages: [...active.messages, msg],
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
    patchLocalThread(active.id, {
      propertyRecord: {
        ...base,
        fields,
        mode: "confirming",
        updatedAt: now,
      },
      conversationStatus: "reviewing",
    });
    refreshLocal();
    void generateReport();
  }

  function handleCollectionAction(id: CollectionActionId) {
    if (!active) return;
    if (id === "skip") {
      skipActiveAgendaItem();
      return;
    }
    if (id === "summarize") {
      void submitTurn({
        text: locale.startsWith("en") ? "summarize" : "整理一下",
        audio: null,
        image: null,
        file: null,
      });
      return;
    }
    if (id === "finish") {
      enterReviewMode();
      return;
    }
    if (id === "supplement") {
      setComposerHint(c.composerSupplementHint);
      document.getElementById("viewing-chat-composer")?.focus();
      return;
    }
    if (id === "correct") {
      setComposerHint(c.composerCorrectHint);
      document.getElementById("viewing-chat-composer")?.focus();
    }
  }

  function openListingIntake() {
    if (!active) return;
    setListingIntakeOpen(true);
    const guidance = createAiMessage({
      type: "follow_up",
      text: c.sourceGuidance,
    });
    patchLocalThread(active.id, {
      messages: [...active.messages, guidance],
      stage: "awaiting_property_source",
    });
    refreshLocal();
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
        url: opts.file && opts.sourceType === "image" ? URL.createObjectURL(opts.file) : undefined,
      });

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
          { code: data.code, status: response.status, error: data.error },
          aiErrorUiCopyFromBoundary(t.aiBoundary),
          { isAuthenticated: Boolean(userId) },
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
      setSoftFailCtas(softFail);
      refreshLocal();
      setStatus("");

      if (opts.file) {
        void addMediaFile(opts.file, active.id, active.address).catch(() => {});
      }
    } catch (error) {
      const aiUi =
        error && typeof error === "object" && "aiUi" in error
          ? (error as { aiUi: { message: string; actions: AiUiAction[] } }).aiUi
          : null;
      const message =
        aiUi?.message ?? (error instanceof Error ? error.message : c.sourceIngestFailed);
      setStatus(message);
      setTurnError(message);
      setTurnErrorActions(aiUi?.actions ?? ["retry"]);
    } finally {
      setSourceBusy(false);
    }
  }

  function skipSources() {
    if (!active) return;
    const msg = createAiMessage({
      type: "follow_up",
      text: c.sourceSkipped,
    });
    patchLocalThread(active.id, {
      messages: [...active.messages, msg],
      stage: "viewing_preparation",
      skippedSources: true,
    });
    setListingIntakeOpen(false);
    setSoftFailCtas(false);
    refreshLocal();
  }

  function promptPasteUrl() {
    const url = window.prompt(c.promptListingUrl, "https://");
    if (!url?.trim()) return;
    void ingestSource({ sourceType: "listing_url", url: url.trim() });
  }

  function promptPasteText() {
    const text = window.prompt(c.promptListingText, "");
    if (!text?.trim()) return;
    void ingestSource({ sourceType: "user_text", text: text.trim() });
  }

  function onSelectSuggestion(suggestion: AddressSuggestion) {
    void confirmAddress(suggestion.label);
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
        error?: string;
        code?: string;
      };
      if (!response.ok || !data.messages) {
        const ui = mapAiErrorToUi(
          { code: data.code, status: response.status, error: data.error },
          aiErrorUiCopyFromBoundary(t.aiBoundary),
          { isAuthenticated: Boolean(userId) },
        );
        throw Object.assign(new Error(ui.message), { aiUi: ui });
      }
      let nextMessages = data.messages;

      if (payload.image) {
        const previewUrl = URL.createObjectURL(payload.image);
        nextMessages = nextMessages.map((message, index) => {
          if (index === nextMessages.length - 2 && message.role === "user") {
            return {
              ...message,
              type: "photo",
              url: previewUrl,
              replyTo: replyTo ?? message.replyTo,
            };
          }
          return message;
        });
        void addMediaFile(payload.image, active.id, active.address).catch(() => {
          /* best-effort library save */
        });
      }

      if (payload.file) {
        const previewUrl = URL.createObjectURL(payload.file);
        nextMessages = nextMessages.map((message, index) => {
          if (index === nextMessages.length - 2 && message.role === "user") {
            return {
              ...message,
              type: "file",
              fileName: payload.file!.name,
              url: previewUrl,
              text: payload.text || message.text,
              replyTo: replyTo ?? message.replyTo,
            };
          }
          return message;
        });
        void addMediaFile(payload.file, active.id, active.address).catch(() => {
          /* best-effort library save */
        });
      }

      if (payload.audio) {
        const audioFile =
          payload.audio instanceof File
            ? payload.audio
            : new File([payload.audio], "note.webm", {
                type: payload.audio.type || "audio/webm",
              });
        void addMediaFile(audioFile, active.id, active.address).catch(() => {
          /* best-effort library save */
        });
      }

      saveLocalMessages(active.id, nextMessages);
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
          ? (error as { aiUi: { message: string; actions: AiUiAction[] } }).aiUi
          : null;
      const message = aiUi?.message ?? (error instanceof Error ? error.message : c.turnFailed);
      setStatus(message);
      setTurnError(message);
      setTurnErrorActions(aiUi?.actions ?? ["retry"]);
    } finally {
      setBusy(false);
    }
  }

  async function generateReport() {
    if (!active) return;
    const progress = countAgendaProgress(agenda);
    if (progress.highPending > 0) {
      const ok = window.confirm(
        c.agendaFinishWarn.replace("{count}", String(progress.highPending)),
      );
      if (!ok) return;
    }
    setBusy(true);
    setStatus(c.generatingReport);
    try {
      // Advanced only: listing sources were explicitly collected.
      if ((active.sources?.length ?? 0) > 0) {
        const form = new FormData();
        form.append("sourceType", "chat_message");
        form.append("text", "Generate initial report from collected sources.");
        form.append("address", active.address);
        form.append("locale", locale);
        form.append("consentVersion", AI_CONSENT_VERSION);
        form.append("consentSessionId", consentSessionId());
        form.append("identityKind", userId ? "user" : "guest");
        form.append("existingSources", JSON.stringify(active.sources ?? []));
        if (active.propertyData) {
          form.append("existingData", JSON.stringify(active.propertyData));
        }
        const response = await fetch("/api/property-source/ingest", {
          method: "POST",
          body: form,
        });
        const data = (await response.json()) as {
          report?: InitialPropertyReport | null;
          propertyData?: PropertyData;
          sources?: PropertySource[];
          steps?: PipelineStepLog[];
          conflicts?: FieldConflict[];
          error?: string;
          code?: string;
        };
        if (!response.ok) {
          const ui = mapAiErrorToUi(
            { code: data.code, status: response.status, error: data.error },
            aiErrorUiCopyFromBoundary(t.aiBoundary),
            { isAuthenticated: Boolean(userId) },
          );
          throw Object.assign(new Error(ui.message), { aiUi: ui });
        }
        const reportMsg = createAiMessage({
          type: "initial_report",
          text: c.initialReportReady,
          initialReport: data.report ?? undefined,
        });
        patchLocalThread(active.id, {
          messages: [...active.messages, reportMsg],
          initialReport: data.report ?? null,
          propertyData: data.propertyData ?? active.propertyData,
          sources: data.sources ?? active.sources,
          pipelineSteps: data.steps ?? active.pipelineSteps,
          stage: "report_ready",
          conversationStatus: "completed",
        });
        setConflicts(data.conflicts ?? []);
        refreshLocal();
        setStatus("");
        return;
      }

      // A default: viewing report from on-site chat turns.
      const response = await fetch("/api/viewing-chat/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: active.address,
          locale,
          viewingId: active.id.startsWith("local_") ? "" : active.id,
          messages: active.messages,
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
          { code: data.code, status: response.status, error: data.error },
          aiErrorUiCopyFromBoundary(t.aiBoundary),
          { isAuthenticated: Boolean(userId) },
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
          ? (error as { aiUi: { message: string; actions: AiUiAction[] } }).aiUi
          : null;
      const message =
        aiUi?.message ?? (error instanceof Error ? error.message : c.reportFailed);
      setStatus(message);
      setTurnError(message);
      setTurnErrorActions(aiUi?.actions ?? ["retry"]);
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
      window.location.href = "/login";
      return;
    }
    if (action === "upgrade") {
      if (!userId) {
        window.location.href = "/login";
        return;
      }
      try {
        const response = await fetch("/api/create-checkout-session", { method: "POST" });
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

  function requestShare() {
    if (!configured || !userId) {
      setStatus(c.loginToShare);
      return;
    }
    setStatus(c.loginToShare);
  }

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
    }
  }

  function deleteThread(id: string) {
    if (!window.confirm(c.deleteHistoryConfirm)) return;
    deleteLocalThread(id);
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
    refreshLocal();
  }

  return (
    <div
      ref={shellRef}
      className="fixed inset-0 flex h-[100svh] max-h-[100svh] w-full flex-col overflow-hidden bg-[#FAF6F1] text-[#1A1A1A]"
    >
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
              <button
                type="button"
                disabled={busy || active.messages.length === 0}
                onClick={() => {
                  if (active.conversationStatus === "reviewing") {
                    void generateReport();
                  } else {
                    enterReviewMode();
                  }
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#2563EB] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {busy
                  ? c.generatingReport
                  : active.conversationStatus === "reviewing"
                    ? c.reviewConfirm
                    : c.actionFinish}
              </button>
              <div className="relative md:hidden">
                <button
                  type="button"
                  onClick={() => setFocusMoreOpen((v) => !v)}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    focusMoreOpen
                      ? "bg-black text-white"
                      : "text-[#4B5563] hover:bg-black/5"
                  }`}
                  aria-label={c.chatFocusMore}
                  title={c.chatFocusMore}
                  aria-expanded={focusMoreOpen}
                  aria-haspopup="menu"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {focusMoreOpen ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-40 cursor-default"
                      aria-label={c.searchClose}
                      onClick={() => setFocusMoreOpen(false)}
                    />
                    <div
                      role="menu"
                      className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[11rem] overflow-hidden rounded-2xl border border-black/8 bg-white py-1 shadow-[0_8px_28px_rgba(0,0,0,0.12)]"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3.5 py-2.5 text-left text-[13px] font-bold text-[#1A1A1A] active:bg-black/5"
                        onClick={() => handleMobileNav("new")}
                      >
                        {c.newThread}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3.5 py-2.5 text-left text-[13px] font-bold text-[#1A1A1A] active:bg-black/5"
                        onClick={() => handleMobileNav("history")}
                      >
                        {c.openHistory}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3.5 py-2.5 text-left text-[13px] font-bold text-[#1A1A1A] active:bg-black/5"
                        onClick={() => handleMobileNav("media")}
                      >
                        {c.mediaLibrary}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
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
                emptyHint={
                  sourceBusy
                    ? c.sourceExtracting
                    : listingIntakeOpen
                      ? c.emptyChatCollect
                      : c.emptyChatCapture
                }
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
              {listingIntakeOpen ||
              isCollectingStage(active.stage ?? "viewing_preparation") ? (
                <>
                  <CollectionQuickActions
                    disabled={busy || sourceBusy}
                    labels={{
                      pasteUrl: c.quickPasteUrl,
                      uploadPhoto: c.quickUploadPhoto,
                      uploadScreenshot: c.quickUploadScreenshot,
                      uploadHoaDoc: c.quickUploadHoaDoc,
                      pasteText: c.quickPasteText,
                      skip: c.quickSkip,
                    }}
                    onPasteUrl={promptPasteUrl}
                    onUploadPhoto={() => photoInputRef.current?.click()}
                    onUploadScreenshot={() => screenshotInputRef.current?.click()}
                    onUploadHoaDoc={() => hoaDocInputRef.current?.click()}
                    onPasteText={promptPasteText}
                    onSkip={skipSources}
                  />
                  {softFailCtas ? (
                    <div className="px-3 pb-2">
                      <p className="mb-1 text-[11px] font-semibold text-[#92400E]">
                        {c.sourceSoftFailHint}
                      </p>
                      <SourceSoftFailActions
                        disabled={busy || sourceBusy}
                        labels={{
                          pasteText: c.quickPasteText,
                          uploadScreenshot: c.quickUploadScreenshot,
                        }}
                        onPasteText={() => {
                          setSoftFailCtas(false);
                          promptPasteText();
                        }}
                        onUploadScreenshot={() => {
                          setSoftFailCtas(false);
                          screenshotInputRef.current?.click();
                        }}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <ReportQuickActions
                    disabled={busy || sourceBusy}
                    actions={[
                      { id: "supplement", label: c.actionSupplement },
                      { id: "correct", label: c.actionCorrect },
                      { id: "skip", label: c.actionSkip },
                      { id: "summarize", label: c.actionSummarize },
                      { id: "finish", label: c.actionFinish },
                    ]}
                    onAction={handleCollectionAction}
                  />
                  <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                    <button
                      type="button"
                      disabled={busy || sourceBusy}
                      onClick={openListingIntake}
                      className="rounded-full border border-dashed border-black/15 bg-transparent px-3 py-1.5 text-[11px] font-semibold text-[#6B7280] disabled:opacity-40"
                    >
                      {c.quickAddListingOptional}
                    </button>
                  </div>
                </>
              )}
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
                  // A default: all composer input is on-site capture via chat turn.
                  // Listing ingest stays behind CollectionQuickActions (optional).
                  if (
                    listingIntakeOpen &&
                    (payload.text.trim().startsWith("http://") ||
                      payload.text.trim().startsWith("https://"))
                  ) {
                    await ingestSource({
                      sourceType: "listing_url",
                      url: payload.text.trim(),
                    });
                    return;
                  }
                  await submitTurn(payload);
                }}
              />
            </div>
              </div>

              {/* Desktop: right-side summary — chat stays usable */}
              {summaryOpen ? (
                <aside className="hidden min-h-0 w-[340px] shrink-0 flex-col border-l border-black/8 bg-white lg:flex">
                  <div className="flex shrink-0 items-center justify-between border-b border-black/8 px-3 py-2">
                    <p className="text-[13px] font-bold">
                      {active.conversationStatus === "reviewing"
                        ? c.reviewTitle
                        : c.summaryTitle}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSummaryOpen(false)}
                      className="rounded-full p-1.5 text-[#4B5563] hover:bg-black/5"
                      aria-label={c.summaryClose}
                    >
                      <X className="h-4 w-4" />
                    </button>
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
                <div className="flex shrink-0 items-center justify-between border-b border-black/8 px-3 py-2">
                  <p className="text-[13px] font-bold">
                    {active.conversationStatus === "reviewing"
                      ? c.reviewTitle
                      : c.summaryTitle}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSummaryOpen(false)}
                    className="rounded-full p-1.5 text-[#4B5563] hover:bg-black/5"
                    aria-label={c.summaryClose}
                  >
                    <X className="h-4 w-4" />
                  </button>
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
                <p className="mt-1 text-[10px] font-bold tracking-[0.16em] text-[#6B7280]">
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
                  busy={addressLookingUp}
                  onConfirm={acceptPendingAddress}
                  onReject={rejectPendingAddress}
                />
              ) : (
                <AddressAutocomplete
                  value={addressDraft}
                  onChange={(value) => {
                    setPendingAddressConfirm(null);
                    setAddressDraft(value);
                  }}
                  onSelect={onSelectSuggestion}
                  onCommit={(label) => void confirmAddress(label)}
                  disabled={addressLookingUp}
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
              {addressLookingUp ? (
                <p className="text-center text-[12px] text-[#6B7280]" role="status">
                  {t.address.lookingUp}
                </p>
              ) : status ? (
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
                  : !active
                    ? "new"
                    : mobileNavTab
        }
        disabledTabs={
          !active &&
          !accountOpen &&
          !mediaOpen &&
          !searchOpen &&
          !(historyOpen && isMobileViewport)
            ? { new: c.newThreadAlreadyActive }
            : undefined
        }
        labels={{
          nav: c.mobileNavLabel,
          new: c.tabNew,
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
        onClose={() => {
          setHistoryOpen(false);
          setMobileNavTab(null);
        }}
        onSelectThread={selectThread}
        onDeleteThread={deleteThread}
        onTogglePinThread={togglePinThread}
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
        }}
      />

      <MobileAccountSheet
        open={accountOpen}
        onClose={() => {
          setAccountOpen(false);
          setMobileNavTab(null);
        }}
      />

      {searchOpen ? (
        <HistorySearchPanel
          threads={threads}
          activeId={activeId}
          onSelect={selectThread}
          onClose={() => {
            setSearchOpen(false);
            setMobileNavTab(null);
          }}
          railExpanded={historyOpen}
          labels={{
            title: c.searchRecords,
            placeholder: c.searchPlaceholder,
            empty: c.emptyHistory,
            noResults: c.searchNoResults,
            close: c.searchClose,
          }}
        />
      ) : null}

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
