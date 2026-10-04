"use client";

import { useEffect, useState } from "react";

type Comment = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
};

export function ShareReportCommentsPanel({
  viewingId,
  labels,
}: {
  viewingId: string;
  labels: {
    title: string;
    empty: string;
    guestDefault: string;
    loadFailed: string;
  };
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

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

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] font-bold text-[#374151]">{labels.title}</p>
      <ul className="space-y-2">
        {comments.map((comment) => (
          <li key={comment.id} className="rounded-xl bg-black/[0.03] px-3 py-2">
            <p className="text-[12px] font-semibold text-[#374151]">
              {comment.authorLabel || labels.guestDefault}
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed">
              {comment.body}
            </p>
            <p className="mt-1 text-[10px] text-[#9CA3AF]">
              {new Date(comment.createdAt).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
