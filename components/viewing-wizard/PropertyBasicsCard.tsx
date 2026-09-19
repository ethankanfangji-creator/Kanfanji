"use client";

import { Loader2, RefreshCw } from "lucide-react";
import type {
  PropertyBasicsField,
  PropertyBasicsSnapshot,
} from "@/lib/property-basics/types";

export type PropertyBasicsCopy = {
  title: string;
  loading: string;
  retry: string;
  failed: string;
  unknown: string;
  sources: string;
  fields: {
    displayName: string;
    propertyType: string;
    layout: string;
    area: string;
    price: string;
    managementFee: string;
    yearBuilt: string;
    summary: string;
  };
  confidence: {
    verified: string;
    inferred: string;
    unknown: string;
  };
};

function FieldRow({
  label,
  field,
  unknownLabel,
  confidenceLabels,
}: {
  label: string;
  field: PropertyBasicsField;
  unknownLabel: string;
  confidenceLabels: PropertyBasicsCopy["confidence"];
}) {
  const display =
    field.confidence === "unknown" || !field.value ? unknownLabel : field.value;
  return (
    <div className="min-w-0 rounded-xl border border-black/5 bg-[#FAF7F3] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold tracking-wide text-[#6B7280]">{label}</p>
        <span className="text-[10px] font-medium text-[#9CA3AF]">
          {confidenceLabels[field.confidence]}
        </span>
      </div>
      <p className="mt-1 text-[13px] font-semibold leading-snug text-[#1A1A1A]">{display}</p>
      {field.note && field.confidence === "unknown" ? (
        <p className="mt-1 text-[11px] leading-snug text-[#9CA3AF]">{field.note}</p>
      ) : null}
    </div>
  );
}

export function PropertyBasicsCard({
  copy,
  status,
  basics,
  onRetry,
}: {
  copy: PropertyBasicsCopy;
  status: "idle" | "loading" | "ready" | "error";
  basics: PropertyBasicsSnapshot | null;
  onRetry: () => void;
}) {
  if (status === "idle") return null;

  return (
    <section
      aria-labelledby="property-basics-heading"
      className="ui-card min-w-0"
      aria-busy={status === "loading" || undefined}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          id="property-basics-heading"
          className="text-[var(--font-size-sm)] font-extrabold tracking-tight text-[var(--color-text)]"
        >
          {copy.title}
        </h3>
        {status === "error" ? (
          <button
            type="button"
            className="ui-button ui-button--secondary min-h-10 px-3 text-[12px]"
            onClick={onRetry}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {copy.retry}
          </button>
        ) : null}
      </div>

      {status === "loading" ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-[12px] text-[#6B7280]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {copy.loading}
          </p>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-14 animate-pulse rounded-xl bg-[#F0EBE4]"
              aria-hidden
            />
          ))}
        </div>
      ) : null}

      {status === "error" ? (
        <p role="alert" className="text-[13px] font-medium text-[#991B1B]">
          {copy.failed}
        </p>
      ) : null}

      {status === "ready" && basics ? (
        <div className="space-y-3">
          {basics.needsAddressConfirmation ? (
            <p role="status" className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-[13px] text-[#92400E]">
              {basics.message}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <FieldRow
                  label={copy.fields.displayName}
                  field={basics.displayName}
                  unknownLabel={copy.unknown}
                  confidenceLabels={copy.confidence}
                />
                <FieldRow
                  label={copy.fields.propertyType}
                  field={basics.propertyType}
                  unknownLabel={copy.unknown}
                  confidenceLabels={copy.confidence}
                />
                <FieldRow
                  label={copy.fields.layout}
                  field={basics.layout}
                  unknownLabel={copy.unknown}
                  confidenceLabels={copy.confidence}
                />
                <FieldRow
                  label={copy.fields.area}
                  field={basics.area}
                  unknownLabel={copy.unknown}
                  confidenceLabels={copy.confidence}
                />
                <FieldRow
                  label={copy.fields.price}
                  field={basics.price}
                  unknownLabel={copy.unknown}
                  confidenceLabels={copy.confidence}
                />
                <FieldRow
                  label={copy.fields.managementFee}
                  field={basics.managementFee}
                  unknownLabel={copy.unknown}
                  confidenceLabels={copy.confidence}
                />
                <FieldRow
                  label={copy.fields.yearBuilt}
                  field={basics.yearBuilt}
                  unknownLabel={copy.unknown}
                  confidenceLabels={copy.confidence}
                />
              </div>
              <FieldRow
                label={copy.fields.summary}
                field={basics.summary}
                unknownLabel={copy.unknown}
                confidenceLabels={copy.confidence}
              />
              {basics.sources.length > 0 ? (
                <p className="text-[11px] leading-snug text-[#6B7280]">
                  {copy.sources}: {basics.sources.join(" · ")}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
