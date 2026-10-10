"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  parseShareCommentFocusId,
  shareCommentDomId,
} from "@/lib/share-access/comment-anchor";

type Comment = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
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

export function ShareReportComments({
  token,
  recipientLabel = null,
  labels,
}: {
  token: string;
  /** When set, comments are attributed to this named code (no nickname field). */
  recipientLabel?: string | null;
  labels: {
    title: string;
    empty: string;
    nickname: string;
    nicknamePlaceholder: string;
    body: string;
    bodyPlaceholder: string;
    submit: string;
    submitting: string;
    failed: string;
    rateLimited: string;
    guestDefault: string;
    namedAs?: string;
    reply: string;
    replyPlaceholder: string;
    replySubmit: string;
    replyFailed: string;
    ownerAuthor: string;
    notifyOnReply: string;
    notifyEmailPlaceholder: string;
    notifyEmailHint: string;
  };
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [authorLabel, setAuthorLabel] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [notifyOnReply, setNotifyOnReply] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const named = Boolean(recipientLabel?.trim());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/share/public/${token}/comments`, {
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data = (await response.json()) as { comments?: Comment[] };
        if (!cancelled) {
          setComments(Array.isArray(data.comments) ? data.comments : []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (loading || comments.length === 0) return;
    const focusId = parseShareCommentFocusId(
      typeof window !== "undefined" ? window.location.hash : "",
    );
    if (!focusId || !comments.some((row) => row.id === focusId)) return;
    const el = document.getElementById(shareCommentDomId(focusId));
    if (!el) return;
    setHighlightedId(focusId);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setHighlightedId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [loading, comments]);

  async function postComment(input: {
    body: string;
    parentId?: string | null;
    asRoot?: boolean;
  }) {
    const response = await fetch(`/api/share/public/${token}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(named ? {} : { authorLabel: authorLabel.trim() || undefined }),
        body: input.body,
        ...(input.parentId ? { parentId: input.parentId } : {}),
        ...(input.asRoot && notifyOnReply && notifyEmail.trim()
          ? { notifyEmail: notifyEmail.trim() }
          : {}),
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      comment?: Comment;
      error?: string;
    } | null;
    return { response, data };
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { response, data } = await postComment({
        body: body.trim(),
        asRoot: true,
      });
      if (response.status === 429) {
        setError(labels.rateLimited);
        return;
      }
      if (!response.ok || !data?.comment) {
        setError(labels.failed);
        return;
      }
      setComments((prev) => [...prev, data.comment!]);
      setBody("");
    } catch {
      setError(labels.failed);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReply(parentId: string) {
    if (!replyBody.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { response, data } = await postComment({
        body: replyBody.trim(),
        parentId,
      });
      if (response.status === 429) {
        setError(labels.rateLimited);
        return;
      }
      if (!response.ok || !data?.comment) {
        setError(labels.replyFailed);
        return;
      }
      setComments((prev) => [...prev, data.comment!]);
      setReplyBody("");
      setReplyToId(null);
    } catch {
      setError(labels.replyFailed);
    } finally {
      setSubmitting(false);
    }
  }

  const ordered = orderForThread(comments);

  return (
    <section
      id="share-comments"
      className="mt-4 scroll-mt-24 rounded-[28px] border border-black/5 bg-white p-5"
    >
      <h2 className="text-[15px] font-bold">{labels.title}</h2>
      {named && labels.namedAs ? (
        <p className="mt-1 text-[12px] text-[#6B7280]">
          {labels.namedAs.replace("{name}", recipientLabel!.trim())}
        </p>
      ) : null}
      <div className="mt-3 space-y-3">
        {loading ? null : comments.length === 0 ? (
          <p className="text-[13px] text-[#6B7280]">{labels.empty}</p>
        ) : (
          ordered.map((comment) => {
            const depth = Math.min(comment.depth ?? 0, 4);
            const isOwner = comment.authorKind === "owner";
            return (
              <div
                key={comment.id}
                id={shareCommentDomId(comment.id)}
                className={
                  highlightedId === comment.id
                    ? "rounded-xl border-t border-black/5 bg-[#FEF3C7] px-2 py-3 ring-2 ring-[#F59E0B]/60 first:border-0"
                    : "border-t border-black/5 pt-3 first:border-0 first:pt-0"
                }
                style={{ marginLeft: depth * 12 }}
              >
                <p className="text-[12px] font-semibold text-[#374151]">
                  {isOwner
                    ? `${labels.ownerAuthor}${comment.authorLabel ? ` · ${comment.authorLabel}` : ""}`
                    : comment.authorLabel || labels.guestDefault}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#1A1A1A]">
                  {comment.body}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-[11px] text-[#9CA3AF]">
                    {new Date(comment.createdAt).toLocaleString()}
                  </p>
                  {(comment.depth ?? 0) < 8 ? (
                    <button
                      type="button"
                      className="text-[11px] font-bold text-[#374151] underline-offset-2 hover:underline"
                      onClick={() => {
                        setReplyToId((id) =>
                          id === comment.id ? null : comment.id,
                        );
                        setReplyBody("");
                        setError(null);
                      }}
                    >
                      {labels.reply}
                    </button>
                  ) : null}
                </div>
                {replyToId === comment.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={replyBody}
                      rows={2}
                      maxLength={500}
                      placeholder={labels.replyPlaceholder}
                      onChange={(event) => setReplyBody(event.target.value)}
                      className="w-full rounded-xl border border-black/10 bg-[#FDF6F0] px-3 py-2 text-[13px] outline-none focus:border-black/30"
                    />
                    <button
                      type="button"
                      disabled={submitting || !replyBody.trim()}
                      onClick={() => void submitReply(comment.id)}
                      className="rounded-full bg-black px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40"
                    >
                      {submitting ? labels.submitting : labels.replySubmit}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <form className="mt-4 space-y-2" onSubmit={(event) => void onSubmit(event)}>
        {named ? null : (
          <label className="block text-[12px] font-semibold text-[#374151]">
            {labels.nickname}
            <input
              type="text"
              value={authorLabel}
              maxLength={40}
              placeholder={labels.nicknamePlaceholder}
              onChange={(event) => setAuthorLabel(event.target.value)}
              className="mt-1 w-full rounded-xl border border-black/10 bg-[#FDF6F0] px-3 py-2 text-[13px] outline-none focus:border-black/30"
            />
          </label>
        )}
        <label className="block text-[12px] font-semibold text-[#374151]">
          {labels.body}
          <textarea
            value={body}
            required
            maxLength={500}
            rows={3}
            placeholder={labels.bodyPlaceholder}
            onChange={(event) => setBody(event.target.value)}
            className="mt-1 w-full rounded-xl border border-black/10 bg-[#FDF6F0] px-3 py-2 text-[13px] outline-none focus:border-black/30"
          />
        </label>
        <label className="flex items-start gap-2 text-[12px] text-[#374151]">
          <input
            type="checkbox"
            checked={notifyOnReply}
            onChange={(event) => setNotifyOnReply(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            {labels.notifyOnReply}
            <span className="mt-0.5 block text-[11px] font-normal text-[#6B7280]">
              {labels.notifyEmailHint}
            </span>
          </span>
        </label>
        {notifyOnReply ? (
          <input
            type="email"
            value={notifyEmail}
            required
            maxLength={254}
            placeholder={labels.notifyEmailPlaceholder}
            onChange={(event) => setNotifyEmail(event.target.value)}
            className="w-full rounded-xl border border-black/10 bg-[#FDF6F0] px-3 py-2 text-[13px] outline-none focus:border-black/30"
          />
        ) : null}
        {error ? <p className="text-[12px] text-[#991B1B]">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="rounded-full bg-black px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40"
        >
          {submitting ? labels.submitting : labels.submit}
        </button>
      </form>
    </section>
  );
}
