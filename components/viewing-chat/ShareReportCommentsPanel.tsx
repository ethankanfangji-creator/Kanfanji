"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { shareCommentDomId } from "@/lib/share-access/comment-anchor";

type Comment = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  recipientLabel?: string | null;
  parentId?: string | null;
  authorKind?: "guest" | "owner";
  depth?: number;
};

function orderForThread(comments: Comment[]): Comment[] {
  const byParent = new Map<string | null, Comment[]>();
  for (const comment of comments) {
    const key = comment.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(comment);
    byParent.set(key, list);
  }
  const out: Comment[] = [];
  const walk = (parentId: string | null) => {
    for (const comment of byParent.get(parentId) ?? []) {
      out.push(comment);
      walk(comment.id);
    }
  };
  walk(null);
  return out;
}

export function ShareReportCommentsPanel({
  viewingId,
  focusCommentId = null,
  labels,
}: {
  viewingId: string;
  /** When set (e.g. notification deep link), scroll/highlight after load. */
  focusCommentId?: string | null;
  labels: {
    title: string;
    empty: string;
    guestDefault: string;
    loadFailed: string;
    deleteComment?: string;
    deleteCommentFailed?: string;
    recipientGeneral?: string;
    reply?: string;
    replyPlaceholder?: string;
    replySubmit?: string;
    replyFailed?: string;
    ownerAuthor?: string;
  };
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/viewings/${viewingId}/share-comments`, {
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) {
            setFailed(true);
            setLoading(false);
          }
          return;
        }
        const data = (await response.json()) as { comments?: Comment[] };
        if (!cancelled) {
          setComments(Array.isArray(data.comments) ? data.comments : []);
          setFailed(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewingId]);

  useEffect(() => {
    if (loading || !focusCommentId) return;
    const exists = comments.some((row) => row.id === focusCommentId);
    if (!exists) return;
    const el = document.getElementById(shareCommentDomId(focusCommentId));
    if (!el) return;
    setHighlightedId(focusCommentId);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setHighlightedId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [loading, comments, focusCommentId]);

  async function deleteComment(id: string) {
    if (!labels.deleteComment) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/share/comments/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("fail");
      setComments((prev) => {
        const remove = new Set<string>([id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const row of prev) {
            if (row.parentId && remove.has(row.parentId) && !remove.has(row.id)) {
              remove.add(row.id);
              changed = true;
            }
          }
        }
        return prev.filter((row) => !remove.has(row.id));
      });
    } catch {
      /* toast-less; keep list */
    } finally {
      setBusyId(null);
    }
  }

  async function submitReply(parentId: string) {
    if (!labels.replySubmit || !replyBody.trim()) return;
    setBusyId(`reply:${parentId}`);
    setReplyError("");
    try {
      const response = await fetch(`/api/share/comments/${parentId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      const data = (await response.json().catch(() => null)) as {
        comment?: Comment;
      } | null;
      if (!response.ok || !data?.comment) {
        setReplyError(labels.replyFailed || labels.loadFailed);
        return;
      }
      setComments((prev) => [...prev, data.comment!]);
      setReplyBody("");
      setReplyToId(null);
    } catch {
      setReplyError(labels.replyFailed || labels.loadFailed);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return null;
  if (failed) {
    return (
      <div className="mt-3 rounded-xl bg-black/[0.03] px-3 py-2 text-[12px] text-[#6B7280]">
        {labels.loadFailed}
      </div>
    );
  }
  if (comments.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-[11px] font-bold text-[#374151]">{labels.title}</p>
        <p className="mt-1 text-[12px] text-[#6B7280]">{labels.empty}</p>
      </div>
    );
  }

  const ordered = orderForThread(comments);

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] font-bold text-[#374151]">{labels.title}</p>
      <ul className="space-y-2">
        {ordered.map((comment) => {
          const depth = Math.min(comment.depth ?? 0, 4);
          const isOwner = comment.authorKind === "owner";
          return (
            <li
              key={comment.id}
              id={shareCommentDomId(comment.id)}
              className={
                highlightedId === comment.id
                  ? "rounded-xl bg-[#FEF3C7] px-3 py-2 ring-2 ring-[#F59E0B]/60"
                  : "rounded-xl bg-black/[0.03] px-3 py-2"
              }
              style={{ marginLeft: depth * 12 }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] font-semibold text-[#374151]">
                  {isOwner
                    ? labels.ownerAuthor || comment.authorLabel
                    : comment.authorLabel || labels.guestDefault}
                  {isOwner && comment.authorLabel
                    ? ` · ${comment.authorLabel}`
                    : ""}
                  {!isOwner && comment.recipientLabel
                    ? ` · ${comment.recipientLabel}`
                    : !isOwner && labels.recipientGeneral
                      ? ` · ${labels.recipientGeneral}`
                      : ""}
                </p>
                {labels.deleteComment ? (
                  <button
                    type="button"
                    disabled={busyId === comment.id}
                    aria-label={labels.deleteComment}
                    title={labels.deleteComment}
                    onClick={() => void deleteComment(comment.id)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#991B1B] hover:bg-[#FEF2F2] disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed">
                {comment.body}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-[10px] text-[#9CA3AF]">
                  {new Date(comment.createdAt).toLocaleString()}
                </p>
                {labels.reply && (comment.depth ?? 0) < 8 ? (
                  <button
                    type="button"
                    className="text-[10px] font-bold text-[#374151] underline-offset-2 hover:underline"
                    onClick={() => {
                      setReplyToId((id) => (id === comment.id ? null : comment.id));
                      setReplyBody("");
                      setReplyError("");
                    }}
                  >
                    {labels.reply}
                  </button>
                ) : null}
              </div>
              {replyToId === comment.id ? (
                <div className="mt-2 space-y-1.5">
                  <textarea
                    value={replyBody}
                    rows={2}
                    maxLength={500}
                    placeholder={labels.replyPlaceholder}
                    onChange={(event) => setReplyBody(event.target.value)}
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-[12px] outline-none focus:border-black/25"
                  />
                  {replyError ? (
                    <p className="text-[11px] text-[#991B1B]">{replyError}</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={!replyBody.trim() || busyId === `reply:${comment.id}`}
                    onClick={() => void submitReply(comment.id)}
                    className="rounded-full bg-black px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    {labels.replySubmit}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
