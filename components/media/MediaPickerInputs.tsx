"use client";

import { useEffect, type ChangeEventHandler, type RefObject } from "react";

export function MediaPickerInputs({
  photoCaptureRef,
  photoGalleryRef,
  videoCaptureRef,
  videoGalleryRef,
  onPhotos,
  onVideo,
  onCaptureCancel,
}: {
  photoCaptureRef: RefObject<HTMLInputElement | null>;
  photoGalleryRef: RefObject<HTMLInputElement | null>;
  videoCaptureRef: RefObject<HTMLInputElement | null>;
  videoGalleryRef: RefObject<HTMLInputElement | null>;
  onPhotos: ChangeEventHandler<HTMLInputElement>;
  onVideo: ChangeEventHandler<HTMLInputElement>;
  onCaptureCancel: () => void;
}) {
  useEffect(() => {
    const photo = photoCaptureRef.current;
    const video = videoCaptureRef.current;
    photo?.addEventListener("cancel", onCaptureCancel);
    video?.addEventListener("cancel", onCaptureCancel);
    return () => {
      photo?.removeEventListener("cancel", onCaptureCancel);
      video?.removeEventListener("cancel", onCaptureCancel);
    };
  }, [onCaptureCancel, photoCaptureRef, videoCaptureRef]);

  return (
    <>
      <input
        ref={photoCaptureRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPhotos}
      />
      <input
        ref={photoGalleryRef}
        data-testid="photo-gallery-input"
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPhotos}
      />
      <input
        ref={videoCaptureRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={onVideo}
      />
      <input
        ref={videoGalleryRef}
        data-testid="video-gallery-input"
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onVideo}
      />
    </>
  );
}
