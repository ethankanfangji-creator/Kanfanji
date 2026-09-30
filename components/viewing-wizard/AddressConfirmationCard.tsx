"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import type { AddressConfirmationCandidate } from "@/lib/address-confirmation";
import { COQUITLAM_PORT_MOODY_CENTER } from "@/lib/map-pin";
import { PinDropMap } from "@/components/viewing-wizard/PinDropMap";

export type AddressConfirmationCopy = {
  pendingTitle: string;
  confirmUse: string;
  rejectResearch: string;
  propertyIdLabel: string;
  coordinatesLabel: string;
  openMap: string;
  noCoordinates: string;
  adminMismatchWarning: string;
  mapPinHint: string;
  mapPinZoomIn: string;
  mapPinZoomOut: string;
  mapPinUseCenter: string;
};

export function AddressConfirmationCard({
  candidate,
  copy,
  busy = false,
  initialPin = null,
  onPinChange,
  onConfirm,
  onReject,
}: {
  candidate: AddressConfirmationCandidate;
  copy: AddressConfirmationCopy;
  busy?: boolean;
  initialPin?: { lat: number; lng: number } | null;
  onPinChange?: (pin: { lat: number; lng: number }) => void;
  onConfirm: (pin: { lat: number; lng: number } | null) => void;
  onReject: () => void;
}) {
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(initialPin);
  const hintLat = candidate.lat ?? COQUITLAM_PORT_MOODY_CENTER.latitude;
  const hintLng = candidate.lng ?? COQUITLAM_PORT_MOODY_CENTER.longitude;
  const shown = picked ?? (candidate.needsMapPin ? null : { lat: candidate.lat, lng: candidate.lng });
  const coords =
    shown?.lat != null && shown.lng != null
      ? `${shown.lat.toFixed(5)}, ${shown.lng.toFixed(5)}`
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

      {candidate.needsMapPin ? (
        <>
          <p className="mt-3 text-[13px] font-semibold leading-snug text-[#1E3A8A]">{copy.mapPinHint}</p>
          <PinDropMap
            centerLat={hintLat}
            centerLng={hintLng}
            label={copy.mapPinHint}
            picked={picked}
            zoomInLabel={copy.mapPinZoomIn}
            zoomOutLabel={copy.mapPinZoomOut}
            centerLabel={copy.mapPinUseCenter}
            onPick={(pin) => {
              setPicked(pin);
              onPinChange?.(pin);
            }}
          />
        </>
      ) : candidate.mapEmbedUrl ? (
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
          disabled={busy || (candidate.needsMapPin && !picked)}
          onClick={() => onConfirm(candidate.needsMapPin ? picked : null)}
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
