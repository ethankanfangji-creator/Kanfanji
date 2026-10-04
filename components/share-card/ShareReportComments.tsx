"use client";

import { useEffect, useState, type FormEvent } from "react";

type Comment = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
};

export function ShareReportComments({
  token,
  labels,
}: {
  token: string;
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
  };
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [authorLabel, setAuthorLabel] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/share/public/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorLabel: authorLabel.trim() || undefined,
          body: body.trim(),
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        comment?: Comment;
        error?: string;
      } | null;
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

  return (
    <section className="mt-4 rounded-[28px] bg-white border border-black/5 p-5">
      <h2 className="text-[15px] font-bold">{labels.title}</h2>
      <div className="mt-3 space-y-3">
        {loading ? null : comments.length === 0 ? (
          <p className="text-[13px] text-[#6B7280]">{labels.empty}</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="border-t border-black/5 pt-3 first:border-0 first:pt-0">
              <p className="text-[12px] font-semibold text-[#374151]">
                {comment.authorLabel || labels.guestDefault}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#1A1A1A]">
                {comment.body}
              </p>
              <p className="mt-1 text-[11px] text-[#9CA3AF]">
                {new Date(comment.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
      <form className="mt-4 space-y-2" onSubmit={(event) => void onSubmit(event)}>
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
