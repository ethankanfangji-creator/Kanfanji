// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Button, Field, PageContainer } from "./ui/primitives";

afterEach(cleanup);

describe("design tokens and UI primitives", () => {
  it("defines required spacing, radius, and z-index tokens in globals.css", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toContain("*,\n*::before,\n*::after {\n  box-sizing: border-box;");
    for (const token of [
      "--space-1: 4px",
      "--space-2: 8px",
      "--space-3: 12px",
      "--space-4: 16px",
      "--space-5: 20px",
      "--space-6: 24px",
      "--space-8: 32px",
      "--radius-md: 12px",
      "--radius-lg: 16px",
      "--z-dropdown: 100",
      "--z-sticky: 200",
      "--z-modal: 1000",
      "--z-toast: 1100",
      "--touch-target: 44px",
      "--touch-target-comfortable: 48px",
      "--mobile-nav-content-height: 56px",
      "--page-max-width: 960px",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain(".answer-method-sheet-backdrop");
    expect(css).toContain("env(safe-area-inset-bottom");
    expect(css).toContain("--mobile-nav-safe-bottom");
    expect(css).toContain("--mobile-nav-offset");
    expect(css).toContain("backdrop-filter: blur(8px)");
    expect(css).toContain(".setup-form-grid");
    expect(css).toContain("repeat(2, minmax(0, 1fr))");
    expect(css).toContain(".page-container");
    expect(css).toContain(".ui-button");
    expect(css).toContain(".ui-input");
  });

  it("wires button and field primitives to shared interaction classes", () => {
    render(
      <>
        <Button>Save</Button>
        <Field label="Email" defaultValue="" error="Required" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass(
      "ui-button",
      "ui-button--primary",
    );
    expect(screen.getByLabelText("Email")).toHaveClass("ui-input", "is-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("exposes a unified page container utility", () => {
    render(
      <PageContainer narrow data-testid="page">
        content
      </PageContainer>,
    );
    expect(screen.getByTestId("page")).toHaveClass(
      "page-container",
      "page-container--narrow",
    );
  });
});
