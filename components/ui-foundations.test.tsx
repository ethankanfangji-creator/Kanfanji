// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncStatusBanner } from "./SyncStatusBanner";
import { StepSetup, type StepSetupMessages } from "./viewing-wizard/StepSetup";
import { WizardStepper } from "./viewing-wizard/WizardStepper";

afterEach(cleanup);

describe("UI accessibility foundations", () => {
  it("exposes the current wizard step and visible statuses", () => {
    render(
      <WizardStepper
        onSelect={vi.fn()}
        steps={[
          { step: 1, label: "設定", status: "completed" },
          { step: 2, label: "記錄", status: "active" },
          { step: 3, label: "完成", status: "empty" },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: /記錄.*目前步驟/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByText("已完成")).toBeVisible();
  });

  it("announces sync status politely", () => {
    render(
      <SyncStatusBanner
        status={{
          status: "syncing",
          labelKey: "syncing",
          errorMessage: null,
          canRetry: false,
        }}
        messages={{
          savedLocal: "Saved on this device",
          pending: "Pending",
          syncing: "Syncing",
          synced: "Synced",
          failed: "Failed",
          conflict: "Conflict",
          retry: "Retry",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveAttribute("aria-atomic", "true");
  });

  it("keeps Step 1 address-first with confirm and location actions", () => {
    render(
      <StepSetup
        messages={setupMessages}
        address=""
        onAddressChange={vi.fn()}
        lookingUp={false}
        onConfirmAddress={vi.fn()}
        onConfirmSuggestion={vi.fn()}
        onReselectAddress={vi.fn()}
        identified={false}
        tags={[]}
        propertyDraft={{}}
        syncMessage=""
        lookupError={false}
        onApplyExifGps={vi.fn(async () => undefined)}
        onUseMyLocation={vi.fn()}
        propertyBasicsStatus="idle"
        propertyBasics={null}
        onRetryPropertyBasics={vi.fn()}
        onStartViewing={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Create a new viewing" })).toBeVisible();
    expect(screen.getByText(/Start with the address/i)).toBeVisible();
    expect(screen.getByRole("combobox")).toBeRequired();
    expect(screen.getByRole("button", { name: /Confirm address/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /Use my location/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Start viewing$/i })).toBeDisabled();
    expect(screen.queryByLabelText(/Viewing time/i)).toBeNull();
  });
});

const setupMessages: StepSetupMessages = {
  address: {
    placeholder: "Address",
    hint: "Optional lookup",
    lookingUp: "Looking up",
    identified: "Identified",
    autofilledHint: "Auto-filled",
    openDataPrefix: "Open data: ",
    photoMetaImport: "Read EXIF from photo (optional)",
    photoMetaHint: "Reads embedded photo metadata only",
    photoMetaReading: "Reading photo metadata…",
    photoMetaNoGps: "No GPS metadata",
    photoMetaUnsupported: "Unsupported file",
    photoMetaError: "Metadata read failed",
    photoMetaGpsPrivacyTitle: "Use GPS from this photo?",
    photoMetaGpsPrivacyBody: "Coordinates only",
    photoMetaGpsAccept: "Use GPS",
    photoMetaGpsRefuse: "Refuse",
    photoMetaGpsRefused: "GPS refused",
    photoMetaGpsApplied: "Suggested from EXIF GPS",
    suggestLoading: "Searching…",
    suggestEmpty: "No matches",
    suggestError: "Search failed",
    suggestListLabel: "Suggestions",
    useMyLocation: "Use my location",
    locating: "Locating…",
    locationDenied: "Denied",
    locationUnavailable: "Unavailable",
    locationUnsupported: "Unsupported",
    locationFailed: "Failed",
    confirmAddress: "Confirm address",
    changeAddress: "Change address",
    confirmedLabel: "Confirmed address",
    selectToConfirm: "Pick a suggestion or confirm",
    pendingConfirmTitle: "Confirm this normalized address",
    confirmUseThisAddress: "Use this address",
    rejectResearch: "Wrong — search again",
    propertyIdLabel: "Property ID",
    coordinatesLabel: "Coordinates",
    openMap: "Open map",
    noCoordinates: "Not available",
    adminMismatchWarning: "City/county mismatch — check carefully",
  },
  setup: {
    title: "Create a new viewing",
    subtitle: "Start with the address. Other listing details can wait until you are on site.",
    lookupOptional: "Lookup is optional",
    startViewing: "Start viewing",
    startViewingHint: "Saves this viewing on this device",
  },
  propertyBasics: {
    title: "Property basics",
    loading: "Loading",
    retry: "Retry",
    failed: "Failed",
    unknown: "Unknown / to confirm",
    sources: "Sources",
    fields: {
      displayName: "Name",
      propertyType: "Type",
      layout: "Layout",
      area: "Area",
      price: "Price",
      managementFee: "Fee",
      yearBuilt: "Year",
      summary: "Summary",
    },
    confidence: {
      verified: "Verified",
      inferred: "Inferred",
      unknown: "Unknown",
    },
  },
};
