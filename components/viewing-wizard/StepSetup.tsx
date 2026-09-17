"use client";

import { Check, MapPin, Search, Zap } from "lucide-react";

export type StepSetupMessages = {
  address: {
    placeholder: string;
    hint: string;
    lookingUp: string;
    identified: string;
    autofilledHint: string;
    openDataPrefix: string;
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
}) {
  const openData = propertyDraft.openData as
    | { zoningCode?: string; city?: string; zoningLabel?: string; pid?: string }
    | undefined;

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
            disabled={lookingUp}
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
    </form>
  );
}
