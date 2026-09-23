// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepShare } from "./StepShare";

afterEach(cleanup);

const baseProps = {
  checklist: [
    { id: "address" as const, ok: true, required: true },
    { id: "fieldContent" as const, ok: true, required: true },
    { id: "authSync" as const, ok: false, required: false },
    { id: "syncOk" as const, ok: true, required: false },
  ],
  checklistLabels: {
    address: "Address confirmed",
    fieldContent: "Has field content",
    authSync: "Login / sync rules",
    syncOk: "Sync OK",
  },
  checklistTitle: "Ready to generate",
  progressLabel: "Progress",
  sessionUiStatus: null,
  syncMessage: "",
  syncLabels: {
    savedLocal: "Saved locally",
    pending: "Pending",
    syncing: "Syncing",
    synced: "Synced",
    failed: "Failed",
    conflict: "Conflict",
  },
  canGenerate: true,
  generateLabel: "Generate viewing card",
  generateHint: "Ready",
  stageLabels: {
    organize: "Organize notes",
    analyze: "Analyze audio & media",
    summary: "Build summary",
    build: "Create share card",
  },
  previewTitle: "Card preview",
  previewEmpty: "Preview appears after generate",
  previewOpenLabel: "Open card",
  shareAccessLabels: {
    title: "Share",
    statusLabel: "Status",
    statusActive: "Active",
    statusLocal: "Local",
    statusNone: "None",
    statusRevoked: "Revoked",
    statusExpired: "Expired",
    lastUpdated: "Updated",
    tokenOk: "Token ok",
    expiry: "Expiry",
    expirySave: "Save",
    password: "Password",
    passwordSave: "Set",
    passwordClear: "Clear",
    passwordPlaceholder: "Password",
    revoke: "Revoke",
    rotate: "Rotate",
    readOnly: "Read only",
    copyHint: "Copy",
    expiresAtLabel: "Expires",
    passwordOn: "On",
    passwordOff: "Off",
    confirmRevoke: "Confirm",
    busy: "Busy",
    errorGeneric: "Error",
    historyTitle: "History",
    historyEmpty: "Empty",
    historyRevokedAt: "Revoked at",
  },
  shareUrl: "",
  hasShareToken: false,
  shareLastUpdatedAt: null,
  viewingId: null,
  shareLink: null,
  onShareLinkChanged: vi.fn(),
};

describe("StepShare", () => {
  it("renders a single primary generate CTA and no share panel before token", () => {
    render(
      <StepShare
        {...baseProps}
        syncingCard={false}
        onGenerate={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /Generate viewing card/i })).toHaveLength(1);
    expect(screen.queryByText("Share")).not.toBeInTheDocument();
    expect(screen.getByText("Preview appears after generate")).toBeVisible();
  });

  it("disables generate and shows staged progress while generating", () => {
    render(
      <StepShare
        {...baseProps}
        syncingCard
        generateStage="analyze"
        onGenerate={vi.fn()}
      />,
    );

    const primary = screen.getByRole("button", { name: /Analyze audio/i });
    expect(primary).toBeDisabled();
    expect(screen.getByRole("list", { name: "Progress" })).toBeVisible();
    expect(screen.getAllByText("Organize notes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Analyze audio & media").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Build summary").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create share card").length).toBeGreaterThan(0);
  });

  it("keeps retry available after failure without opening share access", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(
      <StepShare
        {...baseProps}
        syncingCard={false}
        generateFailed
        generateFailedLabel="Generate failed — data kept"
        generateLabel="Retry generate"
        onGenerate={onGenerate}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Generate failed — data kept");
    await user.click(screen.getByRole("button", { name: "Retry generate" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Share")).not.toBeInTheDocument();
  });
});
