"use client";

import type { ReactNode } from "react";
import { ShareMapBlock } from "@/components/share-card/ShareMapBlock";
import {
  ReportSectionsView,
  type ReportSectionLabels,
} from "@/components/viewing-chat/ReportSectionsView";
import type { PublicSharePayload } from "@/lib/share-access/types";

type ChatReportPayload = NonNullable<PublicSharePayload["chatReport"]>;

export function ChatReportShareCard({
  report,
  generatedAt,
  photoUrls = [],
  labels,
}: {
  report: ChatReportPayload;
  generatedAt: ReactNode;
  photoUrls?: string[];
  labels: {
    empty: string;
    caution: string;
    photos?: string;
    openMap: string;
    sections: ReportSectionLabels;
  };
}) {
  const lat = report.version === 3 ? report.lat : undefined;
  const lng = report.version === 3 ? report.lng : undefined;
  const sectionReport =
    report.version === 3
      ? {
          title: report.title,
          meta: report.meta,
          overview: report.overview,
          interior: report.interior,
          outdoorLand: report.outdoorLand,
          transitLifestyle: report.transitLifestyle,
          pricing: report.pricing,
          pros: report.pros,
          risks: report.risks,
          scores: report.scores,
          verdict: report.verdict,
          nextSteps: report.nextSteps,
          summary: report.summary ?? undefined,
        }
      : {
          title: report.title,
          pros: report.pros,
          risks: report.risks,
          nextSteps: report.followUps,
          summary: report.summary ?? undefined,
        };

  const hasBody =
    Boolean(sectionReport.summary?.trim()) ||
    Boolean(("overview" in sectionReport && sectionReport.overview?.trim()) || false) ||
    Boolean(("interior" in sectionReport && sectionReport.interior?.trim()) || false) ||
    (sectionReport.pros?.length ?? 0) > 0 ||
    (sectionReport.risks?.length ?? 0) > 0;

  return (
    <article className="rounded-[28px] bg-white p-6">
      <h1 className="text-[20px] font-bold">{report.address || "—"}</h1>
      <p className="mt-1 text-[12px] text-[#6B7280]">{generatedAt || "—"}</p>
      {lat != null && lng != null ? (
        <div className="mt-3">
          <ShareMapBlock
            lat={lat}
            lng={lng}
            address={report.address}
            openMapLabel={labels.openMap}
          />
        </div>
      ) : null}
      {hasBody ? (
        <div className="mt-3">
          <ReportSectionsView
            report={sectionReport}
            labels={labels.sections}
            className="text-[14px]"
          />
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-[#6B7280]">{labels.empty}</p>
      )}
      {photoUrls.length > 0 ? (
        <div className="mt-4">
          {labels.photos ? (
            <h2 className="text-[13px] font-bold">{labels.photos}</h2>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photoUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="aspect-[4/3] rounded-xl object-cover bg-[#F5F3F0]"
              />
            ))}
          </div>
        </div>
      ) : null}
      <p className="mt-4 text-[11px] text-[#6B7280]">{labels.caution}</p>
    </article>
  );
}
