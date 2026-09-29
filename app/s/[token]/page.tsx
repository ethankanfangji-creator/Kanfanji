import Link from "next/link";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { ArrowLeft, MapPin, ShieldAlert } from "lucide-react";
import { ChatReportShareCard } from "@/components/share-card/ChatReportShareCard";
import { LocalTime } from "@/components/share-card/LocalTime";
import { DecisionSummaryCard } from "@/components/share-card/DecisionSummaryCard";
import { ShareUnlockForm } from "@/components/share-card/ShareUnlockForm";
import { detectLocale, htmlLang, isLocale, LOCALE_STORAGE_KEY, type Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n";
import { resolvePublicShare } from "@/lib/share";
import type { PublicShareResult } from "@/lib/share-access";
import {
  isDecisionSummarySnapshot,
  toPublicDecisionSummary,
} from "@/lib/share-card";

async function requestLocale(): Promise<Locale> {
  const jar = await cookies();
  const stored = jar.get(LOCALE_STORAGE_KEY)?.value;
  if (isLocale(stored)) return stored;
  const accept = (await headers()).get("accept-language");
  return detectLocale(accept?.split(",")[0]);
}

function formatWhen(value: string | null | undefined, locale: Locale) {
  return <LocalTime iso={value} locale={htmlLang(locale)} />;
}

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

function ShareShell({
  children,
  labels,
}: {
  children: ReactNode;
  labels: { eyebrow: string; close: string; foot: string; openApp: string };
}) {
  return (
    <div className="min-h-screen w-full flex justify-center bg-[#FDF6F0] text-[#1A1A1A]">
      <div className="w-full max-w-[720px] px-4 pt-6 pb-28">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] font-[700] tracking-[0.18em] opacity-60">
            {labels.eyebrow}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white border border-black/10 text-[11px] font-bold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {labels.close}
          </Link>
        </div>
        {children}
        <div className="mt-4 rounded-[18px] bg-[#F8F4EF] border border-black/5 p-3 flex items-start gap-2 text-[11px] text-[#6B7280]">
          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>
            {labels.foot}
            <Link href="/" className="ml-1 font-bold text-[#1A1A1A] underline-offset-2 hover:underline">
              {labels.openApp}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function ShareStatusPage({
  title,
  body,
  shell,
}: {
  title: string;
  body: string;
  shell: { eyebrow: string; close: string; foot: string; openApp: string };
}) {
  return (
    <ShareShell labels={shell}>
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
  labels,
}: {
  address: string;
  pros: string[];
  risks: string[];
  photoUrls: string[];
  updatedAt: ReactNode;
  labels: { noAddress: string; updated: string; pros: string; risks: string; empty: string };
}) {
  return (
    <article className="bg-white rounded-[28px] overflow-hidden border border-black/[0.05] shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
      <header className="bg-[#111] text-white p-5">
        <p className="text-[10px] tracking-[0.2em] opacity-60">KANFANGJI · READ ONLY</p>
        <h1 className="text-[18px] font-bold mt-2">{address || labels.noAddress}</h1>
        {updatedAt ? (
          <p className="mt-2 text-[11px] opacity-70">
            {labels.updated} {updatedAt}
          </p>
        ) : null}
      </header>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] p-3">
            <p className="text-[11px] font-bold text-[#166534] mb-2">{labels.pros}</p>
            {pros.length === 0 ? (
              <p className="text-[12px] text-[#9CA3AF]">{labels.empty}</p>
            ) : (
              <ul className="space-y-1 text-[12px]">
                {pros.slice(0, 3).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-3">
            <p className="text-[11px] font-bold text-[#991B1B] mb-2">{labels.risks}</p>
            {risks.length === 0 ? (
              <p className="text-[12px] text-[#9CA3AF]">{labels.empty}</p>
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

function renderResult(token: string, result: PublicShareResult, locale: Locale) {
  const messages = getMessages(locale);
  const share = messages.share;
  const chat = messages.chat;
  const shell = {
    eyebrow: share.shellEyebrow,
    close: share.closeHome,
    foot: share.readonlyFoot,
    openApp: share.openApp,
  };
  const statusName = (status: string) => {
    if (status === "confirmed") return chat.statusConfirmed;
    if (status === "subjective") return chat.statusSubjective;
    if (status === "inferred") return chat.statusInferred;
    if (status === "corrected") return chat.statusCorrected;
    return status;
  };
  if (result.status === "password_required") {
    return (
      <ShareShell labels={shell}>
        <ShareUnlockForm token={token} message={result.message} />
      </ShareShell>
    );
  }
  if (result.status !== "active") {
    return (
      <ShareStatusPage title={share.invalidTitle} body={share.invalidBody} shell={shell} />
    );
  }

  if (result.chatReport) {
    return (
      <ShareShell labels={shell}>
        <ChatReportShareCard
          address={result.chatReport.address}
          generatedAt={formatWhen(result.chatReport.reportGeneratedAt, locale)}
          summary={result.chatReport.summary}
          pros={result.chatReport.pros}
          risks={result.chatReport.risks}
          checklist={result.chatReport.checklist}
          fields={result.chatReport.fields}
          labels={{
            pros: messages.card.pros,
            risks: messages.card.risks,
            checkedFields: share.checkedFields,
            empty: share.empty,
            caution: share.aiCaution,
            fieldName: (fieldId) =>
              chat.fieldLabels[fieldId as keyof typeof chat.fieldLabels] ?? fieldId,
            statusName,
          }}
        />
      </ShareShell>
    );
  }

  const summary =
    result.decisionSummary && isDecisionSummarySnapshot(result.decisionSummary)
      ? toPublicDecisionSummary(result.decisionSummary)
      : null;

  return (
    <ShareShell labels={shell}>
      {summary ? (
        <DecisionSummaryCard
          snapshot={summary}
          labels={{
            ...READONLY_LABELS,
            pros: messages.card.pros,
            risks: messages.card.risks,
            emptySection: share.empty,
            disclaimer: share.aiCaution,
            generatedAt: share.updatedLabel,
          }}
          mode="readonly"
          footer={
            <p className="text-[10px] text-center text-[#9CA3AF]">
              {share.updatedLabel}{" "}
              {formatWhen(result.meta.snapshotUpdatedAt, locale)}
              {result.meta.expiresAt ? <> · {formatWhen(result.meta.expiresAt, locale)}</> : null}
            </p>
          }
        />
      ) : (
        <LegacyMinimalCard
          address={result.address}
          pros={result.legacyHighlights?.pros ?? []}
          risks={result.legacyHighlights?.risks ?? []}
          photoUrls={result.photoUrls}
          updatedAt={formatWhen(result.updatedAt, locale)}
          labels={{
            noAddress: share.noAddress,
            updated: share.updatedLabel,
            pros: messages.card.pros,
            risks: messages.card.risks,
            empty: share.empty,
          }}
        />
      )}
    </ShareShell>
  );
}

export async function generateMetadata() {
  const locale = await requestLocale();
  return {
    title: getMessages(locale).share.chatReportTitle,
    robots: { index: false, follow: false },
  };
}

export default async function ShareCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await requestLocale();
  const result = await resolvePublicShare(token);
  return renderResult(token, result, locale);
}
