"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  ClipboardList,
  HelpCircle,
  MapPin,
  Star,
} from "lucide-react";
import type { DecisionSummarySnapshot, SharePhotoItem, ShareTextItem } from "@/lib/share-card";
import { formatViewingAt } from "@/lib/share-card";

export type DecisionSummaryCardLabels = {
  eyebrow: string;
  address: string;
  viewingAt: string;
  basics: string;
  unit: string;
  price: string;
  layout: string;
  area: string;
  managementFee: string;
  listingUrl: string;
  setupNotes: string;
  rating: string;
  ratingEmpty: string;
  pros: string;
  risks: string;
  photos: string;
  photoNote: string;
  facts: string;
  followUps: string;
  actionItems: string;
  emptySection: string;
  selectHint: string;
  disclaimer: string;
  generatedAt: string;
  shareSelected: string;
  edit: string;
  doneEdit: string;
};

type Props = {
  snapshot: DecisionSummarySnapshot;
  labels: DecisionSummaryCardLabels;
  mode: "edit" | "preview" | "readonly";
  editing?: boolean;
  onToggleEditing?: () => void;
  onToggleText?: (
    section: "pros" | "risks" | "facts" | "followUps" | "actionItems",
    id: string,
  ) => void;
  onTogglePhoto?: (id: string) => void;
  onUpdateText?: (
    section: "pros" | "risks" | "facts" | "followUps" | "actionItems",
    id: string,
    text: string,
  ) => void;
  onSetRating?: (rating: number | null) => void;
  className?: string;
  footer?: ReactNode;
};

function EmptyLine({ label }: { label: string }) {
  return <p className="text-[12px] text-[#9CA3AF] leading-[1.4]">{label}</p>;
}

function SectionShell({
  title,
  icon,
  children,
  tone = "neutral",
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  tone?: "neutral" | "good" | "risk";
}) {
  const toneClass =
    tone === "good"
      ? "bg-[#F0FDF4] border-[#BBF7D0]"
      : tone === "risk"
        ? "bg-[#FEF2F2] border-[#FECACA]"
        : "bg-[#FAF7F3] border-black/5";
  return (
    <section className={`rounded-2xl border p-3.5 ${toneClass}`}>
      <p className="text-[11px] font-bold tracking-wide mb-2.5 flex items-center gap-1.5">
        {icon}
        {title}
      </p>
      {children}
    </section>
  );
}

