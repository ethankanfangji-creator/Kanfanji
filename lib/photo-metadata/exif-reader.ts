import type { GpsCoordinates, PhotoExifMetadata, PhotoExifReadResult, PhotoExifReader } from "./types";

const JPEG_SOI = 0xffd8;
const MARKER_APP1 = 0xffe1;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

/**
 * Minimal JPEG EXIF GPS reader (no OCR / image recognition).
 * Unsupported formats return { status: "unsupported" }.
 */
export class JpegExifGpsReader implements PhotoExifReader {
  async read(file: Blob): Promise<PhotoExifReadResult> {
    const mime = (file.type || "").toLowerCase();
    if (mime && mime !== "image/jpeg" && mime !== "image/jpg") {
      return { status: "unsupported", reason: "format" };
    }

    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const metadata = parseJpegExif(buffer);
      if (!metadata) {
        return { status: "unsupported", reason: "parse" };
      }
      if (!metadata.gps) {
        return { status: "no_gps", metadata };
      }
      return { status: "ok", metadata };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "EXIF read failed",
      };
    }
  }
}

export function parseJpegExif(bytes: Uint8Array): PhotoExifMetadata | null {
  if (bytes.length < 4) return null;
  if (((bytes[0] << 8) | bytes[1]) !== JPEG_SOI) return null;

  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = (bytes[offset] << 8) | bytes[offset + 1];
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2 || offset + 2 + size > bytes.length) return null;

    if (marker === MARKER_APP1) {
      const payloadStart = offset + 4;
      const payload = bytes.subarray(payloadStart, offset + 2 + size);
      if (startsWith(payload, EXIF_HEADER)) {
        const tiff = payload.subarray(6);
        return parseExifTiff(tiff);
      }
    }

    // SOS / EOI — stop scanning headers
    if (marker === 0xffda || marker === 0xffd9) break;
    offset += 2 + size;
  }

  return null;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function parseExifTiff(tiff: Uint8Array): PhotoExifMetadata | null {
  if (tiff.length < 8) return null;
  const littleEndian = tiff[0] === 0x49 && tiff[1] === 0x49;
  const magic = readUint16(tiff, 2, littleEndian);
  if (magic !== 42) return null;

  const ifd0Offset = readUint32(tiff, 4, littleEndian);
  const ifd0 = readIfd(tiff, ifd0Offset, littleEndian);
  if (!ifd0) return null;

  const gpsOffset = ifd0.get(0x8825);
  let gps: GpsCoordinates | null = null;
  if (typeof gpsOffset === "number") {
    gps = readGpsIfd(tiff, gpsOffset, littleEndian);
  }

  const exifOffset = ifd0.get(0x8769);
  let capturedAt: string | null = null;
  if (typeof exifOffset === "number") {
    const exifIfd = readIfd(tiff, exifOffset, littleEndian);
    const datetime = exifIfd?.get(0x9003) ?? exifIfd?.get(0x0132);
    if (typeof datetime === "string") capturedAt = datetime;
  }

  return { source: "exif", gps, capturedAt };
}

function readGpsIfd(
  tiff: Uint8Array,
  offset: number,
  littleEndian: boolean,
): GpsCoordinates | null {
  const ifd = readIfd(tiff, offset, littleEndian);
  if (!ifd) return null;

  const latRef = typeof ifd.get(1) === "string" ? String(ifd.get(1)).toUpperCase() : "N";
  const lngRef = typeof ifd.get(3) === "string" ? String(ifd.get(3)).toUpperCase() : "E";
  const latRationals = ifd.get(2);
  const lngRationals = ifd.get(4);
  if (!Array.isArray(latRationals) || !Array.isArray(lngRationals)) return null;

  const lat = dmsToDecimal(latRationals as number[]);
  const lng = dmsToDecimal(lngRationals as number[]);
  if (lat == null || lng == null) return null;

  const signedLat = latRef.startsWith("S") ? -lat : lat;
  const signedLng = lngRef.startsWith("W") ? -lng : lng;
  if (
    !Number.isFinite(signedLat) ||
    !Number.isFinite(signedLng) ||
    signedLat < -90 ||
    signedLat > 90 ||
    signedLng < -180 ||
    signedLng > 180
  ) {
    return null;
  }

  return { lat: signedLat, lng: signedLng };
}

function dmsToDecimal(parts: number[]): number | null {
  if (parts.length < 3) return null;
  const [deg, min, sec] = parts;
  if (![deg, min, sec].every((n) => Number.isFinite(n))) return null;
  return deg + min / 60 + sec / 3600;
}

type IfdValue = number | string | number[];

function readIfd(
  tiff: Uint8Array,
  offset: number,
  littleEndian: boolean,
): Map<number, IfdValue> | null {
  if (offset < 0 || offset + 2 > tiff.length) return null;
  const entryCount = readUint16(tiff, offset, littleEndian);
  const map = new Map<number, IfdValue>();
  let cursor = offset + 2;

  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 12 > tiff.length) break;
    const tag = readUint16(tiff, cursor, littleEndian);
    const type = readUint16(tiff, cursor + 2, littleEndian);
    const count = readUint32(tiff, cursor + 4, littleEndian);
    const valueOffset = cursor + 8;
    const value = readTagValue(tiff, type, count, valueOffset, littleEndian);
    if (value !== undefined) map.set(tag, value);
    cursor += 12;
  }

  return map;
}

function readTagValue(
  tiff: Uint8Array,
  type: number,
  count: number,
  valueOffset: number,
  littleEndian: boolean,
): IfdValue | undefined {
  // BYTE / ASCII / SHORT / LONG / RATIONAL
  const typeSize = type === 1 || type === 2 ? 1 : type === 3 ? 2 : type === 4 ? 4 : type === 5 ? 8 : 0;
  if (!typeSize || count < 1) return undefined;

  const byteLength = typeSize * count;
  const inline = byteLength <= 4;
  const dataOffset = inline ? valueOffset : readUint32(tiff, valueOffset, littleEndian);
  if (dataOffset < 0 || dataOffset + byteLength > tiff.length) return undefined;

  if (type === 2) {
    const chars: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const code = tiff[dataOffset + i];
      if (code === 0) break;
      chars.push(code);
    }
    return String.fromCharCode(...chars);
  }

  if (type === 3 && count === 1) {
    return readUint16(tiff, dataOffset, littleEndian);
  }

  if (type === 4 && count === 1) {
    return readUint32(tiff, dataOffset, littleEndian);
  }

  if (type === 5) {
    const rationals: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const num = readUint32(tiff, dataOffset + i * 8, littleEndian);
      const den = readUint32(tiff, dataOffset + i * 8 + 4, littleEndian);
      rationals.push(den === 0 ? NaN : num / den);
    }
    return rationals;
  }

  if (type === 4 && count > 1) {
    const values: number[] = [];
    for (let i = 0; i < count; i += 1) {
      values.push(readUint32(tiff, dataOffset + i * 4, littleEndian));
    }
    return values;
  }

  return undefined;
}

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  const value = littleEndian
    ? bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    : (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3];
  return value >>> 0;
}

export const defaultPhotoExifReader: PhotoExifReader = new JpegExifGpsReader();
