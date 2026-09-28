import Link from "next/link";
import { connection } from "next/server";
import { ComparisonBoard } from "@/components/comparison/ComparisonBoard";
import type { ComparisonColumn } from "@/lib/comparison";
import { resolveCompareShare } from "@/lib/comparison/share-server";
import { serverTrack } from "@/lib/analytics/server";
import zhHant from "@/lib/i18n/messages/zh-Hant";

export const metadata = {
  title: "看房比較（唯讀分享）",
  robots: { index: false, follow: false },
};

type ShareCell = { text?: string | null; list?: string[] };
type ShareColumn = { title?: string; cells?: Record<string, ShareCell | undefined> };

function textOf(column: ShareColumn, key: string): string | null {
  return column.cells?.[key]?.text ?? null;
}

function listOf(column: ShareColumn, key: string): string[] {
  return column.cells?.[key]?.list ?? [];
}

/** Project a stored share snapshot onto the read-only comparison board. */
function columnsFromSnapshot(columns: ShareColumn[], createdAt: string): ComparisonColumn[] {
  return columns.map((column, index) => {
    const ratingRaw = textOf(column, "rating");
    const rating = ratingRaw == null || ratingRaw.trim() === "" ? null : Number(ratingRaw);
    return {
      id: `share-${index}`,
      source: { viewingId: "", sourceUpdatedAt: createdAt },
      title: column.title || textOf(column, "address") || "—",
      fields: {
        priceLabel: textOf(column, "price"),
        layoutLabel: textOf(column, "layout"),
        locationLabel: textOf(column, "location"),
        areaLabel: textOf(column, "area"),
        managementFeeLabel: textOf(column, "managementFee"),
        overallRating: rating != null && Number.isFinite(rating) ? rating : null,
        pros: listOf(column, "pros"),
        risks: listOf(column, "risks"),
        followUps: listOf(column, "followUps"),
      },
      notes: textOf(column, "notes") ?? "",
      included: true,
    };
  });
}

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
      createdAt?: string;
      columns?: ShareColumn[];
    };
    const columns = columnsFromSnapshot(snapshot.columns ?? [], snapshot.createdAt ?? resolved.createdAt);
    return (
      <main className="mx-auto max-w-[960px] px-4 py-8">
        <p className="text-xs font-semibold text-[#6B7280]">{labels.sharedViewEyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold">{labels.sharedViewTitle}</h1>
        <p className="mt-2 text-sm">{labels.sharedViewNotice.replace("{date}", resolved.createdAt.slice(0, 10))}</p>
        <p className="text-sm text-[#6B7280]">{labels.sharedViewExpires.replace("{date}", resolved.expiresAt.slice(0, 10))}</p>
        <div className="mt-6">
          <ComparisonBoard
            columns={columns}
            labels={{
              empty: "—",
              price: labels.price,
              layout: labels.layout,
              location: labels.location,
              area: labels.area,
              managementFee: labels.managementFee,
              rating: labels.rating,
              pros: labels.pros,
              risks: labels.risks,
              followUps: labels.followUps,
              notes: labels.notes,
              includeInShare: labels.includeInShare,
            }}
          />
        </div>
        <Link href="/" className="mt-6 inline-flex font-bold underline">{labels.sharedViewCta}</Link>
      </main>
    );
  }
  const title = resolved.status === "legacy" ? labels.shareLegacyTitle : labels.shareInvalidTitle;
  const body = resolved.status === "legacy" ? labels.shareLegacyBody : labels.shareInvalidBody;
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-sm leading-6">{body}</p>
    </main>
  );
}
