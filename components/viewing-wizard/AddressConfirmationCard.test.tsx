// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddressConfirmationCard } from "./AddressConfirmationCard";
import type { AddressConfirmationCandidate } from "@/lib/address-confirmation";

afterEach(() => {
  cleanup();
});

const candidate: AddressConfirmationCandidate = {
  displayAddress: "1200 Westwood Street, Coquitlam, BC",
  propertyId: "prop-abc-123",
  lat: 49.28,
  lng: -122.79,
  market: "CA",
  source: "bc-geocoder",
  tags: ["Coquitlam"],
  mapEmbedUrl: "https://www.openstreetmap.org/export/embed.html?marker=1",
  openMapUrl: "https://www.openstreetmap.org/?mlat=49.28",
  adminDistrictMismatch: false,
};

const copy = {
  pendingTitle: "Confirm this normalized address",
  confirmUse: "Use this address",
  rejectResearch: "Wrong — search again",
  propertyIdLabel: "Property ID",
  coordinatesLabel: "Coordinates",
  openMap: "Open map",
  noCoordinates: "Not available",
  adminMismatchWarning: "City/county mismatch — check carefully",
};

describe("AddressConfirmationCard", () => {
  it("shows normalized address, property id, and coords before bind", () => {
    render(
      <AddressConfirmationCard
        candidate={candidate}
        copy={copy}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText(candidate.displayAddress)).toBeTruthy();
    expect(screen.getByText("prop-abc-123")).toBeTruthy();
    expect(screen.getByText(/49\.28000/)).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.confirmUse })).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.rejectResearch })).toBeTruthy();
  });

  it("calls confirm / reject handlers", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onReject = vi.fn();
    render(
      <AddressConfirmationCard
        candidate={candidate}
        copy={copy}
        onConfirm={onConfirm}
        onReject={onReject}
      />,
    );

    await user.click(screen.getByRole("button", { name: copy.confirmUse }));
    await user.click(screen.getByRole("button", { name: copy.rejectResearch }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("shows a prominent alert when admin districts conflict", () => {
    render(
      <AddressConfirmationCard
        candidate={{
          ...candidate,
          displayAddress: "新北市新莊區福祿1號公園",
          market: "TW",
          adminDistrictMismatch: true,
        }}
        copy={copy}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(copy.adminMismatchWarning)).toBeTruthy();
  });
});
