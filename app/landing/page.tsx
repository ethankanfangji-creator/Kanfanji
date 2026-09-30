import Link from "next/link";
import { FREE_COMPARE_MAX_ITEMS, PRO_COMPARE_MAX_ITEMS } from "@/lib/comparison/entitlement";
import { FREE_VIEWING_LIMIT } from "@/lib/viewing-wizard/free-tier";

const SAMPLE = [
  {
    card: "採光",
    homes: [
      { label: "好", tone: "good" as const },
      { label: "差", tone: "bad" as const },
    ],
  },
  {
    card: "隔音",
    homes: [
      { label: "差", tone: "bad" as const },
      { label: "好", tone: "good" as const },
    ],
  },
  {
    card: "廚房",
    homes: [
      { label: "好", tone: "good" as const },
      { label: "好", tone: "good" as const },
    ],
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#FAF6F1] text-[#1A1A1A]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <section className="rounded-2xl bg-white px-6 py-8 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-[13px] font-semibold tracking-wide text-[#6B7280]">看房記</p>
          <h1 className="mt-2 text-[28px] font-bold leading-snug">
            看房時一張一張記下重點，看完再把幾間房放在一起比。
          </h1>
          <Link
            href="/login"
            className="mt-6 inline-flex h-11 items-center rounded-2xl bg-black px-5 text-[14px] font-bold text-white"
          >
            登入
          </Link>
        </section>

        <section className="grid gap-3 sm:grid-cols-2" aria-label="兩個模式">
          <article className="rounded-2xl bg-white px-5 py-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <h2 className="text-[18px] font-bold">現場看點卡</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#374151]">
              在屋裡為採光、隔音、廚房這些看點卡標記好或差，並留下照片、備註和語音。
            </p>
          </article>
          <article className="rounded-2xl bg-white px-5 py-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <h2 className="text-[18px] font-bold">看完對比</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#374151]">
              看完把房子放進同一張表。直欄是房子，橫欄是看點卡，方便跟家人一起看。
            </p>
          </article>
        </section>

        <section aria-label="範例對比表">
          <h2 className="px-1 text-[13px] font-semibold text-[#6B7280]">範例對比表</h2>
          <div className="mt-2 overflow-x-auto rounded-2xl bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr>
                  <th className="px-3 py-2 font-medium text-[#6B7280]">看點卡</th>
                  <th className="px-3 py-2 font-bold">範例 A</th>
                  <th className="px-3 py-2 font-bold">範例 B</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE.map((row) => (
                  <tr key={row.card}>
                    <th className="px-3 py-3 font-semibold">{row.card}</th>
                    {row.homes.map((home, index) => (
                      <td key={`${row.card}-${index}`} className="px-3 py-3">
                        <span
                          className="inline-flex rounded-2xl px-3 py-1 text-[13px] font-bold text-white"
                          style={{ backgroundColor: home.tone === "good" ? "#8FA998" : "#C98A8A" }}
                        >
                          {home.label}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="現有方案">
          <h2 className="px-1 text-[13px] font-semibold text-[#6B7280]">現有方案</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl bg-white px-5 py-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
              <h3 className="text-[18px] font-bold">免費</h3>
              <ul className="mt-3 space-y-2 text-[14px] leading-relaxed">
                <li>{FREE_VIEWING_LIMIT} 間看房紀錄</li>
                <li>比較 1 次，最多 {FREE_COMPARE_MAX_ITEMS} 間</li>
                <li>AI 100 次</li>
              </ul>
            </article>
            <article className="rounded-2xl bg-white px-5 py-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
              <h3 className="text-[18px] font-bold">Pro</h3>
              <ul className="mt-3 space-y-2 text-[14px] leading-relaxed">
                <li>看房紀錄與雲端同步不限間數</li>
                <li>比較次數不限，每次最多 {PRO_COMPARE_MAX_ITEMS} 間</li>
                <li>AI 每週 200 次</li>
              </ul>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
