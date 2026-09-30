"use client";

import { FormEvent, useState } from "react";
import { addCardPhoto, saveCardNotes, saveCardScore } from "@/app/house/card-actions";
import { addOwnCardTemplate } from "@/app/house/template-actions";
import type { CardTemplate } from "@/lib/viewing-card-templates";
import type { CardPhoto, CardScore, ViewingCardState } from "@/lib/viewing-card-record";

const SCORE_OPTIONS: Array<{ status: CardScore; label: string }> = [
  { status: "good", label: "✅ 好" },
  { status: "bad", label: "❌ 差" },
  { status: "unsure", label: "🤔 還好" },
];

const cardClass =
  "rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]";

export function TemplateWallet({
  viewingId,
  templates,
  records,
}: {
  viewingId: string;
  templates: CardTemplate[];
  records: ViewingCardState[];
}) {
  const [cards, setCards] = useState(templates);
  const [saved, setSaved] = useState(() => new Map(records.map((record) => [record.templateId, record])));
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await addOwnCardTemplate({ viewingId, name, icon });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCards((current) =>
        [...current, result.template].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      );
      setName("");
      setIcon("");
    } catch {
      setError("新增失敗，請再試一次。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="house-cards-heading">
      <h2 id="house-cards-heading" className="px-1 text-[12px] font-medium text-[#6B7280]">
        看點卡
      </h2>
      <ul className="flex flex-col">
        {cards.map((card, index) => (
          <ScoreCard
            key={card.id}
            viewingId={viewingId}
            card={card}
            index={index}
            record={saved.get(card.id) ?? { templateId: card.id, status: null, notes: "", photos: [] }}
            onChange={(next) => {
              setSaved((current) => new Map(current).set(card.id, next));
            }}
          />
        ))}
      </ul>
      <form className={`${cardClass} flex flex-col gap-3`} onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-[#6B7280]">
          名稱
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 rounded-xl border border-black/10 px-3 text-[14px] text-[#1A1A1A]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-[#6B7280]">
          一個 emoji
          <input
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            className="h-11 rounded-xl border border-black/10 px-3 text-[14px] text-[#1A1A1A]"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="h-11 rounded-full bg-black text-[14px] font-bold text-white disabled:opacity-40"
        >
          {busy ? "新增中" : "新增看點卡"}
        </button>
        {error ? <p className="text-[13px] text-[#991B1B]">{error}</p> : null}
      </form>
    </section>
  );
}

function ScoreCard({
  viewingId,
  card,
  index,
  record,
  onChange,
}: {
  viewingId: string;
  card: CardTemplate;
  index: number;
  record: ViewingCardState;
  onChange: (next: ViewingCardState) => void;
}) {
  const [notes, setNotes] = useState(record.notes);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  async function chooseScore(status: CardScore) {
    const previous = record.status;
    onChange({ ...record, status });
    setError("");
    const result = await saveCardScore({ viewingId, templateId: card.id, status });
    if ("error" in result) {
      onChange({ ...record, status: previous });
      setError(result.error);
    }
  }

  async function saveNotes() {
    if (notes === record.notes) return;
    setError("");
    const result = await saveCardNotes({ viewingId, templateId: card.id, notes });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onChange({ ...record, notes: result.notes });
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError("");
    const body = new FormData();
    body.set("viewingId", viewingId);
    body.set("templateId", card.id);
    body.set("file", file);
    const result = await addCardPhoto(body);
    setUploading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onChange({ ...record, photos: [...record.photos, result.photo] });
  }

  return (
    <li className={`${cardClass} ${index === 0 ? "" : "-mt-2"}`}>
      <p className="text-[15px] font-semibold">
        {card.icon ? <span className="mr-2">{card.icon}</span> : null}
        {card.name}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {SCORE_OPTIONS.map((option) => (
          <button
            key={option.status}
            type="button"
            aria-pressed={record.status === option.status}
            onClick={() => void chooseScore(option.status)}
            className={`h-9 rounded-full px-3 text-[13px] font-bold ${
              record.status === option.status ? "bg-black text-white" : "bg-[#F3EDE6] text-[#1A1A1A]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="mt-2 flex flex-col gap-1 text-[12px] font-medium text-[#6B7280]">
        備註
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => void saveNotes()}
          rows={2}
          className="rounded-xl border border-black/10 px-3 py-2 text-[14px] text-[#1A1A1A]"
        />
      </label>
      {record.photos.length > 0 ? (
        <ul className="mt-2 flex gap-2">
          {record.photos.map((photo) => (
            <li key={photo.path}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="h-16 w-16 rounded-xl object-cover" />
            </li>
          ))}
        </ul>
      ) : null}
      <label className="mt-2 inline-flex h-9 cursor-pointer items-center rounded-full bg-[#F3EDE6] px-3 text-[13px] font-bold">
        {uploading ? "上傳中" : "照片"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadPhoto(file);
          }}
        />
      </label>
      {error ? <p className="mt-2 text-[13px] text-[#991B1B]">{error}</p> : null}
    </li>
  );
}
