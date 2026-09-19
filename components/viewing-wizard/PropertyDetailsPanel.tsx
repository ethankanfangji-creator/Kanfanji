"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type PropertyDetailsMessages = {
  title: string;
  hint: string;
  viewingAt: string;
  unitLabel: string;
  priceLabel: string;
  layoutLabel: string;
  areaLabel: string;
  managementFeeLabel: string;
  listingUrl: string;
  setupNotes: string;
};

const fieldControlClassName =
  "mt-[var(--space-2)] w-full min-w-0 max-w-full min-h-[var(--touch-target)] box-border px-[var(--space-4)] rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] text-[16px] sm:text-[var(--font-size-sm)] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus)]/20";

export function PropertyDetailsPanel({
  messages,
  defaultOpen = false,
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
  messages: PropertyDetailsMessages;
  defaultOpen?: boolean;
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
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="ui-card min-w-0 mb-4" aria-labelledby="property-details-heading">
      <button
        type="button"
        className="flex w-full min-h-[var(--touch-target)] items-center justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <div className="min-w-0">
          <h3
            id="property-details-heading"
            className="text-[var(--font-size-sm)] font-extrabold tracking-tight text-[var(--color-text)]"
          >
            {messages.title}
          </h3>
          <p className="mt-1 text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
            {messages.hint}
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="setup-form-grid mt-[var(--space-4)] border-t border-[var(--color-border)] pt-[var(--space-4)]">
          <label className="setup-field setup-field--datetime">
            <span className="text-[var(--font-size-xs)] font-bold text-[var(--color-text)]">
              {messages.viewingAt}
            </span>
            <input
              type="datetime-local"
              value={viewingAtLocal}
              onChange={(event) => onViewingAtChange(event.target.value)}
              className={fieldControlClassName}
            />
          </label>
          <label className="setup-field setup-field--full">
            <span className="text-[var(--font-size-xs)] font-bold text-[var(--color-text)]">
              {messages.unitLabel}
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
              {messages.priceLabel}
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
              {messages.layoutLabel}
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
              {messages.areaLabel}
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
              {messages.managementFeeLabel}
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
              {messages.listingUrl}
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
              {messages.setupNotes}
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
      ) : null}
    </section>
  );
}
