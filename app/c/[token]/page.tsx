import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { resolveCompareShare } from "@/lib/comparison/share-server";
import { serverTrack } from "@/lib/analytics/server";
import zhHant from "@/lib/i18n/messages/zh-Hant";

export const metadata = {
  title: "看房比較（唯讀分享）",
  robots: { index: false, follow: false },
};

export default async function CompareSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;
  const resolved = await resolveCompareShare(token);
  const labels = zhHant.compare;
  if (resolved.status === "active") {
    void serverTrack(resolved.ownerId, { name: "share_viewed", props: { kind: "compare" } });
    const snapshot = resolved.snapshot as {
      columns?: Array<{ title?: string; cells?: { address?: { text?: string | null } } }>;
    };
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-xs font-semibold text-[#6B7280]">{labels.sharedViewEyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold">{labels.sharedViewTitle}</h1>
        <p className="mt-2 text-sm">{labels.sharedViewNotice.replace("{date}", resolved.createdAt.slice(0, 10))}</p>
        <p className="text-sm text-[#6B7280]">{labels.sharedViewExpires.replace("{date}", resolved.expiresAt.slice(0, 10))}</p>
        <ul className="mt-6 space-y-3">
          {(snapshot.columns ?? []).map((column) => (
            <li key={column.title} className="rounded-2xl border border-black/10 p-4">
              <p className="font-bold">{column.cells?.address?.text || "—"}</p>
            </li>
          ))}
        </ul>
        <Link href="/" className="mt-6 inline-flex font-bold underline">{labels.sharedViewCta}</Link>
      </main>
    );
  }
  notFound();
}
