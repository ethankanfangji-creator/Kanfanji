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
  it("changes locale via select and syncs document lang", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <LanguageSwitcher />
      </I18nProvider>,
    );

    const select = screen.getByRole("combobox", { name: /語言|Language|语言|ภาษา/ });
    await user.selectOptions(select, "en");
    expect(document.documentElement.lang).toBe("en");
  });
});
