// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
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
    expect(screen.getByText("尚未開始")).toBeVisible();
  });

  it("announces sync status updates politely", () => {
    render(
      <SyncStatusBanner
        status={{
          status: "syncing",
          labelKey: "syncing",
          errorMessage: null,
          canRetry: false,
        }}
        messages={{
          savedLocal: "Saved",
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

  it("adds native constraints and narrow-screen form layout", async () => {
    const user = userEvent.setup();
    const onViewingAtChange = vi.fn();
    render(
      <StepSetup
        messages={setupMessages}
        address=""
        onAddressChange={vi.fn()}
        lookingUp={false}
        onLookup={vi.fn()}
        identified={false}
        tags={[]}
        propertyDraft={{}}
        syncMessage=""
        lookupError={false}
        viewingAtLocal=""
        onViewingAtChange={onViewingAtChange}
        unitLabel=""
        onUnitLabelChange={vi.fn()}
        priceLabel=""
        onPriceLabelChange={vi.fn()}
        layoutLabel=""
        onLayoutLabelChange={vi.fn()}
        areaLabel=""
        onAreaLabelChange={vi.fn()}
        managementFeeLabel=""
        onManagementFeeLabelChange={vi.fn()}
        listingUrl=""
        onListingUrlChange={vi.fn()}
        setupNotes=""
        onSetupNotesChange={vi.fn()}
      />,
    );

    const date = screen.getByLabelText(/Viewing time/);
    expect(date).toBeRequired();
    expect(screen.getByLabelText("ADDRESS")).toBeRequired();
    expect(screen.getByLabelText("ADDRESS")).toHaveAttribute("autocomplete", "street-address");
    expect(screen.getByLabelText("Price")).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByLabelText("Listing URL")).toHaveAttribute("maxlength", "2048");

    await user.type(screen.getByLabelText("Unit"), "12A");
    expect(screen.getByLabelText("Unit")).toHaveAttribute("maxlength", "80");
  });
});

const setupMessages: StepSetupMessages = {
  address: {
    placeholder: "Address",
    hint: "Optional lookup",
    lookingUp: "Looking up",
    identified: "Identified",
    openDataPrefix: "Open data: ",
  },
  setup: {
    title: "Setup",
    viewingAt: "Viewing time",
    unitLabel: "Unit",
    priceLabel: "Price",
    layoutLabel: "Layout",
    areaLabel: "Area",
    managementFeeLabel: "Management fee",
    listingUrl: "Listing URL",
    setupNotes: "Notes",
    lookupOptional: "Lookup is optional",
  },
};
