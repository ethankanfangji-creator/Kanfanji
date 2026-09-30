"use client";

import { FormEvent, useState } from "react";
import { addOwnCardTemplate } from "@/app/house/template-actions";
import type { CardTemplate } from "@/lib/viewing-card-templates";

const cardClass =
  "rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]";

export function TemplateWallet({
  viewingId,
  templates,
}: {
  viewingId: string;
  templates: CardTemplate[];
}) {
  const [cards, setCards] = useState(templates);
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
          <li
            key={card.id}
            className={`${cardClass} ${index === 0 ? "" : "-mt-2"}`}
          >
            <p className="text-[15px] font-semibold">
              {card.icon ? <span className="mr-2">{card.icon}</span> : null}
              {card.name}
            </p>
          </li>
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
