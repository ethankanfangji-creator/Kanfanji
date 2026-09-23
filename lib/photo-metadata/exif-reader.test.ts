import { describe, expect, it } from "vitest";
import { JpegExifGpsReader, parseJpegExif } from "./exif-reader";
import { UnavailablePhotoAddressRecognizer } from "./types";

function writeUint16(view: DataView, offset: number, value: number, le: boolean) {
  view.setUint16(offset, value, le);
}

function writeUint32(view: DataView, offset: number, value: number, le: boolean) {
  view.setUint32(offset, value, le);
}

/** Build a minimal JPEG with APP1 EXIF GPS (49.28N, 123.12W). */
function buildJpegWithGps(): Uint8Array {
  const le = true;
  // TIFF payload layout (after Exif\0\0):
  // 0: II*\0
  // 4: IFD0 offset = 8
  // 8: IFD0 count=1, entry GPSOffset -> 26, next=0
  // 26: GPS IFD count=4 (latRef, lat, lngRef, lng)
  const tiff = new ArrayBuffer(200);
  const view = new DataView(tiff);
  const bytes = new Uint8Array(tiff);

  bytes[0] = 0x49;
  bytes[1] = 0x49;
  writeUint16(view, 2, 42, le);
  writeUint32(view, 4, 8, le);

  // IFD0
  writeUint16(view, 8, 1, le);
  writeUint16(view, 10, 0x8825, le); // GPS IFD pointer
  writeUint16(view, 12, 4, le); // LONG
  writeUint32(view, 14, 1, le);
  writeUint32(view, 18, 26, le); // offset to GPS IFD
  writeUint32(view, 22, 0, le); // next IFD

  // GPS IFD at 26
  writeUint16(view, 26, 4, le);

  // tag 1 GPSLatitudeRef = "N"
  writeUint16(view, 28, 1, le);
  writeUint16(view, 30, 2, le); // ASCII
  writeUint32(view, 32, 2, le);
  bytes[36] = 0x4e; // N
  bytes[37] = 0;
  bytes[38] = 0;
  bytes[39] = 0;

  // tag 2 GPSLatitude -> rationals at 90
  writeUint16(view, 40, 2, le);
  writeUint16(view, 42, 5, le); // RATIONAL
  writeUint32(view, 44, 3, le);
  writeUint32(view, 48, 90, le);

  // tag 3 GPSLongitudeRef = "W"
  writeUint16(view, 52, 3, le);
  writeUint16(view, 54, 2, le);
  writeUint32(view, 56, 2, le);
  bytes[60] = 0x57; // W
  bytes[61] = 0;
  bytes[62] = 0;
  bytes[63] = 0;

  // tag 4 GPSLongitude -> rationals at 114
  writeUint16(view, 64, 4, le);
  writeUint16(view, 66, 5, le);
  writeUint32(view, 68, 3, le);
  writeUint32(view, 72, 114, le);

  writeUint32(view, 76, 0, le); // next IFD

  // lat 49/1, 16/1, 48/1 => 49.28
  writeUint32(view, 90, 49, le);
  writeUint32(view, 94, 1, le);
  writeUint32(view, 98, 16, le);
  writeUint32(view, 102, 1, le);
  writeUint32(view, 106, 48, le);
  writeUint32(view, 110, 1, le);

  // lng 123/1, 7/1, 12/1 => 123.12
  writeUint32(view, 114, 123, le);
  writeUint32(view, 118, 1, le);
  writeUint32(view, 122, 7, le);
  writeUint32(view, 126, 1, le);
  writeUint32(view, 130, 12, le);
  writeUint32(view, 134, 1, le);

  const tiffBytes = bytes.subarray(0, 140);
  const exifPayload = new Uint8Array(6 + tiffBytes.length);
  exifPayload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
  exifPayload.set(tiffBytes, 6);

  const app1Length = 2 + exifPayload.length; // includes length field itself
  const jpeg = new Uint8Array(2 + 2 + 2 + exifPayload.length + 2);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg[2] = 0xff;
  jpeg[3] = 0xe1;
  jpeg[4] = (app1Length >> 8) & 0xff;
  jpeg[5] = app1Length & 0xff;
  jpeg.set(exifPayload, 6);
  jpeg[6 + exifPayload.length] = 0xff;
  jpeg[7 + exifPayload.length] = 0xd9;
  return jpeg;
}

describe("JpegExifGpsReader", () => {
  it("extracts GPS from JPEG EXIF without claiming image recognition", async () => {
    const jpeg = buildJpegWithGps();
    const parsed = parseJpegExif(jpeg);
    expect(parsed?.source).toBe("exif");
    expect(parsed?.gps?.lat).toBeCloseTo(49.28, 5);
    expect(parsed?.gps?.lng).toBeCloseTo(-123.12, 5);

    const reader = new JpegExifGpsReader();
    const result = await reader.read(
      new Blob([Uint8Array.from(jpeg)], { type: "image/jpeg" }),
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.metadata.gps?.lat).toBeCloseTo(49.28, 5);
    }
  });

  it("marks non-JPEG as unsupported", async () => {
    const reader = new JpegExifGpsReader();
    const result = await reader.read(new Blob(["x"], { type: "image/png" }));
    expect(result).toEqual({ status: "unsupported", reason: "format" });
  });
});

describe("UnavailablePhotoAddressRecognizer", () => {
  it("does not invent OCR address results on the frontend", async () => {
    const recognizer = new UnavailablePhotoAddressRecognizer();
    await expect(
      recognizer.recognize({
        image: new Blob(["x"], { type: "image/jpeg" }),
        mimeType: "image/jpeg",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_implemented" });
  });
});
