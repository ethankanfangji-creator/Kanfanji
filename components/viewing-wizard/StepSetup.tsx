"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, MapPin, Search, Zap } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { defaultPhotoExifReader } from "@/lib/photo-metadata/exif-reader";
import type { GpsCoordinates } from "@/lib/photo-metadata/types";

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
  };
  setup: {
    title: string;
    viewingAt: string;
    unitLabel: string;
    priceLabel: string;
    layoutLabel: string;
    areaLabel: string;
    managementFeeLabel: string;
    listingUrl: string;
    setupNotes: string;
    lookupOptional: string;
  };
};

const fieldControlClassName =
  "mt-[var(--space-2)] w-full min-w-0 max-w-full min-h-[var(--touch-target)] box-border px-[var(--space-4)] rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] text-[16px] sm:text-[var(--font-size-sm)] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus)]/20";

export function StepSetup({
  messages,
  address,
  onAddressChange,
  lookingUp,
  onLookup,
  identified,
  tags,
  propertyDraft,
  syncMessage,
  lookupError,
  viewingAtLocal,
  onViewingAtChange,
  unitLabel,
  onUnitLabelChange,
  priceLabel,
  onPriceLabelChange,
  layoutLabel,
  onLayoutLabelChange,
  areaLabel,
  onAreaLabelChange,
  managementFeeLabel,
  onManagementFeeLabelChange,
  listingUrl,
  onListingUrlChange,
  setupNotes,
  onSetupNotesChange,
  onApplyExifGps,
  applyingExifGps = false,
}: {
  messages: StepSetupMessages;
  address: string;
  onAddressChange: (value: string) => void;
  lookingUp: boolean;
  onLookup: () => void;
  identified: boolean;
  tags: string[];
  propertyDraft: Record<string, unknown>;
  syncMessage: string;
  lookupError: boolean;
  viewingAtLocal: string;
  onViewingAtChange: (value: string) => void;
  unitLabel: string;
  onUnitLabelChange: (value: string) => void;
  priceLabel: string;
  onPriceLabelChange: (value: string) => void;
  layoutLabel: string;
  onLayoutLabelChange: (value: string) => void;
  areaLabel: string;
  onAreaLabelChange: (value: string) => void;
  managementFeeLabel: string;
  onManagementFeeLabelChange: (value: string) => void;
  listingUrl: string;
  onListingUrlChange: (value: string) => void;
  setupNotes: string;
  onSetupNotesChange: (value: string) => void;
  onApplyExifGps: (gps: GpsCoordinates) => Promise<void>;
  applyingExifGps?: boolean;
}) {
  const openData = propertyDraft.openData as
    | { zoningCode?: string; city?: string; zoningLabel?: string; pid?: string }
    | undefined;
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoMetaStatus, setPhotoMetaStatus] = useState<string>("");
  const [readingPhotoMeta, setReadingPhotoMeta] = useState(false);
  const [pendingGps, setPendingGps] = useState<GpsCoordinates | null>(null);

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

  return (
    <form
      className="setup-form"
      aria-label={messages.setup.title}
      onSubmit={(event) => event.preventDefault()}
    >
      <h2 className="text-[var(--font-size-lg)] font-extrabold tracking-tight text-[var(--color-text)]">
        {messages.setup.title}
      </h2>

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
        <div className="flex min-w-0 items-center gap-[var(--space-2)]">
          <div className="relative min-w-0 flex-1">
            <MapPin
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
            />
            <input
              id="setup-address"
              required
              value={address}
              onChange={(event) => onAddressChange(event.target.value)}
              placeholder={messages.address.placeholder}
              autoComplete="street-address"
              maxLength={200}
              className={`${fieldControlClassName} rounded-full pl-9 pr-3 font-medium`}
            />
          </div>
          <button
            type="button"
            onClick={onLookup}
            disabled={lookingUp || applyingExifGps}
            className="ui-button ui-button--primary shrink-0"
            aria-label="Lookup address"
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
          {messages.setup.lookupOptional}
        </p>

        <div className="mt-[var(--space-4)] border-t border-[var(--color-border)] pt-[var(--space-4)]">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/jpg"
            className="sr-only"
            onChange={(event) => void handlePhotoMetaFile(event.target.files?.[0])}
          />
          <button
            type="button"
            className="ui-button ui-button--secondary w-full min-h-[var(--touch-target)]"
            disabled={readingPhotoMeta || lookingUp || applyingExifGps}
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
            <p role="status" className="mt-[var(--space-2)] text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
              {applyingExifGps ? messages.address.lookingUp : messages.address.photoMetaReading}
            </p>
          ) : null}
          {photoMetaStatus ? (
            <p role="status" className="mt-[var(--space-2)] text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
              {photoMetaStatus}
            </p>
          ) : null}
        </div>

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
          <p role="alert" className="mt-[var(--space-3)] text-[var(--font-size-xs)] text-[var(--color-danger)]">
            {syncMessage}
          </p>
        ) : null}
        {identified ? (
          <div className="mt-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1.5 text-[var(--font-size-xs)] font-medium"
              >
                {tag}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-bg)] px-3 py-1.5 text-[var(--font-size-xs)] font-medium text-[var(--color-success)]">
              <Check aria-hidden="true" className="h-3 w-3" /> {messages.address.identified}
            </span>
          </div>
        ) : null}
        {identified ? (
          <p
            role="status"
            className="mt-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--font-size-xs)] leading-[1.45] text-[var(--color-info)]"
          >
            {messages.address.autofilledHint}
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
          <p role="status" className="mt-[var(--space-3)] text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
            {syncMessage}
          </p>
        ) : null}
      </div>

      <div className="ui-card min-w-0">
        <div className="setup-form-grid">
          <label className="setup-field setup-field--datetime">
            <span className="text-[var(--font-size-xs)] font-bold text-[var(--color-text)]">
              {messages.setup.viewingAt} <span aria-hidden="true">*</span>
            </span>
            <input
              type="datetime-local"
              required
              value={viewingAtLocal}
              onChange={(event) => onViewingAtChange(event.target.value)}
              className={fieldControlClassName}
            />
          </label>
          <label className="setup-field setup-field--full">
            <span className="text-[var(--font-size-xs)] font-bold text-[var(--color-text)]">
              {messages.setup.unitLabel}
            </span>
            <input
              value={unitLabel}
              onChange={(event) => onUnitLabelChange(event.target.value)}
              autoComplete="off"
              maxLength={80}
              className={fieldControlClassName}
            />
          </label>
          <label className="setup-field">
            <span className="text-[var(--font-size-xs)] font-bold text-[var(--color-text)]">
              {messages.setup.priceLabel}
            </span>
            <input
              value={priceLabel}
              onChange={(event) => onPriceLabelChange(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              maxLength={40}
              className={fieldControlClassName}
            />
          </label>
          <label className="setup-field">
            <span className="text-[var(--font-size-xs)] font-bold text-[var(--color-text)]">
              {messages.setup.layoutLabel}
            </span>
            <input
              value={layoutLabel}
              onChange={(event) => onLayoutLabelChange(event.target.value)}
              autoComplete="off"
              maxLength={60}
              className={fieldControlClassName}
            />
          </label>
          <label className="setup-field">
            <span className="text-[var(--font-size-xs)] font-bold text-[var(--color-text)]">
              {messages.setup.areaLabel}
            </span>
            <input
              value={areaLabel}
              onChange={(event) => onAreaLabelChange(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              maxLength={40}
              className={fieldControlClassName}
            />
          </label>
          <label className="setup-field">
            <span className="text-[var(--font-size-xs)] font-bold text-[var(--color-text)]">
              {messages.setup.managementFeeLabel}
            </span>
            <input
              value={managementFeeLabel}
              onChange={(event) => onManagementFeeLabelChange(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              maxLength={40}
              className={fieldControlClassName}
            />
          </label>
          <label className="setup-field setup-field--full">
            <span className="text-[var(--font-size-xs)] font-bold text-[var(--color-text)]">
              {messages.setup.listingUrl}
            </span>
            <input
              type="url"
              value={listingUrl}
              onChange={(event) => onListingUrlChange(event.target.value)}
              inputMode="url"
              autoComplete="url"
              maxLength={2048}
              className={fieldControlClassName}
              placeholder="https://"
            />
          </label>
          <label className="setup-field setup-field--full">
            <span className="text-[var(--font-size-xs)] font-bold text-[var(--color-text)]">
              {messages.setup.setupNotes}
            </span>
            <textarea
              value={setupNotes}
              onChange={(event) => onSetupNotesChange(event.target.value)}
              maxLength={2000}
              rows={3}
              className={`${fieldControlClassName} resize-none py-[var(--space-3)]`}
            />
          </label>
        </div>
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
