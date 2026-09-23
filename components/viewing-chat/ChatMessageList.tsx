"use client";

import { Reply } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  canReplyToMessage,
  messageSearchHaystack,
  toReplyRef,
  type ChatMessage,
  type ChatReplyRef,
} from "@/lib/viewing-chat/types";
import { resolveAgendaId } from "@/lib/viewing-chat/agenda-catalog";
import { InitialReportCard } from "@/components/viewing-chat/InitialReportCard";

const LONG_PRESS_MS = 480;
const MOVE_CANCEL_PX = 12;

function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /[？?]/.test(t) || /^(下一|Next|ข้อถัดไป)/i.test(t);
}

export function ChatMessageList({
  messages,
  emptyHint,
  onShareReport,
  shareLabel,
  onReply,
  replyLabel,
  cancelLabel,
  highlightMessageId,
  matchQuery,
}: {
  messages: ChatMessage[];
  emptyHint: string;
  onShareReport?: () => void;
  shareLabel?: string;
  onReply?: (reply: ChatReplyRef) => void;
  replyLabel?: string;
  cancelLabel?: string;
  /** Currently focused in-chat search match */
  highlightMessageId?: string | null;
  /** When set, soft-mark all messages that contain this query */
  matchQuery?: string;
}) {
  const { messages: t } = useI18n();
  const c = t.chat;
  const [menu, setMenu] = useState<{
    message: ChatMessage;
    x: number;
    y: number;
  } | null>(null);
  const pressRef = useRef<{
    message: ChatMessage;
    timer: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!highlightMessageId) return;
    const node = document.querySelector(
      `[data-chat-message-id="${CSS.escape(highlightMessageId)}"]`,
    );
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightMessageId]);

  const matchQ = matchQuery?.trim().toLowerCase() ?? "";

  function clearPress() {
    if (pressRef.current) {
      window.clearTimeout(pressRef.current.timer);
      pressRef.current = null;
    }
  }

  function startPress(message: ChatMessage, clientX: number, clientY: number) {
    if (!onReply || !canReplyToMessage(message)) return;
    clearPress();
    pressRef.current = {
      message,
      x: clientX,
      y: clientY,
      timer: window.setTimeout(() => {
        const current = pressRef.current;
        if (!current || current.message.id !== message.id) return;
        pressRef.current = null;
        setMenu({
          message,
          x: Math.min(window.innerWidth - 140, Math.max(12, clientX - 40)),
          y: Math.min(window.innerHeight - 72, Math.max(12, clientY - 8)),
        });
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(12);
          } catch {
            // ignore
          }
        }
      }, LONG_PRESS_MS),
    };
  }

  if (messages.length === 0) {
    return (
      <div className="px-6 py-16 text-center text-[14px] text-[#6B7280]">
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="space-y-3 px-3 py-4">
      {messages.map((message) => {
        const isUser = message.role === "user";
        const replyable = Boolean(onReply && canReplyToMessage(message));
        const isMatch =
          matchQ.length > 0 &&
          messageSearchHaystack(message).toLowerCase().includes(matchQ);
        const isActiveMatch = highlightMessageId === message.id;
        return (
          <div
            key={message.id}
            data-chat-message-id={message.id}
            className={`flex scroll-mt-24 ${isUser ? "justify-end" : "justify-start"}`}
            onContextMenu={
              replyable
                ? (event) => {
                    event.preventDefault();
                    setMenu({
                      message,
                      x: Math.min(window.innerWidth - 140, event.clientX),
                      y: Math.min(window.innerHeight - 72, event.clientY),
                    });
                  }
                : undefined
            }
            onPointerDown={
              replyable
                ? (event) => {
                    if (event.button !== 0) return;
                    startPress(message, event.clientX, event.clientY);
                  }
                : undefined
            }
            onPointerMove={
              replyable
                ? (event) => {
                    const current = pressRef.current;
                    if (!current || current.message.id !== message.id) return;
                    if (
                      Math.hypot(event.clientX - current.x, event.clientY - current.y) >
                      MOVE_CANCEL_PX
                    ) {
                      clearPress();
                    }
                  }
                : undefined
            }
            onPointerUp={replyable ? () => clearPress() : undefined}
            onPointerCancel={replyable ? () => clearPress() : undefined}
            onPointerLeave={replyable ? () => clearPress() : undefined}
          >
            <div
              className={`max-w-[min(92%,420px)] select-none rounded-[20px] px-3.5 py-2.5 text-[14px] leading-[1.45] ${
                isUser
                  ? "bg-[#DBEAFE] text-[#1E3A8A]"
                  : "border border-black/10 bg-white text-[#1A1A1A]"
              } ${replyable ? "touch-manipulation" : ""} ${
                isActiveMatch
                  ? "ring-2 ring-[#2563EB] ring-offset-2 ring-offset-[#FAF6F1]"
                  : isMatch
                    ? "ring-1 ring-[#93C5FD]"
                    : ""
              }`}
            >
              {message.replyTo ? (
                <div
                  className={`mb-1.5 rounded-xl border-l-2 px-2.5 py-1.5 text-[12px] leading-snug ${
                    isUser
                      ? "border-[#93C5FD] bg-white/55 text-[#1E40AF]"
                      : "border-[#D1D5DB] bg-[#F9FAFB] text-[#4B5563]"
                  }`}
                >
                  <p className="truncate font-bold opacity-80">
                    ↩ {message.replyTo.preview}
                  </p>
                </div>
              ) : null}
              {message.type === "audio" || message.transcript ? (
                <p className="font-medium">{message.transcript || message.text}</p>
              ) : null}
              {message.type === "text" && message.text ? <p>{message.text}</p> : null}
              {message.type === "photo" ? (
                <div className="space-y-1.5">
                  {message.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={message.url}
                      alt=""
                      className="h-28 w-28 rounded-xl object-cover"
                    />
                  ) : (
                    <p className="text-[12px] opacity-70">📷 photo</p>
                  )}
                  {message.text ? <p>{message.text}</p> : null}
                </div>
              ) : null}
              {message.type === "file" ? (
                <div className="space-y-1">
                  <p className="text-[13px] font-semibold">
                    📎 {message.fileName || "file"}
                  </p>
                  {message.text ? <p>{message.text}</p> : null}
                </div>
              ) : null}
              {(message.type === "fill" ||
                message.type === "follow_up" ||
                message.type === "new_card" ||
                message.type === "system" ||
                message.type === "intel" ||
                message.type === "source_status") &&
              message.text &&
              !(message.matched?.length && looksLikeQuestion(message.text)) ? (
                <p className="whitespace-pre-wrap">{message.text}</p>
              ) : null}
              {message.analysis ? (
                <p className="mt-1 rounded-xl bg-[#FFF7ED] px-2.5 py-1.5 text-[12px] text-[#9A3412]">
                  {message.analysis}
                </p>
              ) : null}
              {message.type === "initial_report" && message.initialReport ? (
                <InitialReportCard
                  report={message.initialReport}
                  labels={{
                    title: "初始房源分析",
                    completeness: "資料完整度",
                    disclaimer: "聲明",
                  }}
                />
              ) : null}
              {message.type === "new_card" && message.question ? (
                <p className="mt-1 rounded-xl bg-[#EFF6FF] px-2.5 py-1.5 text-[12px] font-semibold text-[#1D4ED8]">
                  {message.category ? `${message.category} · ` : ""}
                  {message.question}
                  {message.answer ? ` → ${message.answer}` : ""}
                </p>
              ) : null}
              {message.matched?.length ? (
                <ul
                  className={`space-y-1.5 text-[12px] text-[#374151] ${
                    message.text && looksLikeQuestion(message.text) ? "" : "mt-1.5"
                  }`}
                >
                  {message.matched.map((hit) => {
                    const agendaId = resolveAgendaId(hit.id);
                    const itemLabel =
                      c.agendaItems[
                        agendaId as keyof typeof c.agendaItems
                      ] ?? agendaId;
                    return (
                      <li
                        key={`${message.id}-${hit.id}`}
                        className="rounded-xl border border-[#BFDBFE]/80 bg-[#EFF6FF] px-2.5 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-[#2563EB] px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
                            {c.matchedLogged}
                          </span>
                          <span className="text-[11px] font-semibold text-[#1E40AF]">
                            {itemLabel}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-snug text-[#1F2937]">
                          {hit.answer}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {/* Advance turn: show logged facts first, then the next question. */}
              {message.matched?.length &&
              message.text &&
              looksLikeQuestion(message.text) ? (
                <div className="mt-2 border-t border-black/8 pt-2">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">
                    {c.agendaNextItem}
                  </p>
                  <p className="whitespace-pre-wrap font-medium">{message.text}</p>
                </div>
              ) : null}
              {message.type === "report" && message.report ? (
                <div className="mt-1 space-y-2">
                  <p className="font-bold">看房報告</p>
                  <div>
                    <p className="text-[11px] font-bold text-[#166534]">優點</p>
                    <ul className="list-disc pl-4 text-[12px]">
                      {message.report.pros.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-[#991B1B]">風險</p>
                    <ul className="list-disc pl-4 text-[12px]">
                      {message.report.risks.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  {onShareReport ? (
                    <button
                      type="button"
                      onClick={onShareReport}
                      className="mt-1 rounded-full bg-black px-3 py-1.5 text-[12px] font-bold text-white"
                    >
                      {shareLabel || "分享連結"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-1 text-[10px] opacity-50">
                {new Date(message.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        );
      })}

      {menu ? (
        <div
          role="menu"
          className="fixed z-40 min-w-[8.5rem] overflow-hidden rounded-2xl border border-black/10 bg-white py-1 shadow-[0_10px_30px_rgba(0,0,0,0.16)]"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] font-semibold text-[#1A1A1A] active:bg-black/5"
            onClick={() => {
              onReply?.(toReplyRef(menu.message));
              setMenu(null);
            }}
          >
            <Reply className="h-4 w-4 text-[#6B7280]" />
            {replyLabel || "Reply"}
          </button>
          {cancelLabel ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center px-3.5 py-2 text-left text-[12px] font-medium text-[#6B7280] active:bg-black/5"
              onClick={() => setMenu(null)}
            >
              {cancelLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
