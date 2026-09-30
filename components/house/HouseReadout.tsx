import type { ReactNode } from "react";

const cardClass =
  "rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]";

export function HouseReadout({
  address,
  children,
}: {
  address: string;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FAF6F1] text-[#1A1A1A]">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 px-4 py-6">
        <section className={cardClass}>
          <h1 className="text-[18px] font-bold leading-snug">{address}</h1>
        </section>
        <section className={cardClass}>
          <h2 className="text-[12px] font-medium text-[#6B7280]">狀態</h2>
          <p className="mt-1 text-[15px] font-semibold">尚未記錄</p>
        </section>
        {children}
      </div>
    </div>
  );
}
