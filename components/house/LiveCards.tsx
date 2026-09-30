const cardClass =
  "rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]";

const STATUS_LABEL = {
  good: "✅ 好",
  bad: "❌ 差",
  unsure: "🤔 還好",
} as const;

export type LiveCard = {
  templateId: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isSystem: boolean;
  status: string | null;
  notes: string | null;
  voiceTranscript: string | null;
  photoCount?: number;
  photoUrls?: string[];
};

export function LiveCards({
  address,
  code,
  cards,
}: {
  address: string;
  code: string;
  cards: LiveCard[];
}) {
  return (
    <main className="min-h-screen bg-[#FAF6F1] text-[#1A1A1A]">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 px-4 py-6">
        <section className={cardClass}>
          <p className="text-[12px] font-medium text-[#6B7280]">看房代碼</p>
          <h1 className="mt-1 text-[28px] font-bold tracking-[0.2em]">{code}</h1>
          <p className="mt-2 text-[15px] font-semibold">{address}</p>
        </section>
        <ul className="flex flex-col">
          {cards.map((card, index) => {
            const status = card.status === "good" || card.status === "bad" || card.status === "unsure"
              ? STATUS_LABEL[card.status]
              : null;
            return (
              <li key={card.templateId} className={`${cardClass} ${index === 0 ? "" : "-mt-2"}`}>
                <p className="text-[15px] font-semibold">
                  {card.icon ? <span className="mr-2">{card.icon}</span> : null}
                  {card.name}
                </p>
                {status ? <p className="mt-1 text-[13px]">{status}</p> : null}
                {card.notes ? <p className="mt-1 text-[14px] leading-relaxed">{card.notes}</p> : null}
                {card.voiceTranscript ? (
                  <p className="mt-1 text-[14px] leading-relaxed">{card.voiceTranscript}</p>
                ) : null}
                {card.photoUrls && card.photoUrls.length > 0 ? (
                  <ul className="mt-2 flex gap-2">
                    {card.photoUrls.map((url) => (
                      <li key={url}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                      </li>
                    ))}
                  </ul>
                ) : card.photoCount ? (
                  <p className="mt-1 text-[13px] text-[#6B7280]">照片 {card.photoCount}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
