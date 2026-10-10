import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { ShieldAlert } from "lucide-react";
import { ClientAuthBar } from "@/components/ClientAuthBar";
import { ChatReportShareCard } from "@/components/share-card/ChatReportShareCard";
import { LocalTime } from "@/components/share-card/LocalTime";
import { DecisionSummaryCard } from "@/components/share-card/DecisionSummaryCard";
import { ShareReportComments } from "@/components/share-card/ShareReportComments";
import { ShareSaveButton } from "@/components/share-card/ShareSaveButton";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { PageContainer } from "@/components/ui/primitives";
import { detectLocale, htmlLang, isLocale, LOCALE_STORAGE_KEY, type Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n";
import {
  browseOriginHome,
  parseBrowseOrigin,
  shouldShowShareBack,
} from "@/lib/browse-origin";
import { resolvePublicShare } from "@/lib/share";
import type { PublicShareResult } from "@/lib/share-access";
import { getShareSaveState } from "@/lib/share-access/saves";
import {
  isDecisionSummarySnapshot,
  toPublicDecisionSummary,
} from "@/lib/share-card";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

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
  openMap: "Open in Maps",
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
  loginNext,
  recipientLine,
}: {
  children: ReactNode;
  labels: {
    eyebrow: string;
    close?: string | null;
    closeHref?: string | null;
  };
  loginNext: string;
  /** Provenance under eyebrow, e.g. shared for Mom. */
  recipientLine?: string | null;
}) {
  const backLabel = labels.close;
  const backHref = labels.closeHref;
  const showBack = Boolean(backLabel && backHref);
  return (
    <div className="flex min-h-screen w-full justify-center bg-[#FDF6F0] text-[#1A1A1A]">
      <PageContainer
        width="content"
        style={{
          paddingTop: "max(1.5rem, env(safe-area-inset-top, 0px))",
          paddingBottom: "max(7rem, calc(1.5rem + env(safe-area-inset-bottom, 0px)))",
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {showBack && backLabel && backHref ? (
              <BackHomeLink label={backLabel} href={backHref} />
            ) : null}
            <p
              className={`text-[11px] font-[700] tracking-[0.18em] opacity-60 ${
                showBack ? "mt-2" : ""
              }`}
            >
              {labels.eyebrow}
            </p>
            {recipientLine ? (
              <p className="mt-1.5 text-[13px] font-semibold text-[#374151]">{recipientLine}</p>
            ) : null}
          </div>
          <div className="shrink-0">
            <ClientAuthBar loginNext={loginNext} />
          </div>
        </div>
        {children}
      </PageContainer>
    </div>
  );
}

function ShareStatusPage({
  title,
  body,
  shell,
  loginNext,
}: {
  title: string;
  body: string;
  shell: {
    eyebrow: string;
    close?: string | null;
    closeHref?: string | null;
  };
  loginNext: string;
}) {
  return (
    <ShareShell labels={shell} loginNext={loginNext}>
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

function renderResult(
  token: string,
  result: PublicShareResult,
  locale: Locale,
  fromParam: string | string[] | undefined,
  isOwner: boolean,
) {
  const messages = getMessages(locale);
  const share = messages.share;
  const chat = messages.chat;
  const fromRaw = Array.isArray(fromParam) ? fromParam[0] : fromParam;
  const back = browseOriginHome(parseBrowseOrigin(fromRaw));
  const showBack = shouldShowShareBack(fromRaw, isOwner);
  const loginNext = `/s/${token}`;
  const shell = {
    eyebrow: share.shellEyebrow,
    close: showBack ? messages.nav.back : null,
    closeHref: showBack ? back.href : null,
  };
  const recipientLabel =
    result.status === "active" ? result.meta.recipientLabel : null;
  const recipientLine = recipientLabel
    ? share.sharedForLabel.replace("{name}", recipientLabel)
    : share.sharedGeneralLabel;
  if (result.status !== "active") {
    return (
      <ShareStatusPage
        title={share.invalidTitle}
        body={share.invalidBody}
        shell={shell}
        loginNext={loginNext}
      />
    );
  }

  if (result.chatReport) {
    return (
      <ShareShell labels={shell} loginNext={loginNext} recipientLine={recipientLine}>
        <ChatReportShareCard
          report={result.chatReport}
          generatedAt={formatWhen(result.chatReport.reportGeneratedAt, locale)}
          photoUrls={result.photoUrls}
          labels={{
            empty: share.empty,
            caution: share.aiCaution,
            photos: share.reportPhotos,
            openMap: share.openMap,
            sections: {
              overview: chat.reportOverview,
              interior: chat.reportInterior,
              outdoorLand: chat.reportOutdoorLand,
              transitLifestyle: chat.reportTransitLifestyle,
              pricing: chat.reportPricing,
              pros: chat.reportPros,
              risks: chat.reportRisks,
              scores: chat.reportScores,
              highlight: chat.reportHighlight,
              biggestQuestion: chat.reportBiggestQuestion,
              overall: chat.reportOverall,
              verdict: chat.reportVerdict,
              nextSteps: chat.reportNextSteps,
              meta: {
                viewingDate: chat.reportMetaViewingDate,
                propertyType: chat.reportMetaPropertyType,
                yearBuilt: chat.reportMetaYearBuilt,
                askingPrice: chat.reportMetaAskingPrice,
                lotSize: chat.reportMetaLotSize,
                interiorSize: chat.reportMetaInteriorSize,
                layout: chat.reportMetaLayout,
                neighborhood: chat.reportMetaNeighborhood,
              },
            },
          }}
        />
        <ShareSaveButton
          token={token}
          labels={{
            save: share.saveReport,
            saved: share.saveReportDone,
            saving: share.saveReportSaving,
            signInToSave: share.saveReportSignIn,
            failed: share.saveReportFailed,
          }}
        />
        <ShareReportComments
          token={token}
          recipientLabel={recipientLabel}
          labels={{
            title: share.commentsTitle,
            empty: share.commentsEmpty,
            nickname: share.commentsNickname,
            nicknamePlaceholder: share.commentsNicknamePlaceholder,
            body: share.commentsBody,
            bodyPlaceholder: share.commentsBodyPlaceholder,
            submit: share.commentsSubmit,
            submitting: share.commentsSubmitting,
            failed: share.commentsFailed,
            rateLimited: share.commentsRateLimited,
            guestDefault: share.commentsGuestDefault,
            namedAs: share.commentsNamedAs,
            reply: share.commentsReply,
            replyPlaceholder: share.commentsReplyPlaceholder,
            replySubmit: share.commentsReplySubmit,
            replyFailed: share.commentsReplyFailed,
            ownerAuthor: share.commentsOwnerAuthor,
            notifyOnReply: share.commentsNotifyOnReply,
            notifyEmailPlaceholder: share.commentsNotifyEmailPlaceholder,
            notifyEmailHint: share.commentsNotifyEmailHint,
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
    <ShareShell labels={shell} loginNext={loginNext} recipientLine={recipientLine}>
      {summary ? (
        <DecisionSummaryCard
          snapshot={summary}
          labels={{
            ...READONLY_LABELS,
            openMap: share.openMap,
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
      <ShareSaveButton
        token={token}
        labels={{
          save: share.saveReport,
          saved: share.saveReportDone,
          saving: share.saveReportSaving,
          signInToSave: share.saveReportSignIn,
          failed: share.saveReportFailed,
        }}
      />
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
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { token } = await params;
  const { from } = await searchParams;
  const locale = await requestLocale();
  const [result, isOwner] = await Promise.all([
    resolvePublicShare(token),
    (async () => {
      try {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return false;
        const state = await getShareSaveState(createAdminClient(), token, user.id);
        return state.ok && state.isOwner;
      } catch {
        return false;
      }
    })(),
  ]);
  return renderResult(token, result, locale, from, isOwner);
}
