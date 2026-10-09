// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { BrowsePageHeader } from "./BrowsePageHeader";

afterEach(() => cleanup());

describe("BrowsePageHeader", () => {
  it("renders brand eyebrow, page title, subtitle, and back link", () => {
    render(
      <BrowsePageHeader
        backLabel="Home"
        title="Viewings"
        subtitle="Your open houses"
        actions={<button type="button">Account</button>}
      />,
    );
    expect(screen.getByText("KANFANGJI")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Viewings" })).toBeInTheDocument();
    expect(screen.getByText("Your open houses")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Home/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
  });

  it("renders compact chat header without default eyebrow", () => {
    render(
      <BrowsePageHeader
        compact
        eyebrow={null}
        backLabel="Home"
        title="Ask"
        subtitle="Session title"
      />,
    );
    expect(screen.queryByText("KANFANGJI")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask" })).toBeInTheDocument();
    expect(screen.getByText("Session title")).toBeInTheDocument();
  });
});
