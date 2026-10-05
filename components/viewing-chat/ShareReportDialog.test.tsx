// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareReportDialog } from "./ShareReportDialog";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const labels = {
  title: "Share this report",
  copied: "Link copied to clipboard",
  copyFailed: "Copy failed",
  hubGuide: "Manage links in Shared reports.",
  hubCta: "Open Shared reports",
  close: "Done",
  preparing: "Preparing…",
};

afterEach(() => cleanup());

describe("ShareReportDialog", () => {
  it("shows copied state and hub CTA without management actions", () => {
    render(
      <ShareReportDialog
        open
        url="https://example.com/s/abc"
        copied
        busy={false}
        error={null}
        labels={labels}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Link copied to clipboard")).toBeTruthy();
    expect(screen.getByText("https://example.com/s/abc")).toBeTruthy();
    expect(screen.getByText("Manage links in Shared reports.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Shared reports" })).toHaveAttribute(
      "href",
      "/shares",
    );
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });
});
