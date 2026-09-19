"use client";

import { Loader2, Sparkles } from "lucide-react";
import {
  ShareAccessPanel,
  type ShareAccessPanelLabels,
} from "@/components/share-card/ShareAccessPanel";
import {
  ViewingReportPanel,
  type ViewingReportPanelLabels,
} from "@/components/viewing-wizard/ViewingReportPanel";
import type { ViewingReport } from "@/lib/viewing-report/types";
import { ShareReadinessList } from "./ShareReadiness";
import type { SessionUiStatus } from "@/lib/sync";
import type { ShareLinkRecord } from "@/lib/share-access/types";
import {
  GENERATE_STAGE_IDS,
  isGenerateStageReached,
  type GenerateStageId,
} from "@/lib/viewing-wizard/generate-stages";
import type {
  ShareChecklistItem,
  ShareChecklistItemId,
} from "@/lib/viewing-wizard/readiness";

export type StepShareStageLabels = Record<GenerateStageId, string>;

export function StepShare({
  checklist,
  checklistLabels,
  checklistTitle,
  progressLabel,
  sessionUiStatus,
  syncingCard,
  syncMessage,
  syncLabels,
  canGenerate,
  generateTitle,
  generateLabel,
  generateHint,
  generateFailed,
  generateFailedLabel,
  generateStage,
  stageLabels,
  previewTitle,
  previewEmpty,
  previewOpenLabel,
  previewSummary,
  onOpenPreview,
  onGenerate,
  shareAccessLabels,
  shareUrl,
  hasShareToken,
  shareLastUpdatedAt,
  viewingId,
  shareLink,
  onCopyShareLink,
  onShareLinkChanged,
  report = null,
  reportLabels,
  shareEnabled = false,
  signInToShareLabel,
  onRequestSignIn,
}: {
  checklist: ShareChecklistItem[];
  checklistLabels: Record<ShareChecklistItemId, string>;
  checklistTitle: string;
  progressLabel: string;
  sessionUiStatus: SessionUiStatus | null;
  syncingCard: boolean;
  syncMessage: string;
  syncLabels: {
    savedLocal: string;
    pending: string;
    syncing: string;
    synced: string;
    failed: string;
    conflict: string;
  };
  canGenerate: boolean;
  generateTitle?: string;
  generateLabel: string;
  generateHint: string;
  generateFailed?: boolean;
  generateFailedLabel?: string;
  generateStage?: GenerateStageId | null;
  stageLabels: StepShareStageLabels;
  previewTitle: string;
  previewEmpty: string;
  previewOpenLabel: string;
  previewSummary?: string | null;
  onOpenPreview?: () => void;
  onGenerate: () => void;
  shareAccessLabels: ShareAccessPanelLabels;
  shareUrl: string;
  hasShareToken: boolean;
  shareLastUpdatedAt: string | null;
  viewingId: string | null;
  shareLink: ShareLinkRecord | null;
  onCopyShareLink?: () => void;
  onShareLinkChanged: (next: {
    link: ShareLinkRecord | null;
    urlPath?: string;
  }) => void;
  report?: ViewingReport | null;
  reportLabels?: ViewingReportPanelLabels;
  /** When false, share link panel is hidden and a sign-in CTA may show. */
  shareEnabled?: boolean;
  signInToShareLabel?: string;
  onRequestSignIn?: () => void;
}) {
  const statusText = (() => {
    if (syncingCard && generateStage) return stageLabels[generateStage];
    if (syncingCard) return syncLabels.syncing;
    if (generateFailed && generateFailedLabel) return generateFailedLabel;
    if (sessionUiStatus?.errorMessage) return sessionUiStatus.errorMessage;
    if (syncMessage) return syncMessage;
    switch (sessionUiStatus?.status) {
      case "local_only":
        return syncLabels.savedLocal;
      case "pending":
        return syncLabels.pending;
      case "syncing":
        return syncLabels.syncing;
      case "synced":
        return syncLabels.synced;
      case "failed":
        return syncLabels.failed;
      case "conflict":
        return syncLabels.conflict;
      default:
        return syncLabels.savedLocal;
    }
  })();

  const showShareAccess = Boolean(shareEnabled && (hasShareToken || shareLink));

  return (
    <div className="space-y-4">
      <ShareReadinessList items={checklist} labels={checklistLabels} title={checklistTitle} />

      <section
        aria-labelledby="step3-generate-heading"
        className="rounded-[22px] border border-black/[0.08] bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.06)]"
      >
        <h2
          id="step3-generate-heading"
          className="text-[15px] font-extrabold tracking-tight text-[#1A1A1A]"
        >
          {generateTitle ?? generateLabel}
        </h2>
        <p className="mt-1.5 text-[12px] leading-[1.45] text-[#6B7280]">{generateHint}</p>

        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate || syncingCard}
          aria-busy={syncingCard || undefined}
          className={`mt-4 w-full min-h-14 rounded-full text-[15px] font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-45 ${
            canGenerate ? "bg-black text-white" : "bg-[#E5E7EB] text-[#6B7280]"
          }`}
        >
          {syncingCard ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            canGenerate && <Sparkles className="h-4 w-4" aria-hidden />
          )}
          {syncingCard && generateStage
            ? stageLabels[generateStage]
            : generateLabel}
        </button>

        {syncingCard ? (
          <ol className="mt-4 space-y-2" aria-label={progressLabel}>
            {GENERATE_STAGE_IDS.map((stageId) => {
              const reached = isGenerateStageReached(generateStage, stageId);
              const current = generateStage === stageId;
              return (
                <li
                  key={stageId}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[12px] font-medium ${
                    current
                      ? "border-[#111] bg-[#111] text-white"
                      : reached
                        ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"
                        : "border-black/5 bg-[#F8F4EF] text-[#9CA3AF]"
                  }`}
                >
                  {current ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        reached ? "bg-[#22C55E]" : "bg-[#D1D5DB]"
                      }`}
                      aria-hidden
                    />
                  )}
                  <span>{stageLabels[stageId]}</span>
                </li>
              );
            })}
          </ol>
        ) : null}

        {generateFailed && !syncingCard ? (
          <p role="alert" className="mt-3 text-[12px] font-medium leading-[1.45] text-[#991B1B]">
            {generateFailedLabel}
          </p>
        ) : null}
      </section>

      {report && reportLabels ? (
        <ViewingReportPanel report={report} labels={reportLabels} />
      ) : null}

      <section
        aria-labelledby="step3-preview-heading"
        className="rounded-[22px] border border-dashed border-black/10 bg-[#FAF7F3] p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id="step3-preview-heading"
            className="text-[12px] font-[800] tracking-widest text-[#6B7280]"
          >
            {previewTitle}
          </h2>
          {previewSummary && onOpenPreview ? (
            <button
              type="button"
              onClick={onOpenPreview}
              className="min-h-9 rounded-full border border-black/10 bg-white px-3 text-[11px] font-bold text-[#1A1A1A]"
            >
              {previewOpenLabel}
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[13px] leading-[1.45] text-[#4B5563]">
          {previewSummary || previewEmpty}
        </p>
      </section>

      <div className="rounded-[22px] bg-white border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4">
        <p className="text-[12px] font-[800] tracking-widest mb-2">{progressLabel}</p>
        <div
          className="flex items-center gap-2 text-[13px]"
          role={
            (!generateFailed &&
              (sessionUiStatus?.status === "failed" ||
                sessionUiStatus?.status === "conflict"))
              ? "alert"
              : "status"
          }
          aria-live="polite"
          aria-atomic="true"
        >
          {syncingCard ? (
            <div
              className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"
              aria-hidden="true"
            />
          ) : (
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                generateFailed
                  ? "bg-[#EF4444]"
                  : sessionUiStatus?.status === "synced"
                    ? "bg-[#22C55E]"
                    : sessionUiStatus?.status === "failed" ||
                        sessionUiStatus?.status === "conflict"
                      ? "bg-[#EF4444]"
                      : sessionUiStatus?.status === "syncing" ||
                          sessionUiStatus?.status === "pending"
                        ? "bg-[#3B82F6] animate-pulse"
                        : "bg-[#D1D5DB]"
              }`}
            />
          )}
          <span className="font-medium text-[#374151]">{statusText}</span>
        </div>
      </div>

      {showShareAccess ? (
        <ShareAccessPanel
          labels={shareAccessLabels}
          shareUrl={shareUrl}
          hasToken={hasShareToken}
          lastUpdatedAt={shareLastUpdatedAt}
          synced={sessionUiStatus?.status === "synced"}
          viewingId={viewingId}
          link={shareLink}
          onCopyLink={onCopyShareLink}
          onLinkChanged={onShareLinkChanged}
        />
      ) : !shareEnabled && signInToShareLabel && onRequestSignIn ? (
        <section className="rounded-[22px] border border-dashed border-black/15 bg-white p-4">
          <p className="text-[12px] leading-[1.45] text-[#6B7280]">{generateHint}</p>
          <button
            type="button"
            onClick={onRequestSignIn}
            className="mt-3 w-full min-h-12 rounded-full bg-black text-[14px] font-bold text-white"
          >
            {signInToShareLabel}
          </button>
        </section>
      ) : null}
    </div>
  );
}
