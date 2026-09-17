"use client";

import { Check, MapPin, Search, Zap } from "lucide-react";

export type StepSetupMessages = {
  address: {
    placeholder: string;
    hint: string;
    lookingUp: string;
    identified: string;
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
      className="space-y-4"
      aria-label={messages.setup.title}
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
          <label
            htmlFor="setup-address"
            className="text-[12px] font-[700] tracking-widest"
          >
            ADDRESS
          </label>
          <span className="text-[10px] text-[#9CA3AF]">{messages.address.hint}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 relative">
            <MapPin
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]"
            />
            <input
              id="setup-address"
              required
              value={address}
              onChange={(event) => onAddressChange(event.target.value)}
              placeholder={messages.address.placeholder}
              autoComplete="street-address"
              maxLength={200}
              className="w-full h-[48px] pl-9 pr-3 rounded-full bg-[#F8F4EF] border border-black/5 text-[16px] sm:text-[14px] font-medium outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>
          <button
            type="button"
            onClick={onLookup}
            disabled={lookingUp}
            className="w-[48px] h-[48px] rounded-full bg-black text-white flex items-center justify-center shrink-0 active:scale-95 transition disabled:opacity-60"
            aria-label="Lookup address"
          >
            {lookingUp ? (
              <div
                aria-hidden="true"
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
              />
            ) : (
              <Search aria-hidden="true" className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[#9CA3AF]">{messages.setup.lookupOptional}</p>
        {lookingUp && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-[#6B7280] animate-pulse">
            <Zap aria-hidden="true" className="w-4 h-4" /> {messages.address.lookingUp}
          </div>
        )}
        {lookupError && syncMessage ? (
          <p className="mt-3 text-[12px] text-[#991B1B]">{syncMessage}</p>
        ) : null}
        {identified && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1.5 rounded-full bg-[#F3F0EB] text-[12px] font-medium border border-black/5"
              >
                {tag}
              </span>
            ))}
            <span className="px-3 py-1.5 rounded-full bg-[#E8F5E9] text-[12px] font-medium text-[#2E7D32] flex items-center gap-1">
              <Check aria-hidden="true" className="w-3 h-3" /> {messages.address.identified}
            </span>
          </div>
        )}
        {identified && Boolean(openData?.zoningCode) && (
          <div className="mt-3 rounded-xl bg-[#EEF2FF] border border-[#C7D2FE] p-3 text-[11px] text-[#3730A3] leading-[1.45]">
            {messages.address.openDataPrefix}
            {String(openData?.city || "")}
            {" · "}
            Zoning {openData?.zoningCode}
            {openData?.zoningLabel ? `（${openData.zoningLabel}）` : ""}
            {openData?.pid ? ` · PID ${openData.pid}` : ""}
          </div>
        )}
        {!lookupError && syncMessage ? (
          <p className="mt-3 text-[11px] text-[#6B7280]">{syncMessage}</p>
        ) : null}
      </div>

      <div className="bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 space-y-3">
        <p className="text-[12px] font-[800] tracking-widest">{messages.setup.title}</p>
        <label className="block">
          <span className="text-[12px] font-bold text-[#374151]">
            {messages.setup.viewingAt} <span aria-hidden="true">*</span>
          </span>
          <input
            type="datetime-local"
            required
            value={viewingAtLocal}
            onChange={(event) => onViewingAtChange(event.target.value)}
            className="mt-1.5 w-full h-[48px] px-4 rounded-2xl bg-[#F8F4EF] border border-black/5 text-[16px] sm:text-[14px] outline-none focus:ring-2 focus:ring-black/10"
          />
        </label>
        <label className="block">
          <span className="text-[12px] font-bold text-[#374151]">{messages.setup.unitLabel}</span>
          <input
            value={unitLabel}
            onChange={(event) => onUnitLabelChange(event.target.value)}
            autoComplete="off"
            maxLength={80}
            className="mt-1.5 w-full h-[48px] px-4 rounded-2xl bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
          />
        </label>
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          <label className="block">
            <span className="text-[12px] font-bold text-[#374151]">{messages.setup.priceLabel}</span>
            <input
              value={priceLabel}
              onChange={(event) => onPriceLabelChange(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              maxLength={40}
              className="mt-1.5 w-full h-[48px] px-3 rounded-2xl bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-bold text-[#374151]">{messages.setup.layoutLabel}</span>
            <input
              value={layoutLabel}
              onChange={(event) => onLayoutLabelChange(event.target.value)}
              autoComplete="off"
              maxLength={60}
              className="mt-1.5 w-full h-[48px] px-3 rounded-2xl bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          <label className="block">
            <span className="text-[12px] font-bold text-[#374151]">{messages.setup.areaLabel}</span>
            <input
              value={areaLabel}
              onChange={(event) => onAreaLabelChange(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              maxLength={40}
              className="mt-1.5 w-full h-[48px] px-3 rounded-2xl bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-bold text-[#374151]">
              {messages.setup.managementFeeLabel}
            </span>
            <input
              value={managementFeeLabel}
              onChange={(event) => onManagementFeeLabelChange(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              maxLength={40}
              className="mt-1.5 w-full h-[48px] px-3 rounded-2xl bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-[12px] font-bold text-[#374151]">{messages.setup.listingUrl}</span>
          <input
            type="url"
            value={listingUrl}
            onChange={(event) => onListingUrlChange(event.target.value)}
            inputMode="url"
            autoComplete="url"
            maxLength={2048}
            className="mt-1.5 w-full h-[48px] px-4 rounded-2xl bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
            placeholder="https://"
          />
        </label>
        <label className="block">
          <span className="text-[12px] font-bold text-[#374151]">{messages.setup.setupNotes}</span>
          <textarea
            value={setupNotes}
            onChange={(event) => onSetupNotesChange(event.target.value)}
            maxLength={2000}
            rows={3}
            className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/10 resize-none"
          />
        </label>
      </div>
    </form>
  );
}
