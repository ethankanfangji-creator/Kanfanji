const CARD_STATUS_LABEL = {
  good: "不錯",
  bad: "不行",
  unsure: "不確定",
} as const;

export type HouseCardStatus = keyof typeof CARD_STATUS_LABEL;

export type HouseCard = {
  id: string;
  status: string;
  notes: string | null;
};

const cardClass =
  "rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]";

export function cardStatusLabel(status: string) {
  if (status in CARD_STATUS_LABEL) {
    return CARD_STATUS_LABEL[status as HouseCardStatus];
  }
  return CARD_STATUS_LABEL.unsure;
}

export function HouseReadout({
  address,
  cards,
}: {
  address: string;
  cards: HouseCard[];
}) {
  const statusText = cards.length === 0 ? "尚未記錄" : `已記錄 ${cards.length} 張看點卡`;

  return (
    <div className="min-h-screen bg-[#FAF6F1] text-[#1A1A1A]">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 px-4 py-6">
        <section className={cardClass}>
          <h1 className="text-[18px] font-bold leading-snug">{address}</h1>
        </section>
        <section className={cardClass}>
          <h2 className="text-[12px] font-medium text-[#6B7280]">狀態</h2>
          <p className="mt-1 text-[15px] font-semibold">{statusText}</p>
        </section>
        <section className="flex flex-col gap-2" aria-labelledby="house-cards-heading">
          <h2 id="house-cards-heading" className="px-1 text-[12px] font-medium text-[#6B7280]">
            看點卡
          </h2>
          {cards.length === 0 ? (
            <div className={cardClass}>
              <p className="text-[14px] text-[#6B7280]">還沒有看點卡</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {cards.map((card) => (
                <li key={card.id} className={cardClass}>
                  <p className="text-[14px] font-semibold">{cardStatusLabel(card.status)}</p>
                  {card.notes ? (
                    <p className="mt-1 text-[13px] leading-relaxed text-[#374151]">{card.notes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
