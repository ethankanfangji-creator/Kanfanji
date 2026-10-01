import { describe, expect, it } from "vitest";
import { collectListingPhotoUrls, parseListingExtract } from "./listing-fields";

describe("parseListingExtract", () => {
  it("keeps listing facts and drops unsafe photo urls", () => {
    const listing = parseListingExtract({
      address: "88 Main St",
      price: "$900,000",
      beds: "3",
      baths: 2,
      sqft: "1,200",
      year: 1998,
      strata: "$420",
      type: "condo",
      photos: ["https://cdn.example/a.jpg", "javascript:alert(1)", "not a url"],
    });
    expect(listing).toMatchObject({
      address: "88 Main St",
      price: "$900,000",
      beds: 3,
      baths: 2,
      sqft: 1200,
      year: 1998,
      strata: "$420",
      type: "condo",
    });
    expect(listing.photos).toEqual(["https://cdn.example/a.jpg"]);
  });

  it("does not accept a year that is not a build year", () => {
    expect(parseListingExtract({ year: 12 }).year).toBeNull();
  });
});

describe("collectListingPhotoUrls", () => {
  it("collects absolute and page-relative image urls from any host", () => {
    const html = `
      <meta property="og:image" content="https://photos.example/cover.jpg" />
      <img src="/gallery/1.jpg" />
      <img src="data:image/gif;base64,abc" />
    `;
    expect(collectListingPhotoUrls(html, "https://listings.example/88")).toEqual([
      "https://photos.example/cover.jpg",
      "https://listings.example/gallery/1.jpg",
    ]);
  });
});