function TextList({
  items,
  mode,
  editing,
  emptyLabel,
  selectHint,
  onToggle,
  onUpdate,
  good,
}: {
  items: ShareTextItem[];
  mode: Props["mode"];
  editing: boolean;
  emptyLabel: string;
  selectHint: string;
  onToggle?: (id: string) => void;
  onUpdate?: (id: string, text: string) => void;
  good?: boolean;
}) {
  const visible =
    mode === "readonly" || (mode === "preview" && !editing)
      ? items.filter((item) => item.selected && item.text.trim())
      : items.filter((item) => item.text.trim());

  if (visible.length === 0) {
    return <EmptyLine label={emptyLabel} />;
  }

  const interactive = mode === "edit" || (mode === "preview" && editing);

  return (
    <ul className="space-y-2">
      {interactive ? (
        <li className="text-[10px] text-[#6B7280]">{selectHint}</li>
      ) : null}
      {visible.map((item) => (
        <li key={item.id} className="flex items-start gap-2">
          {interactive ? (
            <button
              type="button"
              aria-pressed={item.selected}
              onClick={() => onToggle?.(item.id)}
              className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                item.selected
                  ? good
                    ? "bg-[#166534] border-[#166534] text-white"
                    : "bg-[#991B1B] border-[#991B1B] text-white"
                  : "border-black/25 bg-white"
              }`}
            >
              {item.selected ? <Check className="w-3 h-3" /> : null}
            </button>
          ) : (
            <span
              className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                good ? "bg-[#166534]" : "bg-[#991B1B]"
              }`}
            />
          )}
          {interactive && editing ? (
            <textarea
              value={item.text}
              onChange={(event) => onUpdate?.(item.id, event.target.value)}
              rows={2}
              className="flex-1 text-[12px] leading-[1.4] bg-white/90 rounded-lg p-2 outline-none border border-black/5"
            />
          ) : (
            <span
              className={`text-[12px] leading-[1.45] ${
                item.selected || mode === "readonly" ? "text-[#1A1A1A]" : "text-[#9CA3AF]"
              }`}
            >
              {item.text}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function NeutralList({
  items,
  mode,
  editing,
  emptyLabel,
  selectHint,
  onToggle,
  onUpdate,
}: {
  items: ShareTextItem[];
  mode: Props["mode"];
  editing: boolean;
  emptyLabel: string;
  selectHint: string;
  onToggle?: (id: string) => void;
  onUpdate?: (id: string, text: string) => void;
}) {
  const visible =
    mode === "readonly" || (mode === "preview" && !editing)
      ? items.filter((item) => item.selected && item.text.trim())
      : items.filter((item) => item.text.trim());

  if (visible.length === 0) return <EmptyLine label={emptyLabel} />;

  const interactive = mode === "edit" || (mode === "preview" && editing);

  return (
    <ul className="space-y-2">
      {interactive ? <li className="text-[10px] text-[#6B7280]">{selectHint}</li> : null}
      {visible.map((item) => (
        <li key={item.id} className="flex items-start gap-2">
          {interactive ? (
            <button
              type="button"
              aria-pressed={item.selected}
              onClick={() => onToggle?.(item.id)}
              className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                item.selected
                  ? "bg-[#1A1A1A] border-[#1A1A1A] text-white"
                  : "border-black/25 bg-white"
              }`}
            >
              {item.selected ? <Check className="w-3 h-3" /> : null}
            </button>
          ) : (
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-[#6B7280]" />
          )}
          {interactive && editing ? (
            <textarea
              value={item.text}
              onChange={(event) => onUpdate?.(item.id, event.target.value)}
              rows={2}
              className="flex-1 text-[12px] leading-[1.4] bg-white rounded-lg p-2 outline-none border border-black/5"
            />
          ) : (
            <span className="text-[12px] leading-[1.45]">{item.text}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function PhotoGrid({
  photos,
  mode,
  editing,
  emptyLabel,
  noteLabel,
  selectHint,
  onToggle,
}: {
  photos: SharePhotoItem[];
  mode: Props["mode"];
  editing: boolean;
  emptyLabel: string;
  noteLabel: string;
  selectHint: string;
  onToggle?: (id: string) => void;
}) {
  const visible =
    mode === "readonly" || (mode === "preview" && !editing)
      ? photos.filter((p) => p.selected && (p.url || p.remotePath))
      : photos.filter((p) => p.url || p.remotePath);

  if (visible.length === 0) return <EmptyLine label={emptyLabel} />;

  const interactive = mode === "edit" || (mode === "preview" && editing);

  return (
    <div className="space-y-2">
      {interactive ? <p className="text-[10px] text-[#6B7280]">{selectHint}</p> : null}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visible.map((photo) => (
          <figure
            key={photo.id}
            className={`relative rounded-xl overflow-hidden border bg-[#F5F3F0] ${
              photo.selected || mode === "readonly" ? "border-black/10" : "border-black/5 opacity-55"
            }`}
          >
            {photo.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.url} alt={photo.tag} className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="aspect-[4/3] w-full flex items-center justify-center text-[11px] text-[#9CA3AF]">
                {photo.tag}
              </div>
            )}
            {interactive ? (
              <button
                type="button"
                aria-pressed={photo.selected}
                onClick={() => onToggle?.(photo.id)}
                className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-white ${
                  photo.selected ? "bg-[#1A1A1A]" : "bg-black/40"
                }`}
              >
                {photo.selected ? <Check className="w-3.5 h-3.5" /> : null}
              </button>
            ) : null}
            <figcaption className="p-2 text-[11px] leading-[1.35]">
              <p className="font-bold">{photo.tag}</p>
              {photo.note ? (
                <p className="text-[#6B7280] mt-0.5">
                  {noteLabel}: {photo.note}
                </p>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function DecisionSummaryCard({
  snapshot,
  labels,
  mode,
  editing = false,
  onToggleEditing,
  onToggleText,
  onTogglePhoto,
  onUpdateText,
  onSetRating,
  className = "",
  footer,
}: Props) {
  const basics = [
    snapshot.layoutLabel,
    snapshot.priceLabel,
    snapshot.unitLabel,
    snapshot.areaLabel,
    snapshot.managementFeeLabel,
  ].filter(Boolean);
  const viewingLabel = formatViewingAt(snapshot.viewingAt);
  const canEdit = mode === "edit" || mode === "preview";
  const showEditor = canEdit && editing;

  return (
    <article
      data-testid="decision-summary-card"
      data-mode={mode}
      className={`bg-white rounded-[28px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-black/[0.05] ${className}`}
    >
      <header className="bg-[#111] text-white p-5 sm:p-6">
        <p className="text-[10px] tracking-[0.2em] opacity-60">{labels.eyebrow}</p>
        <h2 className="text-[18px] sm:text-[20px] font-bold mt-2 leading-[1.25]">
          {snapshot.address.trim() || labels.emptySection}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] opacity-90">
          {viewingLabel ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10">
              <MapPin className="w-3 h-3" />
              {viewingLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 opacity-70">
              {labels.viewingAt}: {labels.emptySection}
            </span>
          )}
        </div>
      </header>

      <div className="p-4 sm:p-5 space-y-4">
        {canEdit && onToggleEditing ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onToggleEditing}
              className="h-9 px-3 rounded-full bg-[#F5F3F0] text-[11px] font-bold"
            >
              {editing ? labels.doneEdit : labels.edit}
            </button>
          </div>
        ) : null}

        <SectionShell title={labels.basics}>
          {basics.length === 0 && !snapshot.listingUrl && !snapshot.setupNotes ? (
            <EmptyLine label={labels.emptySection} />
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">
              {snapshot.layoutLabel ? (
                <div>
                  <dt className="text-[10px] text-[#6B7280]">{labels.layout}</dt>
                  <dd className="font-semibold mt-0.5">{snapshot.layoutLabel}</dd>
                </div>
              ) : null}
              {snapshot.priceLabel ? (
                <div>
                  <dt className="text-[10px] text-[#6B7280]">{labels.price}</dt>
                  <dd className="font-semibold mt-0.5">{snapshot.priceLabel}</dd>
                </div>
              ) : null}
              {snapshot.unitLabel ? (
                <div>
                  <dt className="text-[10px] text-[#6B7280]">{labels.unit}</dt>
                  <dd className="font-semibold mt-0.5">{snapshot.unitLabel}</dd>
                </div>
              ) : null}
              {snapshot.areaLabel ? (
                <div>
                  <dt className="text-[10px] text-[#6B7280]">{labels.area}</dt>
                  <dd className="font-semibold mt-0.5">{snapshot.areaLabel}</dd>
                </div>
              ) : null}
              {snapshot.managementFeeLabel ? (
                <div>
                  <dt className="text-[10px] text-[#6B7280]">
                    {labels.managementFee}
                  </dt>
                  <dd className="font-semibold mt-0.5">
                    {snapshot.managementFeeLabel}
                  </dd>
                </div>
              ) : null}
              {snapshot.listingUrl ? (
                <div className="sm:col-span-3 min-w-0">
                  <dt className="text-[10px] text-[#6B7280]">
                    {labels.listingUrl}
                  </dt>
                  <dd className="mt-0.5 break-all">
                    <a
                      href={snapshot.listingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#2563EB] underline underline-offset-2"
                    >
                      {snapshot.listingUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              {snapshot.setupNotes ? (
                <div className="sm:col-span-3">
                  <dt className="text-[10px] text-[#6B7280]">{labels.setupNotes}</dt>
                  <dd className="mt-0.5 leading-[1.4]">{snapshot.setupNotes}</dd>
                </div>
              ) : null}
            </dl>
          )}
        </SectionShell>

        <SectionShell
          title={labels.rating}
          icon={<Star className="w-3.5 h-3.5" />}
        >
          {showEditor && onSetRating ? (
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSetRating(n)}
                  className={`w-9 h-9 rounded-full text-[13px] font-bold border ${
                    snapshot.overallRating === n
                      ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                      : "bg-white border-black/10"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onSetRating(null)}
                className="h-9 px-3 rounded-full text-[11px] font-bold border border-black/10 bg-white"
              >
                {labels.ratingEmpty}
              </button>
            </div>
          ) : snapshot.overallRating != null ? (
            <p className="text-[20px] font-bold tracking-tight">
              {snapshot.overallRating}
              <span className="text-[12px] font-medium text-[#6B7280] ml-1">/ 5</span>
            </p>
          ) : (
            <EmptyLine label={labels.ratingEmpty} />
          )}
        </SectionShell>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SectionShell
            title={labels.pros}
            tone="good"
            icon={<Check className="w-3.5 h-3.5 text-[#166534]" />}
          >
            <TextList
              items={snapshot.pros}
              mode={mode}
              editing={editing}
              emptyLabel={labels.emptySection}
              selectHint={labels.selectHint}
              good
              onToggle={(id) => onToggleText?.("pros", id)}
              onUpdate={(id, text) => onUpdateText?.("pros", id, text)}
            />
          </SectionShell>
          <SectionShell
            title={labels.risks}
            tone="risk"
            icon={<AlertTriangle className="w-3.5 h-3.5 text-[#991B1B]" />}
          >
            <TextList
              items={snapshot.risks}
              mode={mode}
              editing={editing}
              emptyLabel={labels.emptySection}
              selectHint={labels.selectHint}
              onToggle={(id) => onToggleText?.("risks", id)}
              onUpdate={(id, text) => onUpdateText?.("risks", id, text)}
            />
          </SectionShell>
        </div>

        <SectionShell title={labels.photos} icon={<Camera className="w-3.5 h-3.5" />}>
          <PhotoGrid
            photos={snapshot.photos}
            mode={mode}
            editing={editing}
            emptyLabel={labels.emptySection}
            noteLabel={labels.photoNote}
            selectHint={labels.selectHint}
            onToggle={onTogglePhoto}
          />
        </SectionShell>

        <SectionShell title={labels.facts} icon={<ClipboardList className="w-3.5 h-3.5" />}>
          <NeutralList
            items={snapshot.facts}
            mode={mode}
            editing={editing}
            emptyLabel={labels.emptySection}
            selectHint={labels.selectHint}
            onToggle={(id) => onToggleText?.("facts", id)}
            onUpdate={(id, text) => onUpdateText?.("facts", id, text)}
          />
        </SectionShell>

        <SectionShell title={labels.followUps} icon={<HelpCircle className="w-3.5 h-3.5" />}>
          <NeutralList
            items={snapshot.followUps}
            mode={mode}
            editing={editing}
            emptyLabel={labels.emptySection}
            selectHint={labels.selectHint}
            onToggle={(id) => onToggleText?.("followUps", id)}
            onUpdate={(id, text) => onUpdateText?.("followUps", id, text)}
          />
        </SectionShell>

        <SectionShell title={labels.actionItems}>
          <NeutralList
            items={snapshot.actionItems}
            mode={mode}
            editing={editing}
            emptyLabel={labels.emptySection}
            selectHint={labels.selectHint}
            onToggle={(id) => onToggleText?.("actionItems", id)}
            onUpdate={(id, text) => onUpdateText?.("actionItems", id, text)}
          />
        </SectionShell>

        {snapshot.disclaimer.trim() ? (
          <p className="text-[10px] leading-[1.5] text-[#6B7280] px-1">{snapshot.disclaimer}</p>
        ) : null}
        <p className="text-[10px] leading-[1.5] text-[#9CA3AF] px-1">
          {labels.generatedAt}: {formatViewingAt(snapshot.generatedAt)}
        </p>

        {footer}
      </div>
    </article>
  );
}

/** Stable section keys for snapshot / structure tests. */
export const DECISION_SUMMARY_CARD_SECTIONS = [
  "header",
  "basics",
  "rating",
  "pros",
  "risks",
  "photos",
  "facts",
  "followUps",
  "actionItems",
  "disclaimer",
] as const;
