"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ThumbsDown, ThumbsUp } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { ViewingChatComposer } from "@/components/viewing-chat/ViewingChatComposer";
import { useChatMediaUrl } from "@/components/viewing-chat/useChatMediaUrl";
import { AI_CONSENT_VERSION } from "@/lib/ai-boundary/client";
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
import { applyChatStateToLocal } from "@/lib/viewing-chat/chat-state";
import { buildChatStatePayload, pushViewingThread } from "@/lib/viewing-chat/cloud-push";
import { appendChatMessages } from "@/lib/viewing-chat/append-messages";
import {
  getLocalThread,
  patchLocalThread,
  saveLocalMessages,
  upsertLocalThread,
} from "@/lib/viewing-chat/local-store";
import { addMediaFile } from "@/lib/viewing-chat/media-library";
import { uploadViewingFile, appendViewingPath } from "@/lib/media";
import { getSupabase } from "@/lib/supabase";
import {
  createUserMessage,
  type ChatMessage,
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
  upsertLocalThread({
    ...restored,
    address: row.address || restored.address,
    messages: appendChatMessages(restored.messages ?? [], row.messages ?? []),
    report: row.report ?? restored.report,
    metadata: row.metadata ?? restored.metadata,
    updatedAt: row.updated_at,
    ownerUserId,
    cloud: {
      state: "synced",
      lastSyncedAt: row.updated_at,
      revision: row.revision,
    },
  });
  return true;
}

function NoteMedia({ message }: { message: ChatMessage }) {
  const ref = message.media?.[0] ?? null;
  const { url } = useChatMediaUrl(ref);
  if (message.type === "photo" && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="mt-2 max-h-56 w-full rounded-xl object-cover" />;
  }
  if (message.type === "audio" && url) {
    return <audio className="mt-2 w-full" controls src={url} />;
  }
  return null;
}

