"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const cardClass = "rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]";

const STATUS_LABEL = {
  good: "✅ 好",
  bad: "❌ 差",
  unsure: "🤔 還好",
} as const;

export type DiscussionHouse = { id: string; address: string };

export type DiscussionCell = {
  cardId: string | null;
  status: string | null;
  notes: string | null;
  voiceTranscript: string | null;
  photoUrls: string[];
};

export type DiscussionRow = {
  templateId: string;
  name: string;
  icon: string | null;
  cells: Record<string, DiscussionCell>;
};

export type DiscussionComment = {
  id: string;
  cardId: string | null;
  nickname: string;
  content: string | null;
  vote: string | null;
};

export function DiscussionBoard({
  shareCode,
  houses,
  rows,
  comments,
}: {
  shareCode: string;
  houses: DiscussionHouse[];
  rows: DiscussionRow[];
  comments: DiscussionComment[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ houseId: string; templateId: string } | null>(null);
  const [nickname, setNickname] = useState("");
  const [content, setContent] = useState("");
  const [vote, setVote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedRow = rows.find((row) => row.templateId === selected?.templateId);
  const selectedCell = selected ? selectedRow?.cells[selected.houseId] : undefined;
  const selectedComments = comments.filter((comment) => comment.cardId === selectedCell?.cardId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCell?.cardId) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/discussion-comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shareCode,
        cardId: selectedCell.cardId,
        nickname,
        content,
        vote,
      }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.status === 429 ? "留言太頻繁，請稍後再試。" : "留言沒有送出。");
      return;
    }
    setContent("");
    setVote("");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#FAF6F1] text-[#1A1A1A]">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-[20px] font-bold">比較討論</h1>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-2">
            <thead>
              <tr>
                <th className="w-28" />
                {houses.map((house) => (
                  <th key={house.id} className={`${cardClass} text-left text-[13px] font-bold`}>
                    {house.address}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.templateId}>
                  <th className="px-2 text-left text-[13px] font-semibold">
                    {row.icon ? <span className="mr-1">{row.icon}</span> : null}
                    {row.name}
                  </th>
                  {houses.map((house) => {
                    const cell = row.cells[house.id];
                    const status =
                      cell?.status === "good" || cell?.status === "bad" || cell?.status === "unsure"
                        ? STATUS_LABEL[cell.status]
                        : "—";
                    const open = selected?.houseId === house.id && selected.templateId === row.templateId;
                    return (
                      <td key={house.id}>
                        <button
                          type="button"
                          aria-pressed={open}
                          onClick={() => setSelected({ houseId: house.id, templateId: row.templateId })}
                          className={`${cardClass} flex w-full items-center gap-2 text-left`}
                        >
                          <span>{status}</span>
                          {cell?.photoUrls[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cell.photoUrls[0]} alt="" className="h-10 w-10 rounded-lg object-cover" />
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedCell ? (
          <section className={`${cardClass} mt-4`} aria-label="看點卡">
            <h2 className="text-[16px] font-bold">{selectedRow?.name}</h2>
            {selectedCell.photoUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="" className="mt-3 h-40 w-full rounded-xl object-cover" />
            ))}
            {selectedCell.voiceTranscript ? <p className="mt-3 text-[14px]">{selectedCell.voiceTranscript}</p> : null}
            {selectedCell.notes ? <p className="mt-2 text-[14px]">{selectedCell.notes}</p> : null}
            <ul className="mt-4 space-y-2">
              {selectedComments.map((comment) => (
                <li key={comment.id} className="text-[14px]">
                  <span className="font-bold">{comment.nickname}</span>
                  {comment.vote ? <span className="ml-2 text-[#6B7280]">{comment.vote}</span> : null}
                  {comment.content ? <p>{comment.content}</p> : null}
                </li>
              ))}
            </ul>
            <form className="mt-4 flex flex-col gap-2" onSubmit={onSubmit}>
              <label className="text-[12px] text-[#6B7280]">
                暱稱
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-black/10 px-3 text-[14px]"
                />
              </label>
              <label className="text-[12px] text-[#6B7280]">
                留言
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                  rows={2}
                />
              </label>
              <div className="flex gap-2">
                {[
                  ["like", "喜歡"],
                  ["meh", "普通"],
                  ["dislike", "不喜歡"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={vote === value}
                    onClick={() => setVote(value)}
                    className="h-9 rounded-full bg-[#F3EDE6] px-3 text-[12px] font-bold"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={busy || !selectedCell.cardId}
                className="h-10 rounded-full bg-black text-[13px] font-bold text-white disabled:opacity-40"
              >
                送出留言
              </button>
              {error ? <p className="text-[13px] text-[#991B1B]">{error}</p> : null}
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
