import Link from "next/link";
import type { ReactNode } from "react";

const cardClass =
  "rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]";

export function HouseReadout({
  address,
  viewingId,
  hasRecords = false,
  loadFailed = false,
  children,
}: {
  address: string;
  viewingId?: string;
  hasRecords?: boolean;
  loadFailed?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FAF6F1] text-[#1A1A1A]">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 px-4 py-6">
        <section className={cardClass}>
          <h1 className="text-[18px] font-bold leading-snug">{address}</h1>
          {viewingId ? (
            <p className="mt-2 flex gap-4 text-[13px] font-bold">
              <Link href="/viewings" className="underline">
                看房列表
              </Link>
              <Link href={`/viewings/${viewingId}`} className="underline">
                這筆看房
              </Link>
            </p>
          ) : null}
        </section>
        {loadFailed ? (
          <section className={cardClass}>
            <p className="text-[15px] font-semibold">這間房子讀取失敗，請再試一次。</p>
          </section>
        ) : hasRecords ? null : (
          <section className={cardClass}>
            <p className="text-[15px] font-semibold">這間還沒有看點紀錄。</p>
          </section>
        )}
        {children}
      </div>
    </div>
  );
}