export function ViewingSessionApp({ viewingId }: { viewingId: string }) {
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
  const reportStale = Boolean(
    shownReport &&
      fingerprint &&
      (shownReport.notesFingerprint ?? thread?.reportNotesFingerprint) &&
      (shownReport.notesFingerprint ?? thread?.reportNotesFingerprint) !== fingerprint,
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

  function queueSync() {
    if (!userId) return;
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      void (async () => {
        const current = getLocalThread(viewingId);
        if (!current) return;
        const pushed = await pushViewingThread({
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
            ownerUserId: userId,
            cloud: {
              state: "synced",
              lastSyncedAt: new Date().toISOString(),
              revision: pushed.revision,
            },
          });
          refresh();
        }
      })();
    }, 600);
  }

  function setBriefingFeedback(value: ViewingBriefingFeedback) {
    if (!briefing || !briefingHasContent(briefing)) return;
    const nextValue: ViewingBriefingFeedback | null =
      briefing.feedback === value ? null : value;
    const next: ViewingBriefing = {
      ...briefing,
      feedback: nextValue,
      feedbackAt: nextValue ? new Date().toISOString() : null,
    };
    setBriefing(next);
    patchLocalThread(viewingId, { briefing: next });
    queueSync();
  }

  useEffect(() => {
    const supabase = getSupabase();
    void (async () => {
      let uid: string | null = null;
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        uid = data.user?.id ?? null;
        setUserId(uid);
      }
      if (uid) {
        const ok = await hydrateViewingThread(viewingId, uid);
        if (!ok && !getLocalThread(viewingId)) {
          setMissing(true);
          setReady(true);
          return;
        }
      } else if (!getLocalThread(viewingId)) {
        setMissing(true);
        setReady(true);
        return;
      }
      const local = getLocalThread(viewingId);
      if (!local) {
        setMissing(true);
        setReady(true);
        return;
      }
      setThread(local);
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
    return () => window.clearTimeout(syncTimer.current);
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

  async function uploadNoteMedia(
    file: File,
    kind: "image" | "audio" | "file",
  ) {
    const saved = await addMediaFile(file, viewingId, thread?.address ?? "");
    let path: string | null = null;
    if (userId && kind !== "file") {
      try {
        const folder = kind === "audio" ? "audios" : "photos";
        const column = kind === "audio" ? "audio_urls" : "photo_urls";
        path = await uploadViewingFile(viewingId, folder, file, saved.id);
        await appendViewingPath(viewingId, column, path);
      } catch {
        path = null;
      }
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

  async function appendNote(payload: {
    text: string;
    audio: Blob | null;
    image: File | null;
    file: File | null;
  }) {
    if (!thread) return;
    setStatus("");
    let message: ChatMessage;

    if (payload.image) {
      const media = await uploadNoteMedia(payload.image, "image");
      message = createUserMessage({
        type: "photo",
        text: payload.text.trim() || undefined,
        media: [media],
      });
    } else if (payload.audio) {
      const file = new File(
        [payload.audio],
        `note-${Date.now()}.webm`,
        { type: payload.audio.type || "audio/webm" },
      );
      const media = await uploadNoteMedia(file, "audio");
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
      message = createUserMessage({
        type: "audio",
        transcript: transcript || undefined,
        text: transcript || payload.text.trim() || undefined,
        media: [media],
      });
    } else if (payload.file) {
      const media = await uploadNoteMedia(payload.file, "file");
      message = createUserMessage({
        type: "file",
        text: payload.text.trim() || payload.file.name,
        fileName: payload.file.name,
        media: [media],
      });
    } else {
      const text = payload.text.trim();
      if (!text) return;
      message = createUserMessage({ type: "text", text });
    }

    const nextMessages = [...thread.messages, message];
    saveLocalMessages(viewingId, nextMessages);
    // Changing notes expires the shown report product without deleting notes.
    if (shownReport) {
      patchLocalThread(viewingId, {
        reportNotesFingerprint: shownReport.notesFingerprint ?? thread.reportNotesFingerprint,
      });
    }
    refresh();
    queueSync();
  }

  async function generateReport() {
    if (!thread) return;
    setReportBusy(true);
    setStatus(c.generatingReport);
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
          consentVersion: AI_CONSENT_VERSION,
          consentSessionId: consentSessionId(),
          identityKind: userId ? "user" : "guest",
        }),
      });
      const data = (await response.json()) as {
        report?: ChatReportSnapshot;
        notesFingerprint?: string;
        error?: string;
      };
      if (!response.ok || !data.report) {
        setStatus(data.error || c.generatingReport);
        return;
      }
      const fingerprintNext = data.notesFingerprint ?? notesFingerprint(thread.messages);
      patchLocalThread(viewingId, {
        report: data.report,
        reportNotesFingerprint: fingerprintNext,
      });
      // Keep report as a product — do not append AI report bubbles into the notes stream.
      setShownReport({ ...data.report, notesFingerprint: fingerprintNext });
      setStatus("");
      refresh();
      queueSync();
    } catch {
      setStatus(c.generatingReport);
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
        <Link href="/" className="text-[13px] font-bold underline">
          {t.loginPage.backHome}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100svh] w-full max-w-[520px] flex-col bg-[#FAF6F1] text-[#1A1A1A]">
      <header className="sticky top-0 z-10 border-b border-black/8 bg-[#FAF6F1]/95 px-4 py-3 backdrop-blur">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6B7280]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t.loginPage.backHome}
        </Link>
        <h1 className="mt-2 text-[18px] font-bold leading-snug">{thread.address}</h1>
      </header>

      <section className="border-b border-black/8 px-4 py-4" aria-labelledby="briefing-heading">
        <h2 id="briefing-heading" className="text-[13px] font-bold tracking-wide">
          {c.briefingTitle}
        </h2>
        {briefingBusy && !briefingHasContent(briefing) ? (
          <p className="mt-3 text-[13px] text-[#6B7280]">{c.briefingLoading}</p>
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
                className="mt-3 flex items-center gap-2"
                role="group"
                aria-label={`${c.briefingLike} / ${c.briefingDislike}`}
              >
                <button
                  type="button"
                  onClick={() => setBriefingFeedback("like")}
                  aria-pressed={briefing.feedback === "like"}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                    briefing.feedback === "like"
                      ? "bg-[#1A1A1A] text-white"
                      : "bg-black/5 text-[#374151] hover:bg-black/10"
                  }`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                  {c.briefingLike}
                </button>
                <button
                  type="button"
                  onClick={() => setBriefingFeedback("dislike")}
                  aria-pressed={briefing.feedback === "dislike"}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                    briefing.feedback === "dislike"
                      ? "bg-[#1A1A1A] text-white"
                      : "bg-black/5 text-[#374151] hover:bg-black/10"
                  }`}
                >
                  <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
                  {c.briefingDislike}
                </button>
              </div>
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
            notes.map((note) => (
              <article
                key={note.id}
                className="rounded-2xl bg-white px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
              >
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
                  {note.transcript || note.text || (note.type === "photo" ? "📷" : note.fileName) || "…"}
                </p>
                <NoteMedia message={note} />
                <p className="mt-2 text-[10px] text-[#9CA3AF]">
                  {new Date(note.timestamp).toLocaleString()}
                </p>
              </article>
            ))
          )}
          <div ref={notesEndRef} />
        </div>
      </section>

      <section className="border-t border-black/8 px-4 py-4" aria-labelledby="report-heading">
        <h2 id="report-heading" className="text-[13px] font-bold tracking-wide">
          {c.reportTitle}
        </h2>
        {!shownReport ? (
          <p className="mt-2 text-[13px] text-[#6B7280]">{c.reportNone}</p>
        ) : (
          <div className="mt-3 space-y-3 rounded-2xl bg-white px-4 py-4 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
            {reportStale ? (
              <p className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-[12px] font-semibold text-[#92400E]">
                {c.reportStale}
              </p>
            ) : null}
            {shownReport.summary ? (
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{shownReport.summary}</p>
            ) : null}
            {shownReport.pros.length ? (
              <div>
                <p className="text-[12px] font-bold text-[#166534]">優點</p>
                <ul className="mt-1 list-disc pl-4 text-[13px]">
                  {shownReport.pros.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {shownReport.risks.length ? (
              <div>
                <p className="text-[12px] font-bold text-[#991B1B]">風險</p>
                <ul className="mt-1 list-disc pl-4 text-[13px]">
                  {shownReport.risks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {shownReport.checklist.length ? (
              <div>
                <p className="text-[12px] font-bold">檢查</p>
                <ul className="mt-1 space-y-1 text-[13px]">
                  {shownReport.checklist.map((row) => (
                    <li key={row.id}>
                      {row.question}：
                      {row.status === "unknown"
                        ? c.reportUnseen
                        : row.answer || c.reportUnseen}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
        <button
          type="button"
          disabled={reportBusy}
          onClick={() => void generateReport()}
          className="mt-3 h-11 w-full rounded-full bg-black text-[14px] font-bold text-white disabled:opacity-40"
        >
          {reportBusy ? c.generatingReport : c.generateReport}
        </button>
        {status ? (
          <p className="mt-2 text-center text-[12px] font-semibold text-[#92400E]" role="status">
            {status}
          </p>
        ) : null}
      </section>

      <div className="sticky bottom-0 border-t border-black/8 bg-[#FAF6F1]">
        <ViewingChatComposer
          edgeToBottom
          permissionCopy={t.permissions}
          labels={{
            placeholder: c.notesEmpty,
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
          }}
          onSubmit={async (payload) => {
            await appendNote(payload);
          }}
        />
      </div>
    </div>
  );
}
