// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/lib/share-or-copy", () => ({
  canNativeShareUrl: () => false,
}));

const labels = {
  title: "Share this report",
  copied: "Link copied to clipboard",
  shared: "Opened system share",
  copy: "Copy link",
  share: "Share",
  copyFailed: "Copy failed",
  hubGuide: "Manage links in Shared reports.",
  hubCta: "Open Shared reports",
  close: "Done",
  preparing: "Preparing…",
};

afterEach(() => cleanup());

describe("ShareReportDialog", () => {
  it("shows url with copy icon, X close, and hub CTA without management actions", () => {
    const onCopy = vi.fn();
    const onClose = vi.fn();
    render(
      <ShareReportDialog
        open
        url="https://example.com/s/abc"
        feedback={null}
        busy={false}
        error={null}
        labels={labels}
        onClose={onClose}
        onCopy={onCopy}
      />,
    );
    expect(screen.getByText("https://example.com/s/abc")).toBeTruthy();
    expect(screen.queryByText("Link copied to clipboard")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(onCopy).toHaveBeenCalledOnce();
    expect(screen.getByText("Manage links in Shared reports.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Shared reports" })).toHaveAttribute(
      "href",
      "/shares",
    );
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });

  it("shows copied feedback after copy", () => {
    render(
      <ShareReportDialog
        open
        url="https://example.com/s/abc"
        feedback="copied"
        busy={false}
        error={null}
        labels={labels}
        onClose={vi.fn()}
        onCopy={vi.fn()}
      />,
    );
    expect(screen.getByText("Link copied to clipboard")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Link copied to clipboard" })).toBeTruthy();
  });

  it("creates a general link without a recipient field", () => {
    const onCreate = vi.fn();
    render(
      <ShareReportDialog
        open
        url={null}
        feedback={null}
        busy={false}
        error={null}
        labels={{
          ...labels,
          create: "Create link",
        }}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onCreate={onCreate}
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
