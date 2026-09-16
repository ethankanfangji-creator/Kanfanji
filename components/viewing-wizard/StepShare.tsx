"use client";

import { Sparkles } from "lucide-react";
import {
  ShareAccessPanel,
  type ShareAccessPanelLabels,
} from "@/components/share-card/ShareAccessPanel";
import { ShareReadinessList } from "./ShareReadiness";
import type { SessionUiStatus } from "@/lib/sync";
import type { ShareLinkRecord } from "@/lib/share-access/types";
import type {
  ShareChecklistItem,
  ShareChecklistItemId,
} from "@/lib/viewing-wizard/readiness";

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
  generateLabel,
  generateHint,
  onGenerate,
  shareAccessLabels,
  shareUrl,
  hasShareToken,
  shareLastUpdatedAt,
  viewingId,
  shareLink,
  onCopyShareLink,
  onShareLinkChanged,
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
  generateLabel: string;
  generateHint: string;
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
}) {
  const statusText = (() => {
    if (syncingCard) return syncLabels.syncing;
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

  return (
    <div className="space-y-4">
      <ShareReadinessList items={checklist} labels={checklistLabels} title={checklistTitle} />

      <div className="rounded-[22px] bg-white border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4">
        <p className="text-[12px] font-[800] tracking-widest mb-2">{progressLabel}</p>
        <div className="flex items-center gap-2 text-[13px]">
          {syncingCard ? (
            <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
          ) : (
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                sessionUiStatus?.status === "synced"
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

      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate || syncingCard}
        className={`w-full h-14 rounded-full text-[15px] font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-45 ${
          canGenerate ? "bg-black text-white" : "bg-[#E5E7EB] text-[#6B7280]"
        }`}
      >
        {canGenerate && <Sparkles className="w-4 h-4" />}
        {generateLabel}
      </button>
      <p className="text-[12px] text-center text-[#6B7280] leading-[1.4] px-2">{generateHint}</p>
    </div>
  );
}
