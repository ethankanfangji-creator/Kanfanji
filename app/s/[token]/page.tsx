import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, MapPin, ShieldAlert } from "lucide-react";
import { DecisionSummaryCard } from "@/components/share-card/DecisionSummaryCard";
import { ShareUnlockForm } from "@/components/share-card/ShareUnlockForm";
import { resolvePublicShare } from "@/lib/share";
import type { PublicShareResult } from "@/lib/share-access";
import {
  isDecisionSummarySnapshot,
  toPublicDecisionSummary,
} from "@/lib/share-card";

const READONLY_LABELS = {
  eyebrow: "KANFANGJI · DECISION SUMMARY",
  address: "Address",
  viewingAt: "Viewing date",
  basics: "Layout, price & basics",
  unit: "Unit",
  price: "Price",
  layout: "Layout",
  area: "Area",
  managementFee: "Management fee",
  listingUrl: "Listing URL",
  setupNotes: "Notes",
  rating: "Overall rating",
  ratingEmpty: "Not rated",
  pros: "Pros",
  risks: "Risks",
  photos: "Key photos",
  photoNote: "Note",
  facts: "Fact summary",
  followUps: "To confirm",
  actionItems: "Next actions",
  emptySection: "Nothing to show yet",
  selectHint: "",
  disclaimer: "AI disclaimer",
  generatedAt: "Summary generated",
  shareSelected: "",
  edit: "",
  doneEdit: "",
};

function ShareShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full flex justify-center bg-[#FDF6F0] text-[#1A1A1A]">
      <div className="w-full max-w-[720px] px-4 pt-6 pb-28">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] font-[700] tracking-[0.18em] opacity-60">
            KANFANGJI · SHARED CARD
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white border border-black/10 text-[11px] font-bold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> 關閉／回首頁
          </Link>
        </div>
        {children}
        <div className="mt-4 rounded-[18px] bg-[#F8F4EF] border border-black/5 p-3 flex items-start gap-2 text-[11px] text-[#6B7280]">
          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>
            唯讀分享連結。不含原始錄音、完整逐字稿或帳號資訊。
            <Link href="/" className="ml-1 font-bold text-[#1A1A1A] underline-offset-2 hover:underline">
              開啟 App
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function ShareStatusPage({ title, body }: { title: string; body: string }) {
  return (
    <ShareShell>
      <div className="rounded-[28px] bg-white border border-black/5 shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center mb-4">
          <ShieldAlert className="w-6 h-6 text-[#92400E]" />
        </div>
        <h1 className="text-[18px] font-bold">{title}</h1>
        <p className="mt-2 text-[13px] text-[#6B7280] leading-[1.5]">{body}</p>
      </div>
    </ShareShell>
  );
}

function LegacyMinimalCard({
  address,
  pros,
  risks,
  photoUrls,
  updatedAt,
}: {
  address: string;
  pros: string[];
  risks: string[];
  photoUrls: string[];
  updatedAt: string | null;
}) {
  return (
    <article className="bg-white rounded-[28px] overflow-hidden border border-black/[0.05] shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
      <header className="bg-[#111] text-white p-5">
        <p className="text-[10px] tracking-[0.2em] opacity-60">KANFANGJI · READ ONLY</p>
        <h1 className="text-[18px] font-bold mt-2">{address || "尚無地址"}</h1>
        {updatedAt ? (
          <p className="mt-2 text-[11px] opacity-70">
            最後更新 {new Date(updatedAt).toLocaleString()}
          </p>
        ) : null}
      </header>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] p-3">
            <p className="text-[11px] font-bold text-[#166534] mb-2">優點</p>
            {pros.length === 0 ? (
              <p className="text-[12px] text-[#9CA3AF]">尚無內容</p>
            ) : (
              <ul className="space-y-1 text-[12px]">
                {pros.slice(0, 3).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-3">
            <p className="text-[11px] font-bold text-[#991B1B] mb-2">風險</p>
            {risks.length === 0 ? (
              <p className="text-[12px] text-[#9CA3AF]">尚無內容</p>
            ) : (
              <ul className="space-y-1 text-[12px]">
                {risks.slice(0, 3).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {photoUrls.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {photoUrls.slice(0, 6).map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="aspect-[4/3] rounded-xl object-cover bg-[#F5F3F0]"
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function renderResult(token: string, result: PublicShareResult) {
  if (result.status === "password_required") {
    return (
      <ShareShell>
        <ShareUnlockForm token={token} message={result.message} />
      </ShareShell>
    );
  }
  if (result.status !== "active") {
    const titles: Record<string, string> = {
      missing: "找不到分享",
      revoked: "分享已取消",
      expired: "分享已過期",
      forbidden: "無權限",
      error: "載入失敗",
    };
    return (
      <ShareStatusPage
        title={titles[result.status] ?? "無法開啟"}
        body={result.message}
      />
    );
  }

  const summary =
    result.decisionSummary && isDecisionSummarySnapshot(result.decisionSummary)
      ? toPublicDecisionSummary(result.decisionSummary)
      : null;

  return (
    <ShareShell>
      {summary ? (
        <DecisionSummaryCard
          snapshot={summary}
          labels={READONLY_LABELS}
          mode="readonly"
          footer={
            <p className="text-[10px] text-center text-[#9CA3AF]">
              唯讀 · 最後更新{" "}
              {result.meta.snapshotUpdatedAt
                ? new Date(result.meta.snapshotUpdatedAt).toLocaleString()
                : "—"}
              {result.meta.expiresAt
                ? ` · 到期 ${new Date(result.meta.expiresAt).toLocaleString()}`
                : ""}
              {result.meta.passwordProtected ? " · 密碼保護" : ""}
            </p>
          }
        />
      ) : (
        <LegacyMinimalCard
          address={result.address}
          pros={result.legacyHighlights?.pros ?? []}
          risks={result.legacyHighlights?.risks ?? []}
          photoUrls={result.photoUrls}
          updatedAt={result.updatedAt}
        />
      )}
    </ShareShell>
  );
}

export default async function ShareCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await resolvePublicShare(token);
  return renderResult(token, result);
}
