"use client";

import type { ReactNode } from "react";
import type { ViewingReport, ViewingReportCategory } from "@/lib/viewing-report/types";

export type ViewingReportPanelLabels = {
  title: string;
  propertyTitle: string;
  viewingTitle: string;
  categoryTitle: string;
  observationsTitle: string;
  originalNotesTitle: string;
  photosTitle: string;
  answeredTitle: string;
  unansweredTitle: string;
  discoveriesTitle: string;
  risksTitle: string;
  toConfirmTitle: string;
  aiSummaryTitle: string;
  emptySection: string;
  viewingAtLabel: string;
  marketLabel: string;
  tagsLabel: string;
  categories: Record<ViewingReportCategory, string>;
};

function Section({
  title,
  children,
  empty,
  hasItems,
}: {
  title: string;
  children: ReactNode;
  empty: string;
  hasItems: boolean;
}) {
  return (
    <section className="rounded-[18px] border border-black/[0.06] bg-white p-4">
      <h3 className="text-[12px] font-extrabold tracking-widest text-[#6B7280]">{title}</h3>
      {hasItems ? (
        <div className="mt-3 space-y-2">{children}</div>
      ) : (
        <p className="mt-2 text-[12px] text-[#9CA3AF]">{empty}</p>
      )}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li
          key={`${index}-${item.slice(0, 24)}`}
          className="rounded-xl bg-[#F8F4EF] px-3 py-2 text-[13px] leading-[1.45] text-[#1A1A1A]"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ViewingReportPanel({
  report,
  labels,
}: {
  report: ViewingReport;
  labels: ViewingReportPanelLabels;
}) {
  const basicsRows = [
    report.property.unitLabel,
    report.property.priceLabel,
    report.property.layoutLabel,
    report.property.areaLabel,
    report.property.managementFeeLabel,
    report.property.propertyType,
    report.property.yearBuilt,
  ].filter(Boolean);

  return (
    <div className="space-y-3" aria-labelledby="viewing-report-title">
      <div className="rounded-[22px] border border-black/[0.08] bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.05)]">
        <h2
          id="viewing-report-title"
          className="text-[16px] font-extrabold tracking-tight text-[#1A1A1A]"
        >
          {labels.title}
        </h2>
        <p className="mt-2 text-[14px] font-bold leading-[1.35] text-[#1A1A1A]">
          {report.property.address || "—"}
        </p>
        {report.property.basicsSummary ? (
          <p className="mt-1.5 text-[12px] leading-[1.45] text-[#4B5563]">
            {report.property.basicsSummary}
          </p>
        ) : null}
        {basicsRows.length ? (
          <p className="mt-2 text-[12px] text-[#6B7280]">{basicsRows.join(" · ")}</p>
        ) : null}
        {report.property.setupNotes ? (
          <p className="mt-2 rounded-xl bg-[#F8F4EF] px-3 py-2 text-[12px] text-[#374151]">
            {report.property.setupNotes}
          </p>
        ) : null}
      </div>

      <Section title={labels.viewingTitle} empty={labels.emptySection} hasItems>
        <p className="text-[13px] text-[#1A1A1A]">
          <span className="font-bold text-[#6B7280]">{labels.viewingAtLabel} </span>
          {report.viewing.viewingAt
            ? new Date(report.viewing.viewingAt).toLocaleString()
            : "—"}
        </p>
        <p className="text-[13px] text-[#1A1A1A]">
          <span className="font-bold text-[#6B7280]">{labels.marketLabel} </span>
          {report.viewing.market}
          {report.viewing.tags.length
            ? ` · ${labels.tagsLabel} ${report.viewing.tags.join(", ")}`
            : ""}
        </p>
      </Section>

      <Section
        title={labels.categoryTitle}
        empty={labels.emptySection}
        hasItems={report.categorySummaries.length > 0}
      >
        {report.categorySummaries.map((row) => (
          <div key={row.category} className="rounded-xl border border-black/5 px-3 py-2">
            <p className="text-[12px] font-bold text-[#1A1A1A]">
              {labels.categories[row.category]}{" "}
              <span className="font-medium text-[#6B7280]">
                · {row.answeredCount}/{row.answeredCount + row.openCount}
              </span>
            </p>
            {row.highlights.length ? (
              <ul className="mt-1.5 space-y-1">
                {row.highlights.map((line) => (
                  <li key={line} className="text-[12px] leading-[1.4] text-[#4B5563]">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </Section>

      <Section
        title={labels.observationsTitle}
        empty={labels.emptySection}
        hasItems={report.observations.length > 0}
      >
        {report.observations.map((item) => (
          <article key={item.id} className="rounded-xl border border-black/5 px-3 py-2">
            <p className="text-[11px] font-bold text-[#6B7280]">
              {item.kind} · {new Date(item.createdAt).toLocaleString()}
            </p>
            {item.text ? (
              <p className="mt-1 text-[13px] leading-[1.45] text-[#1A1A1A]">{item.text}</p>
            ) : null}
            {item.transcript ? (
              <p className="mt-1 text-[13px] leading-[1.45] text-[#1A1A1A]">{item.transcript}</p>
            ) : null}
            {item.aiNote ? (
              <p className="mt-1.5 rounded-lg bg-[#EFF6FF] px-2.5 py-1.5 text-[11px] leading-[1.4] text-[#1D4ED8]">
                AI: {item.aiNote}
              </p>
            ) : null}
          </article>
        ))}
      </Section>

      <Section
        title={labels.originalNotesTitle}
        empty={labels.emptySection}
        hasItems={report.originalNotes.length > 0}
      >
        <BulletList items={report.originalNotes.map((n) => n.text)} />
      </Section>

      <Section
        title={labels.photosTitle}
        empty={labels.emptySection}
        hasItems={report.photos.length > 0}
      >
        <div className="flex flex-wrap gap-2">
          {report.photos.map((photo) => (
            <figure key={photo.id} className="w-[88px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- local / signed thumbs */}
              <img
                src={photo.url}
                alt={photo.tag || ""}
                className="h-[88px] w-[88px] rounded-xl object-cover border border-black/10"
              />
              <figcaption className="mt-1 line-clamp-2 text-[10px] text-[#6B7280]">
                {[photo.tag, photo.note].filter(Boolean).join(" · ")}
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section
        title={labels.answeredTitle}
        empty={labels.emptySection}
        hasItems={report.tickets.answered.length > 0}
      >
        {report.tickets.answered.map((ticket) => (
          <div key={ticket.id} className="rounded-xl bg-[#F0FDF4] px-3 py-2">
            <p className="text-[12px] font-bold text-[#166534]">{ticket.text}</p>
            {ticket.answer ? (
              <p className="mt-1 text-[12px] leading-[1.4] text-[#14532D]">{ticket.answer}</p>
            ) : null}
          </div>
        ))}
      </Section>

      <Section
        title={labels.unansweredTitle}
        empty={labels.emptySection}
        hasItems={report.tickets.unanswered.length > 0}
      >
        <BulletList items={report.tickets.unanswered.map((t) => t.text)} />
      </Section>

      <Section
        title={labels.discoveriesTitle}
        empty={labels.emptySection}
        hasItems={report.tickets.discoveries.length > 0}
      >
        {report.tickets.discoveries.map((ticket) => (
          <div key={ticket.id} className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2">
            <p className="text-[12px] font-bold text-[#92400E]">{ticket.text}</p>
            {ticket.answer ? (
              <p className="mt-1 text-[12px] text-[#78350F]">{ticket.answer}</p>
            ) : null}
          </div>
        ))}
      </Section>

      <Section
        title={labels.risksTitle}
        empty={labels.emptySection}
        hasItems={report.risks.length > 0}
      >
        <BulletList items={report.risks} />
      </Section>

      <Section
        title={labels.toConfirmTitle}
        empty={labels.emptySection}
        hasItems={report.toConfirm.length > 0}
      >
        <BulletList items={report.toConfirm} />
      </Section>

      <Section title={labels.aiSummaryTitle} empty={labels.emptySection} hasItems>
        <p className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-[11px] leading-[1.45] text-[#1D4ED8]">
          {report.aiIntegration.preserveOriginalsNote}
        </p>
        {report.aiIntegration.pros.length ? (
          <div>
            <p className="mb-1 text-[11px] font-bold text-[#6B7280]">Pros</p>
            <BulletList items={report.aiIntegration.pros} />
          </div>
        ) : null}
        {report.aiIntegration.facts.length ? (
          <div>
            <p className="mb-1 text-[11px] font-bold text-[#6B7280]">Facts</p>
            <BulletList items={report.aiIntegration.facts} />
          </div>
        ) : null}
        {report.aiIntegration.followUps.length ? (
          <div>
            <p className="mb-1 text-[11px] font-bold text-[#6B7280]">Follow-ups</p>
            <BulletList items={report.aiIntegration.followUps} />
          </div>
        ) : null}
        {report.aiIntegration.actionItems.length ? (
          <div>
            <p className="mb-1 text-[11px] font-bold text-[#6B7280]">Actions</p>
            <BulletList items={report.aiIntegration.actionItems} />
          </div>
        ) : null}
      </Section>
    </div>
  );
}
