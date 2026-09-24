"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, LocateFixed, RotateCcw, Search, Zap } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import {
  AddressAutocomplete,
  type AddressAutocompleteCopy,
} from "@/components/viewing-wizard/AddressAutocomplete";
import {
  AddressConfirmationCard,
  type AddressConfirmationCopy,
} from "@/components/viewing-wizard/AddressConfirmationCard";
import {
  PropertyBasicsCard,
  type PropertyBasicsCopy,
} from "@/components/viewing-wizard/PropertyBasicsCard";
import { defaultPhotoExifReader } from "@/lib/photo-metadata/exif-reader";
import type { GpsCoordinates } from "@/lib/photo-metadata/types";
import type { AddressSuggestion } from "@/lib/address-suggest";
import type { AddressConfirmationCandidate } from "@/lib/address-confirmation";
import type { PropertyBasicsSnapshot } from "@/lib/property-basics/types";

export type StepSetupMessages = {
  address: {
    placeholder: string;
    hint: string;
    lookingUp: string;
    identified: string;
    autofilledHint: string;
    openDataPrefix: string;
    photoMetaImport: string;
    photoMetaHint: string;
    photoMetaReading: string;
    photoMetaNoGps: string;
    photoMetaUnsupported: string;
    photoMetaError: string;
    photoMetaGpsPrivacyTitle: string;
    photoMetaGpsPrivacyBody: string;
    photoMetaGpsAccept: string;
    photoMetaGpsRefuse: string;
    photoMetaGpsRefused: string;
    photoMetaGpsApplied: string;
    suggestLoading: string;
    suggestEmpty: string;
    suggestError: string;
    suggestListLabel: string;
    useMyLocation: string;
    locating: string;
    locationDenied: string;
    locationUnavailable: string;
    locationUnsupported: string;
    locationFailed: string;
    confirmAddress: string;
    changeAddress: string;
    confirmedLabel: string;
    selectToConfirm: string;
    pendingConfirmTitle: string;
    confirmUseThisAddress: string;
    rejectResearch: string;
    propertyIdLabel: string;
    coordinatesLabel: string;
    openMap: string;
    noCoordinates: string;
  };
  setup: {
    title: string;
    subtitle?: string;
    lookupOptional: string;
    startViewing: string;
    startViewingHint: string;
  };
  propertyBasics: PropertyBasicsCopy;
};

