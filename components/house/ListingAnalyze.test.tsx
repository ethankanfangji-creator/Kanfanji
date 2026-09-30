// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListingAnalyze } from "./ListingAnalyze";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ListingAnalyze", () => {
  it("shows extracted fields after a link analysis succeeds", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        propertyId: "property-1",
        listing: {
          address: "88 Main St",
          price: "$900,000",
          beds: 3,
          baths: 2,
          sqft: 1200,
          year: 1998,
          strata: "$420",
          type: "condo",
          photos: ["https://cdn.example/a.jpg"],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ListingAnalyze viewingId="11111111-1111-4111-8111-111111111111" initial={null} />);

    await user.type(screen.getByLabelText("房源連結"), "https://listings.example/88");
    await user.click(screen.getByRole("button", { name: "分析" }));

    expect(await screen.findByText("88 Main St")).toBeInTheDocument();
    expect(screen.getByText("$900,000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "照片" })).toHaveAttribute("href", "https://cdn.example/a.jpg");
    const body = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(body.body).toBeInstanceOf(FormData);
    expect((body.body as FormData).get("listing_url")).toBe("https://listings.example/88");
  });

  it("does not call the API when both a link and a file are set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ListingAnalyze viewingId="11111111-1111-4111-8111-111111111111" initial={null} />);
    await user.type(screen.getByLabelText("房源連結"), "https://listings.example/88");
    const file = new File(["%PDF"], "listing.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("PDF 或照片"), file);
    await user.click(screen.getByRole("button", { name: "分析" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("請只貼連結，或只上傳一個 PDF／照片。")).toBeInTheDocument();
  });
});
