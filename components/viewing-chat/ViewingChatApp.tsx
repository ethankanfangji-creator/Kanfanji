"use client";

import { ChevronDown, ChevronUp, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddressAutocomplete } from "@/components/viewing-wizard/AddressAutocomplete";
import { useI18n } from "@/components/I18nProvider";
import { ChatMessageList } from "@/components/viewing-chat/ChatMessageList";
import { HistorySearchPanel } from "@/components/viewing-chat/HistorySearchPanel";
import { IconRail } from "@/components/viewing-chat/IconRail";
import { MediaLibraryPanel } from "@/components/viewing-chat/MediaLibraryPanel";
import { ViewingChatComposer } from "@/components/viewing-chat/ViewingChatComposer";
import { AI_CONSENT_VERSION } from "@/lib/ai-boundary/client";
import type { AddressSuggestion } from "@/lib/address-suggest";
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
import { ReportQuickActions } from "@/components/viewing-chat/ReportQuickActions";
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
import { applyCollectionSkip } from "@/lib/viewing-chat/collection";
import type {
  PropertyCollectionRecord,
  PropertyFactEvidence,
  PropertyFieldId,
} from "@/lib/viewing-chat/collection/types";
import { createEmptyPropertyRecord } from "@/lib/viewing-chat/collection";

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
  const [historyOpen, setHistoryOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatReplyRef | null>(null);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatMatchIndex, setChatMatchIndex] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const chatSearchInputRef = useRef<HTMLInputElement>(null);

  const active = useMemo(
    () => threads.find((thread) => thread.id === activeId) ?? null,
    [threads, activeId],
  );

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
    // Desktop: history open by default; mobile starts closed.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setHistoryOpen(false);
    }
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
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
    };

    const syncShellToKeyboard = () => {
      if (!vv || !isTextEditingTarget(document.activeElement)) {
        clearShellOffset();
        return;
      }
      shell.style.height = `${Math.round(vv.height)}px`;
      shell.style.transform = vv.offsetTop ? `translateY(${Math.round(vv.offsetTop)}px)` : "";
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

  function refreshLocal() {
    setThreads(listLocalThreads());
  }

  function startNewProperty() {
    setActiveId(null);
    setAddressDraft("");
    setStatus("");
    setReplyTo(null);
    setListingIntakeOpen(false);
    setSoftFailCtas(false);
    closeChatSearch();
  }

  async function confirmAddress(label: string) {
    const trimmed = label.trim();
    if (!trimmed) {
      setStatus(c.needAddress);
      return;
    }
    const market = inferAgendaMarket(trimmed);
    const firstId = openingAgendaActiveId(market);
    const resolveLabels = createAgendaLabelResolver(c);
    const firstQuestion =
      projectAgenda({
        messages: [],
        activeId: firstId,
        market,
        resolveLabels,
      }).find((item) => item.id === firstId)?.question ?? firstId;
    // Option A: address → on-site capture; seed only the first agenda question.
    const guidance = createAiMessage({
      type: "follow_up",
      text: c.viewingGuidanceFirst.replace("{question}", firstQuestion),
    });
    const thread = createLocalThread(trimmed, [guidance], null);
    patchLocalThread(thread.id, {
      stage: "viewing_preparation",
      normalizedAddress: trimmed,
      skippedSources: true,
      agendaActiveId: firstId,
      agendaSkippedIds: [],
      agendaMarket: market,
      propertyRecord: createEmptyPropertyRecord({
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
      }),
      propertyEvidence: [],
      collectionSkippedFields: [],
    });
    refreshLocal();
    setActiveId(thread.id);
    setAddressDraft(trimmed);
    setStatus("");
    setConflicts([]);
    setListingIntakeOpen(false);
    setSoftFailCtas(false);
  }

  function skipActiveAgendaItem() {
    if (!active) return;
    const current = getActiveAgendaItem(agenda);
    const skipId =
      current?.id ||
      active.agendaActiveId ||
      active.collectionSkippedFields?.[0] ||
      "area";
    const skipped = applyCollectionSkip({
      record:
        active.propertyRecord ??
        createEmptyPropertyRecord({ address: active.address }),
      evidence: active.propertyEvidence ?? [],
      skippedFields: (active.collectionSkippedFields ?? []) as PropertyFieldId[],
      skipId,
      locale,
    });
    const msg = createAiMessage({
      type: "follow_up",
      text: skipped.replyText,
    });
    patchLocalThread(active.id, {
      agendaActiveId: skipped.focusMatchedId,
      agendaSkippedIds: [
        ...new Set([...(active.agendaSkippedIds ?? []), skipId]),
      ],
      collectionSkippedFields: skipped.skippedFields,
      propertyRecord: skipped.record,
      propertyEvidence: skipped.evidence,
      messages: [...active.messages, msg],
    });
    refreshLocal();
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
        if (data.code === "ai_quota_exceeded" || response.status === 429) {
          throw new Error(t.aiBoundary.quota);
        }
        throw new Error(data.error || data.code || c.sourceIngestFailed);
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
      setStatus(error instanceof Error ? error.message : c.sourceIngestFailed);
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
    setStatus("");
    try {
      const fileNote = payload.file
        ? locale.startsWith("en")
          ? `[Uploaded file: ${payload.file.name}]`
          : `【已上傳檔案：${payload.file.name}】`
        : "";
      const textForAi = [payload.text, fileNote].filter(Boolean).join("\n");

      const form = new FormData();
      form.append("address", active.address);
      form.append("locale", locale);
      form.append("viewingId", active.id.startsWith("local_") ? "" : active.id);
      form.append("text", textForAi);
      form.append("messages", JSON.stringify(active.messages));
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
        error?: string;
        code?: string;
      };
      if (!response.ok || !data.messages) {
        if (data.code === "ai_quota_exceeded" || response.status === 429) {
          throw new Error(t.aiBoundary.quota);
        }
        throw new Error(data.error || data.code || c.turnFailed);
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
      });
      refreshLocal();
      setReplyTo(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : c.turnFailed);
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
          throw new Error(data.error || data.code || c.reportFailed);
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
        throw new Error(data.error || data.code || c.reportFailed);
      }
      saveLocalMessages(active.id, data.messages, data.report ?? null);
      patchLocalThread(active.id, { stage: "report_ready" });
      refreshLocal();
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : c.reportFailed);
    } finally {
      setBusy(false);
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
      className="fixed inset-0 flex h-[100svh] max-h-[100svh] w-full overflow-hidden bg-[#FAF6F1] text-[#1A1A1A]"
    >
      <IconRail
        sidebarOpen={historyOpen}
        onToggleSidebar={() => {
          setHistoryOpen((v) => !v);
          setSearchOpen(false);
          setMediaOpen(false);
        }}
        onNew={() => {
          startNewProperty();
          setSearchOpen(false);
          setMediaOpen(false);
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

      <section className="mx-auto flex min-h-0 min-w-0 max-w-[900px] flex-1 flex-col">
        {active ? (
          <>
            <header className="flex shrink-0 items-center justify-end gap-2 border-b border-black/8 bg-[#FAF6F1]/95 px-3 py-2.5 pt-[max(0.65rem,env(safe-area-inset-top))] backdrop-blur">
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
                onClick={() => void generateReport()}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#2563EB] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {busy ? c.generatingReport : c.generateReport}
              </button>
            </header>
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
                    items={[
                      c.quickAskAgent,
                      c.quickChecklist,
                      c.quickPhotoCheck,
                      c.quickNextRoom,
                      c.agendaSkip,
                    ]}
                    onPick={(prompt) => {
                      if (prompt === c.agendaSkip) {
                        skipActiveAgendaItem();
                        return;
                      }
                      void submitTurn({
                        text: prompt,
                        audio: null,
                        image: null,
                        file: null,
                      });
                    }}
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
              <ViewingChatComposer
                busy={busy || sourceBusy}
                replyTo={replyTo}
                onClearReply={() => setReplyTo(null)}
                labels={{
                  placeholder: c.composerPlaceholder,
                  send: c.send,
                  recording: c.recording,
                  stop: c.stop,
                  attach: c.attach,
                  camera: c.attachCamera,
                  uploadImage: c.attachImage,
                  uploadFile: c.attachFile,
                  empty: c.emptyComposer,
                  micDenied: c.micDenied,
                  replyingTo: c.replyingTo,
                  replyCancel: c.replyCancel,
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
              <AddressAutocomplete
                value={addressDraft}
                onChange={setAddressDraft}
                onSelect={onSelectSuggestion}
                onCommit={(label) => void confirmAddress(label)}
                copy={{
                  placeholder: c.addressPlaceholder,
                  loading: t.address.suggestLoading,
                  empty: t.address.suggestEmpty,
                  error: t.address.suggestError,
                  listLabel: t.address.suggestListLabel,
                  search: c.confirmAddress,
                }}
              />
              {status ? (
                <p
                  className="text-center text-[12px] font-semibold text-[#92400E]"
                  role="status"
                >
                  {status}
                </p>
              ) : (
                <p className="text-center text-[13px] text-[#6B7280]">{c.emptyChat}</p>
              )}
            </div>
          </div>
        )}
      </section>

      {searchOpen ? (
        <HistorySearchPanel
          threads={threads}
          activeId={activeId}
          onSelect={selectThread}
          onClose={() => setSearchOpen(false)}
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
          onClose={() => setMediaOpen(false)}
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
