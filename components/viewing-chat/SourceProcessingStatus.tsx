"use client";

import type { PipelineStepLog } from "@/lib/property-source/types";
import type { PropertyChatStage } from "@/lib/viewing-chat/stage";

export function SourceProcessingStatus({
  stage,
  steps,
  urlRecordedWithoutContent,
  labels,
}: {
  stage: PropertyChatStage;
  steps?: PipelineStepLog[];
  /** Listing URL saved but page body not obtained (login/bot wall). */
  urlRecordedWithoutContent?: boolean;
  labels: {
    addressReceived: string;
    sourceMissing: string;
    externalUnverified: string;
    reportNotReady: string;
    reportReady: string;
    extracting: string;
    stageLabel: string;
    urlRecorded: string;
  };
}) {
  const running = steps?.find((s) => s.status === "running");
  const failed = steps?.filter((s) => s.status === "error") ?? [];

  return (
    <div className="border-b border-black/8 bg-white px-4 py-3">
      <p className="text-[11px] font-bold tracking-wide text-[#6B7280]">
        {labels.stageLabel}: {stage}
      </p>
      <ul className="mt-2 space-y-1 text-[12px] text-[#374151]">
        <li>• {labels.addressReceived}</li>
        <li>
          •{" "}
          {stage === "awaiting_property_source" || stage === "address_received"
            ? labels.sourceMissing
            : urlRecordedWithoutContent
              ? labels.urlRecorded
              : labels.externalUnverified}
        </li>
        <li>
          •{" "}
          {stage === "report_ready" ||
          stage === "viewing_preparation" ||
          stage === "follow_up_questions"
            ? labels.reportReady
            : labels.reportNotReady}
        </li>
      </ul>
      {running ? (
        <p className="mt-2 text-[12px] font-semibold text-[#1D4ED8]" role="status">
          {labels.extracting}: {running.step}
        </p>
      ) : null}
      {failed.length > 0 && !urlRecordedWithoutContent ? (
        <p className="mt-1 text-[12px] font-semibold text-[#92400E]">
          {failed.map((f) => f.errorMessage || f.errorCode).filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
