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
      1,
      "OTHER",
    );
  });

  it("hides the search button while suggestion results are open", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          suggestions: [
            {
              id: "1",
              label: "1200 Westwood St, Coquitlam, BC",
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
        onSelect={vi.fn()}
        copy={{
          placeholder: "Address",
          loading: "Loading",
          empty: "Empty",
          error: "Error",
          listLabel: "Suggestions",
          search: "Search address",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Search address" })).toBeTruthy();
    await user.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "Search address" })).toBeNull();
  });

  it("keeps previous suggestions visible while a refined query loads", async () => {
    const user = userEvent.setup();
    let resolveSecond!: (value: Response) => void;
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          suggestions: [
            {
              id: "1",
              label: "1200 Westwood St, Coquitlam, BC",
              source: "bc_geocoder",
            },
          ],
        }),
      )
      .mockImplementationOnce(() => secondResponse);
    vi.stubGlobal("fetch", fetchMock);

    const onChange = vi.fn();
    const { rerender } = render(
      <AddressAutocomplete
        value="1200 West"
        onChange={onChange}
        onSelect={vi.fn()}
        copy={{
          placeholder: "Address",
          loading: "Loading",
          empty: "Empty",
          error: "Error",
          listLabel: "Suggestions",
        }}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByText("1200 Westwood St, Coquitlam, BC")).toBeTruthy();
    });

    rerender(
      <AddressAutocomplete
        value="1200 Westwood"
        onChange={onChange}
        onSelect={vi.fn()}
        copy={{
          placeholder: "Address",
          loading: "Loading",
          empty: "Empty",
          error: "Error",
          listLabel: "Suggestions",
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("1200 Westwood St, Coquitlam, BC")).toBeTruthy();
    expect(screen.getByText("Loading")).toBeTruthy();

    resolveSecond(
      Response.json({
        suggestions: [
          {
            id: "2",
            label: "1200 Westwood Street, Coquitlam, BC",
            source: "bc_geocoder",
          },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("1200 Westwood Street, Coquitlam, BC")).toBeTruthy();
    });
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

  it("commits free text via onCommit when search is pressed without a selection", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ suggestions: [] })),
    );

    render(
      <AddressAutocomplete
        value="Unit 5, 2143 Spring St, Port Moody"
        onChange={vi.fn()}
        onSelect={vi.fn()}
        onCommit={onCommit}
        copy={{
          placeholder: "Address",
          loading: "Loading",
          empty: "Empty",
          error: "Error",
          listLabel: "Suggestions",
          search: "Search address",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Search address" }));
    expect(onCommit).toHaveBeenCalledWith("Unit 5, 2143 Spring St, Port Moody");
  });
});
