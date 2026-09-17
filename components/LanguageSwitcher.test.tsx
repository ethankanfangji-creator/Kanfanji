// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "./I18nProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = "";
});

describe("LanguageSwitcher", () => {
  it("keeps the document language in sync", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <LanguageSwitcher />
      </I18nProvider>,
    );

    await user.selectOptions(screen.getByRole("combobox"), "en");
    expect(document.documentElement.lang).toBe("en");
  });
});
