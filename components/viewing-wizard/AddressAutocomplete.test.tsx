// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddressAutocomplete } from "./AddressAutocomplete";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AddressAutocomplete", () => {
  it("supports keyboard navigation and Enter to select", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          suggestions: [
            {
              id: "1",
              label: "1200 Westwood St, Coquitlam, BC",
              secondary: "Coquitlam, BC",
              source: "bc_geocoder",
            },
            {
              id: "2",
              label: "1201 Westwood St, Coquitlam, BC",
              secondary: "Coquitlam, BC",
              source: "bc_geocoder",
            },
          ],
        }),
      ),
    );

    render(
      <AddressAutocomplete
        value="1200 West"
        onChange={vi.fn()}
        onSelect={onSelect}
        copy={{
          placeholder: "Address",
          loading: "Loading",
          empty: "Empty",
          error: "Error",
          listLabel: "Suggestions",
        }}
      />,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "2", label: expect.stringContaining("1201") }),
    );
  });

  it("shows an honest error when suggest API fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "fail" }), { status: 502 })),
    );

    render(
      <AddressAutocomplete
        value="1200 West"
        onChange={vi.fn()}
        onSelect={vi.fn()}
        copy={{
          placeholder: "Address",
          loading: "Loading",
          empty: "Empty",
          error: "Suggest failed",
          listLabel: "Suggestions",
        }}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByText("Suggest failed")).toBeTruthy();
    });
  });
});
