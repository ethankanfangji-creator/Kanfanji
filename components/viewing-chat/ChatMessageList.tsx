"use client";

import type { ChatMessage } from "@/lib/viewing-chat/types";

export function ChatMessageList({
  messages,
  emptyHint,
  onShareReport,
  shareLabel,
}: {
  messages: ChatMessage[];
  emptyHint: string;
  onShareReport?: () => void;
  shareLabel?: string;
}) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center text-[14px] text-[#6B7280]">
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
      {messages.map((message) => {
        const isUser = message.role === "user";
        return (
          <div
            key={message.id}
            className={`flex ${isUser ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[min(92%,420px)] rounded-[20px] px-3.5 py-2.5 text-[14px] leading-[1.45] ${
                isUser
                  ? "bg-[#DBEAFE] text-[#1E3A8A]"
                  : "border border-black/10 bg-white text-[#1A1A1A]"
              }`}
            >
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
                message.type === "intel") &&
              message.text ? (
                <p className="whitespace-pre-wrap">{message.text}</p>
              ) : null}
              {message.type === "new_card" && message.question ? (
                <p className="mt-1 rounded-xl bg-[#EFF6FF] px-2.5 py-1.5 text-[12px] font-semibold text-[#1D4ED8]">
                  {message.category ? `${message.category} · ` : ""}
                  {message.question}
                  {message.answer ? ` → ${message.answer}` : ""}
                </p>
              ) : null}
              {message.matched?.length ? (
                <ul className="mt-1.5 space-y-1 text-[12px] text-[#374151]">
                  {message.matched.map((hit) => (
                    <li key={`${message.id}-${hit.id}`}>
                      <span className="rounded-full bg-[#DBEAFE] px-2 py-0.5 font-bold text-[#1D4ED8]">
                        已記下
                      </span>{" "}
                      {hit.answer}
                    </li>
                  ))}
                </ul>
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
    </div>
  );
}
