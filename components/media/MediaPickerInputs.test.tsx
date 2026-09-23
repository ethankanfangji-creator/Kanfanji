// @vitest-environment jsdom

import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaPickerInputs } from "./MediaPickerInputs";

describe("MediaPickerInputs", () => {
  it("keeps gallery inputs separate and free of capture hints", () => {
    render(
      <MediaPickerInputs
        photoCaptureRef={createRef()}
        photoGalleryRef={createRef()}
        videoCaptureRef={createRef()}
        videoGalleryRef={createRef()}
        onPhotos={vi.fn()}
        onVideo={vi.fn()}
        onCaptureCancel={vi.fn()}
      />,
    );

    const photoGallery = screen.getByTestId("photo-gallery-input");
    const videoGallery = screen.getByTestId("video-gallery-input");
    expect(photoGallery.getAttribute("capture")).toBeNull();
    expect(videoGallery.getAttribute("capture")).toBeNull();
    expect(photoGallery.hasAttribute("multiple")).toBe(true);
  });
});
