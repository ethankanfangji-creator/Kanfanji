"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddressAutocomplete } from "@/components/viewing-wizard/AddressAutocomplete";
import { useI18n } from "@/components/I18nProvider";
import { ChatMessageList } from "@/components/viewing-chat/ChatMessageList";
import { HistorySearchPanel } from "@/components/viewing-chat/HistorySearchPanel";
import { IconRail } from "@/components/viewing-chat/IconRail";
import { MediaLibraryPanel } from "@/components/viewing-chat/MediaLibraryPanel";
import { PropertyIntelCard } from "@/components/viewing-chat/PropertyIntelCard";
import { ViewingChatComposer } from "@/components/viewing-chat/ViewingChatComposer";
import { AI_CONSENT_VERSION } from "@/lib/ai-boundary/client";
import type { AddressSuggestion } from "@/lib/address-suggest";
import { formatIntelMessage } from "@/lib/property-intel/format";
import type { PropertyIntel } from "@/lib/property-intel/types";
import type { PropertyReport } from "@/lib/property-facts/report-types";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  createLocalThread,
  deleteLocalThread,
  listLocalThreads,
  saveLocalMessages,
  setLocalThreadPinned,
} from "@/lib/viewing-chat/local-store";
import { addMediaFile } from "@/lib/viewing-chat/media-library";
import { createAiMessage, type ChatMessage, type ViewingChatThread } from "@/lib/viewing-chat/types";

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

export function ViewingChatApp() {
  const { messages: t, locale } = useI18n();
  const c = t.chat;
  const configured = isSupabaseConfigured();

  const [threads, setThreads] = useState<ViewingChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [intelLoading, setIntelLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const active = useMemo(
    () => threads.find((thread) => thread.id === activeId) ?? null,
    [threads, activeId],
  );

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

  function refreshLocal() {
    setThreads(listLocalThreads());
  }

  function startNewProperty() {
    setActiveId(null);
    setAddressDraft("");
    setStatus("");
    setIntelLoading(false);
  }

  async function confirmAddress(label: string) {
    const trimmed = label.trim();
    if (!trimmed) {
      setStatus(c.needAddress);
      return;
    }
    const thread = createLocalThread(trimmed, [], null);
    refreshLocal();
    setActiveId(thread.id);
    setAddressDraft(trimmed);
    setIntelLoading(true);
    setStatus(c.intelLoading);
    try {
      const response = await fetch("/api/property-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: trimmed,
          viewingId: thread.id.startsWith("local_") ? "" : thread.id,
          consentVersion: AI_CONSENT_VERSION,
          consentSessionId: consentSessionId(),
          identityKind: userId ? "user" : "guest",
        }),
      });
      const data = (await response.json()) as {
        intel?: PropertyIntel;
        report?: PropertyReport;
        error?: string;
        code?: string;
      };
      if (!response.ok || !data.intel) {
        throw new Error(data.error || data.code || c.intelFailed);
      }
      const intelMsg = createAiMessage({
        type: "intel",
        text: formatIntelMessage(data.intel, locale),
        intel: data.intel,
      });
      saveLocalMessages(thread.id, [intelMsg], null, data.intel, data.report ?? null);
      refreshLocal();
      setStatus("");
    } catch (error) {
      const fallback = createAiMessage({
        type: "follow_up",
        text:
          locale.startsWith("en")
            ? "Could not finish property intel. Let's start on site — check the electrical panel first?"
            : "房源情報暫時查不到，我們先現場看電箱？",
      });
      saveLocalMessages(thread.id, [fallback], null, null);
      refreshLocal();
      setStatus(error instanceof Error ? error.message : c.intelFailed);
    } finally {
      setIntelLoading(false);
    }
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
        error?: string;
        code?: string;
      };
      if (!response.ok || !data.messages) {
        throw new Error(data.error || data.code || c.turnFailed);
      }
      let nextMessages = data.messages;

      if (payload.image) {
        const previewUrl = URL.createObjectURL(payload.image);
        nextMessages = nextMessages.map((message, index) => {
          if (index === nextMessages.length - 2 && message.role === "user") {
            return { ...message, type: "photo", url: previewUrl };
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
      refreshLocal();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : c.turnFailed);
    } finally {
      setBusy(false);
    }
  }

  async function generateReport() {
    if (!active) return;
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
      setIntelLoading(false);
    }
  }

  function togglePinThread(id: string) {
    const thread = listLocalThreads().find((item) => item.id === id);
    if (!thread) return;
    setLocalThreadPinned(id, !thread.pinned);
    refreshLocal();
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#FAF6F1] text-[#1A1A1A]">
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

      <section className="mx-auto flex min-w-0 max-w-[900px] flex-1 flex-col">
        {active ? (
          <>
            <header className="flex shrink-0 items-center justify-end gap-3 border-b border-black/8 bg-[#FAF6F1]/95 px-3 py-2.5 pt-[max(0.65rem,env(safe-area-inset-top))] backdrop-blur">
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
            {active.metadata ? (
              <PropertyIntelCard
                intel={active.metadata}
                labels={{
                  title: c.intelCardTitle,
                  year: c.intelYear,
                  type: c.intelType,
                  sold: c.intelSold,
                  strata: c.intelStrata,
                  risks: c.intelRisks,
                  unknown: c.intelUnknown,
                  transit: c.intelTransit,
                  schools: c.intelSchools,
                  market: c.intelMarket,
                  streetViewNotice: c.intelStreetViewNotice,
                  unitLevelNotice: c.intelUnitLevelNotice,
                }}
              />
            ) : intelLoading ? (
              <div className="border-b border-black/8 bg-white px-4 py-3 text-center text-[13px] font-semibold text-[#6B7280]">
                {c.intelLoading}
              </div>
            ) : null}
            <div className="shrink-0 border-b border-black/8 bg-white/80 px-4 py-2.5">
              <p className="truncate text-center text-[14px] font-bold">{active.address}</p>
              {status ? (
                <p
                  className="mt-1 text-center text-[12px] font-semibold text-[#92400E]"
                  role="status"
                >
                  {status}
                </p>
              ) : null}
            </div>
            <ChatMessageList
              messages={active.messages}
              emptyHint={intelLoading ? c.intelLoading : c.emptyChat}
              onShareReport={requestShare}
              shareLabel={c.shareReport}
            />
            <ViewingChatComposer
              busy={busy || intelLoading}
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
              }}
              onSubmit={submitTurn}
            />
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
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
                disabled={intelLoading}
                copy={{
                  placeholder: c.addressPlaceholder,
                  loading: t.address.suggestLoading,
                  empty: t.address.suggestEmpty,
                  error: t.address.suggestError,
                  listLabel: t.address.suggestListLabel,
                  search: c.confirmAddress,
                }}
              />
              {intelLoading ? (
                <p className="text-center text-[13px] font-semibold text-[#6B7280]" role="status">
                  {c.intelLoading}
                </p>
              ) : status ? (
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
