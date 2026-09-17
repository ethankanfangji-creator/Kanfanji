/**
 * Photo → address helpers.
 * Today we only support optional EXIF GPS metadata import.
 * OCR / vision address recognition is intentionally unimplemented —
 * call sites must use PhotoAddressRecognizer and must not hardcode results.
 */

export type GpsCoordinates = {
  lat: number;
  lng: number;
  altitudeMeters?: number | null;
};

export type PhotoExifMetadata = {
  source: "exif";
  gps: GpsCoordinates | null;
  capturedAt?: string | null;
};

export type PhotoExifReadResult =
  | { status: "ok"; metadata: PhotoExifMetadata }
  | { status: "no_gps"; metadata: PhotoExifMetadata }
  | { status: "unsupported"; reason: "format" | "parse" }
  | { status: "error"; message: string };

export interface PhotoExifReader {
  read(file: Blob): Promise<PhotoExifReadResult>;
}

/** Request for future OCR / image-recognition address extraction. */
export type PhotoAddressRecognitionRequest = {
  image: Blob;
  mimeType: string;
};

export type PhotoAddressRecognitionResult =
  | { status: "unavailable"; reason: "not_implemented" }
  | {
      status: "ok";
      candidates: Array<{ text: string; confidence?: number }>;
    }
  | { status: "error"; message: string };

/**
 * Interface for OCR / vision address recognition.
 * Do not invent frontend results — implement behind this contract when ready.
 */
export interface PhotoAddressRecognizer {
  recognize(
    request: PhotoAddressRecognitionRequest,
  ): Promise<PhotoAddressRecognitionResult>;
}

export class UnavailablePhotoAddressRecognizer implements PhotoAddressRecognizer {
  async recognize(
    request: PhotoAddressRecognitionRequest,
  ): Promise<PhotoAddressRecognitionResult> {
    void request;
    return { status: "unavailable", reason: "not_implemented" };
  }
}
