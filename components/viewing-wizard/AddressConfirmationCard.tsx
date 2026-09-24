"use client";

import { MapPin } from "lucide-react";
import type { AddressConfirmationCandidate } from "@/lib/address-confirmation";

export type AddressConfirmationCopy = {
  pendingTitle: string;
  confirmUse: string;
  rejectResearch: string;
  propertyIdLabel: string;
  coordinatesLabel: string;
  openMap: string;
  noCoordinates: string;
  adminMismatchWarning: string;
};

export function AddressConfirmationCard({
  candidate,
  copy,
  busy = false,
  onConfirm,
  onReject,
}: {
  candidate: AddressConfirmationCandidate;
  copy: AddressConfirmationCopy;
  busy?: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const coords =
    candidate.lat != null && candidate.lng != null
      ? `${candidate.lat.toFixed(5)}, ${candidate.lng.toFixed(5)}`
      : null;

  return (
    <div
      className="rounded-[18px] border border-[#BFDBFE] bg-[#EFF6FF] p-4"
      role="region"
      aria-label={copy.pendingTitle}
    >
      <p className="text-[11px] font-bold tracking-wide text-[#1E40AF]">{copy.pendingTitle}</p>
      <p className="mt-1 text-[15px] font-extrabold leading-snug text-[#1E3A8A]">
        {candidate.displayAddress}
      </p>

      {candidate.adminDistrictMismatch ? (
        <p
          className="mt-3 rounded-[12px] border border-[#F59E0B] bg-[#FFFBEB] px-3 py-2 text-[12px] font-bold leading-snug text-[#92400E]"
          role="alert"
        >
          {copy.adminMismatchWarning}
        </p>
      ) : null}

      <dl className="mt-3 space-y-1.5 text-[12px] text-[#1E3A8A]">
        {candidate.propertyId ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold text-[#1E40AF]">{copy.propertyIdLabel}</dt>
            <dd className="break-all font-mono text-[11px]">{candidate.propertyId}</dd>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-[#1E40AF]">{copy.coordinatesLabel}</dt>
          <dd>{coords ?? copy.noCoordinates}</dd>
        </div>
      </dl>

      {candidate.mapEmbedUrl ? (
        <div className="mt-3 overflow-hidden rounded-[12px] border border-[#BFDBFE] bg-white">
          <iframe
            title={copy.pendingTitle}
            src={candidate.mapEmbedUrl}
            className="h-40 w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          {candidate.openMapUrl ? (
            <a
              href={candidate.openMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-[#1D4ED8] underline-offset-2 hover:underline"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {copy.openMap}
            </a>
          ) : null}
        </div>
      ) : null}

      {candidate.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {candidate.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[#BFDBFE] bg-white px-3 py-1 text-[11px] font-medium text-[#1E40AF]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="ui-button ui-button--primary min-h-11 flex-1"
          disabled={busy}
          onClick={onConfirm}
        >
          {copy.confirmUse}
        </button>
        <button
          type="button"
          className="ui-button ui-button--secondary min-h-11 flex-1"
          disabled={busy}
          onClick={onReject}
        >
          {copy.rejectResearch}
        </button>
      </div>
    </div>
  );
}