export function StepSetup({
  messages,
  address,
  onAddressChange,
  lookingUp,
  onConfirmAddress,
  onConfirmSuggestion,
  onReselectAddress,
  pendingCandidate = null,
  onAcceptPendingAddress,
  onRejectPendingAddress,
  identified,
  tags,
  propertyDraft,
  syncMessage,
  lookupError,
  onApplyExifGps,
  applyingExifGps = false,
  onUseMyLocation,
  locating = false,
  locationError = "",
  propertyBasicsStatus,
  propertyBasics,
  onRetryPropertyBasics,
  onStartViewing,
  startingViewing = false,
}: {
  messages: StepSetupMessages;
  address: string;
  onAddressChange: (value: string) => void;
  lookingUp: boolean;
  /** Confirm currently typed address (after user selected or finished editing). */
  onConfirmAddress: () => void;
  onConfirmSuggestion: (suggestion: AddressSuggestion) => void;
  onReselectAddress: () => void;
  /** Normalized lookup result awaiting explicit user confirm before bind. */
  pendingCandidate?: AddressConfirmationCandidate | null;
  onAcceptPendingAddress?: () => void;
  onRejectPendingAddress?: () => void;
  identified: boolean;
  tags: string[];
  propertyDraft: Record<string, unknown>;
  syncMessage: string;
  lookupError: boolean;
  onApplyExifGps: (gps: GpsCoordinates) => Promise<void>;
  applyingExifGps?: boolean;
  onUseMyLocation: () => void;
  locating?: boolean;
  locationError?: string;
  propertyBasicsStatus: "idle" | "loading" | "ready" | "error";
  propertyBasics: PropertyBasicsSnapshot | null;
  onRetryPropertyBasics: () => void;
  onStartViewing: () => void;
  startingViewing?: boolean;
}) {
  const openData = propertyDraft.openData as
    | { zoningCode?: string; city?: string; zoningLabel?: string; pid?: string }
    | undefined;
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoMetaStatus, setPhotoMetaStatus] = useState<string>("");
  const [readingPhotoMeta, setReadingPhotoMeta] = useState(false);
  const [pendingGps, setPendingGps] = useState<GpsCoordinates | null>(null);

  const autocompleteCopy: AddressAutocompleteCopy = {
    placeholder: messages.address.placeholder,
    loading: messages.address.suggestLoading,
    empty: messages.address.suggestEmpty,
    error: messages.address.suggestError,
    listLabel: messages.address.suggestListLabel,
  };

  const confirmationCopy: AddressConfirmationCopy = {
    pendingTitle: messages.address.pendingConfirmTitle,
    confirmUse: messages.address.confirmUseThisAddress,
    rejectResearch: messages.address.rejectResearch,
    propertyIdLabel: messages.address.propertyIdLabel,
    coordinatesLabel: messages.address.coordinatesLabel,
    openMap: messages.address.openMap,
    noCoordinates: messages.address.noCoordinates,
  };

  async function handlePhotoMetaFile(file: File | undefined) {
    if (!file) return;
    setPhotoMetaStatus("");
    setReadingPhotoMeta(true);
    try {
      const result = await defaultPhotoExifReader.read(file);
      if (result.status === "ok" && result.metadata.gps) {
        setPendingGps(result.metadata.gps);
        return;
      }
      if (result.status === "no_gps") {
        setPhotoMetaStatus(messages.address.photoMetaNoGps);
        return;
      }
      if (result.status === "unsupported") {
        setPhotoMetaStatus(messages.address.photoMetaUnsupported);
        return;
      }
      setPhotoMetaStatus(messages.address.photoMetaError);
    } catch {
      setPhotoMetaStatus(messages.address.photoMetaError);
    } finally {
      setReadingPhotoMeta(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function acceptGps() {
    if (!pendingGps) return;
    const gps = pendingGps;
    setPendingGps(null);
    try {
      await onApplyExifGps(gps);
      setPhotoMetaStatus(messages.address.photoMetaGpsApplied);
    } catch {
      setPhotoMetaStatus(messages.address.photoMetaError);
    }
  }

  function refuseGps() {
    setPendingGps(null);
    setPhotoMetaStatus(messages.address.photoMetaGpsRefused);
  }

  const busy = lookingUp || locating || applyingExifGps;
  const awaitingConfirm = pendingCandidate != null && !identified;

  return (
    <form
      className="setup-form space-y-4"
      aria-label={messages.setup.title}
      onSubmit={(event) => {
        event.preventDefault();
        if (awaitingConfirm && onAcceptPendingAddress && !busy) {
          onAcceptPendingAddress();
          return;
        }
        if (!identified && !awaitingConfirm && address.trim() && !busy) onConfirmAddress();
      }}
    >
      <div>
        <h2 className="text-[var(--font-size-lg)] font-extrabold tracking-tight text-[var(--color-text)]">
          {messages.setup.title}
        </h2>
        {messages.setup.subtitle ? (
          <p className="mt-[var(--space-2)] text-[var(--font-size-sm)] leading-[1.45] text-[var(--color-text-muted)]">
            {messages.setup.subtitle}
          </p>
        ) : null}
      </div>

      <div className="ui-card min-w-0">
        <div className="mb-[var(--space-3)] flex flex-wrap items-center justify-between gap-[var(--space-1)]">
          <label
            htmlFor="setup-address"
            className="text-[var(--font-size-xs)] font-bold tracking-widest text-[var(--color-text)]"
          >
            ADDRESS
          </label>
          <span className="text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
            {messages.address.hint}
          </span>
        </div>

        {identified ? (
          <div className="rounded-[18px] border border-[#BBF7D0] bg-[#F0FDF4] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-wide text-[#166534]">
                  {messages.address.confirmedLabel}
                </p>
                <p className="mt-1 text-[15px] font-extrabold leading-snug text-[#14532D]">
                  {address}
                </p>
              </div>
              <button
                type="button"
                className="ui-button ui-button--secondary shrink-0 min-h-10 px-3 text-[12px]"
                onClick={onReselectAddress}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {messages.address.changeAddress}
              </button>
            </div>
            {tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[#BBF7D0] bg-white px-3 py-1 text-[11px] font-medium text-[#166534]"
                  >
                    {tag}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1 rounded-full bg-[#166534] px-3 py-1 text-[11px] font-medium text-white">
                  <Check aria-hidden="true" className="h-3 w-3" /> {messages.address.identified}
                </span>
              </div>
            ) : null}
          </div>
        ) : awaitingConfirm && pendingCandidate ? (
          <AddressConfirmationCard
            candidate={pendingCandidate}
            copy={confirmationCopy}
            busy={busy}
            onConfirm={() => onAcceptPendingAddress?.()}
            onReject={() => onRejectPendingAddress?.()}
          />
        ) : (
          <>
            <div className="flex min-w-0 items-start gap-[var(--space-2)]">
              <AddressAutocomplete
                value={address}
                onChange={onAddressChange}
                onSelect={onConfirmSuggestion}
                disabled={busy}
                copy={autocompleteCopy}
                confirmed={identified}
              />
              <button
                type="button"
                onClick={onConfirmAddress}
                disabled={busy || !address.trim()}
                className="ui-button ui-button--primary shrink-0"
                aria-label={messages.address.confirmAddress}
                aria-busy={lookingUp}
              >
                {lookingUp ? (
                  <div
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  />
                ) : (
                  <Search aria-hidden="true" className="h-5 w-5" />
                )}
              </button>
            </div>
            <p className="mt-[var(--space-2)] text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
              {messages.address.selectToConfirm}
            </p>

            <div className="mt-[var(--space-3)] flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="ui-button ui-button--secondary w-full min-h-[var(--touch-target)]"
                disabled={busy}
                aria-busy={locating}
                onClick={onUseMyLocation}
              >
                <LocateFixed aria-hidden="true" className="h-4 w-4" />
                {locating ? messages.address.locating : messages.address.useMyLocation}
              </button>
            </div>
            {locationError ? (
              <p role="alert" className="mt-2 text-[12px] text-[#991B1B]">
                {locationError}
              </p>
            ) : null}
          </>
        )}

        {!identified && !awaitingConfirm ? (
          <div className="relative mt-[var(--space-4)] border-t border-[var(--color-border)] pt-[var(--space-4)]">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/jpg"
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 h-px w-px max-w-px overflow-hidden opacity-0"
              onChange={(event) => void handlePhotoMetaFile(event.target.files?.[0])}
            />
            <button
              type="button"
              className="ui-button ui-button--secondary w-full min-h-[var(--touch-target)]"
              disabled={readingPhotoMeta || busy}
              aria-busy={readingPhotoMeta || applyingExifGps}
              onClick={() => photoInputRef.current?.click()}
            >
              <ImagePlus aria-hidden="true" className="h-4 w-4" />
              {messages.address.photoMetaImport}
            </button>
            <p className="mt-[var(--space-2)] text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
              {messages.address.photoMetaHint}
            </p>
            {readingPhotoMeta || applyingExifGps ? (
              <p
                role="status"
                className="mt-[var(--space-2)] text-[var(--font-size-xs)] text-[var(--color-text-muted)]"
              >
                {applyingExifGps ? messages.address.lookingUp : messages.address.photoMetaReading}
              </p>
            ) : null}
            {photoMetaStatus ? (
              <p
                role="status"
                className="mt-[var(--space-2)] text-[var(--font-size-xs)] text-[var(--color-text-muted)]"
              >
                {photoMetaStatus}
              </p>
            ) : null}
          </div>
        ) : null}

        {lookingUp ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-[var(--space-3)] flex items-center gap-[var(--space-2)] text-[var(--font-size-xs)] text-[var(--color-text-muted)]"
          >
            <Zap aria-hidden="true" className="h-4 w-4 animate-pulse" />{" "}
            {messages.address.lookingUp}
          </div>
        ) : null}
        {lookupError && syncMessage ? (
          <p
            role="alert"
            className="mt-[var(--space-3)] text-[var(--font-size-xs)] text-[var(--color-danger)]"
          >
            {syncMessage}
          </p>
        ) : null}
        {identified && Boolean(openData?.zoningCode) ? (
          <div className="mt-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-info-border)] bg-[var(--color-info-bg)] p-[var(--space-3)] text-[var(--font-size-xs)] leading-[1.45] text-[var(--color-info)]">
            {messages.address.openDataPrefix}
            {String(openData?.city || "")}
            {" · "}
            Zoning {openData?.zoningCode}
            {openData?.zoningLabel ? `（${openData.zoningLabel}）` : ""}
            {openData?.pid ? ` · PID ${openData.pid}` : ""}
          </div>
        ) : null}
        {!lookupError && syncMessage ? (
          <p
            role="status"
            className="mt-[var(--space-3)] text-[var(--font-size-xs)] text-[var(--color-text-muted)]"
          >
            {syncMessage}
          </p>
        ) : null}
      </div>

      <PropertyBasicsCard
        copy={messages.propertyBasics}
        status={propertyBasicsStatus}
        basics={propertyBasics}
        onRetry={onRetryPropertyBasics}
      />

      <div className="space-y-2">
        <button
          type="button"
          className="ui-button ui-button--primary w-full min-h-14 text-[15px] font-bold"
          disabled={!identified || busy || startingViewing}
          aria-busy={startingViewing || undefined}
          onClick={onStartViewing}
        >
          {startingViewing ? messages.address.lookingUp : messages.setup.startViewing}
        </button>
        <p className="text-center text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
          {identified
            ? messages.setup.startViewingHint
            : awaitingConfirm
              ? messages.address.pendingConfirmTitle
              : messages.address.selectToConfirm}
        </p>
      </div>

      <Dialog
        open={pendingGps != null}
        onClose={refuseGps}
        title={messages.address.photoMetaGpsPrivacyTitle}
        description={messages.address.photoMetaGpsPrivacyBody}
      >
        <div className="mt-[var(--space-4)] flex flex-col gap-[var(--space-2)] sm:flex-row sm:justify-end">
          <button type="button" className="ui-button ui-button--secondary" onClick={refuseGps}>
            {messages.address.photoMetaGpsRefuse}
          </button>
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={() => void acceptGps()}
          >
            {messages.address.photoMetaGpsAccept}
          </button>
        </div>
      </Dialog>
    </form>
  );
}
