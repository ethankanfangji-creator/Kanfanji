"use client";

import { formatCardImageDate } from "./project";
import type {
  CardImageDocumentLabels,
  CardImageModel,
  PreparedCardImagePhoto,
} from "./types";

export const CARD_IMAGE_WIDTH = 1080;
const PAD = 48;
const CONTENT_WIDTH = CARD_IMAGE_WIDTH - PAD * 2;
const INNER = 20;
const INNER_WIDTH = CONTENT_WIDTH - INNER * 2;
const JPEG_QUALITY = 0.88;

type FontSpec = {
  size: number;
  weight: number;
  lineHeight: number;
};

const titleFont: FontSpec = { size: 18, weight: 700, lineHeight: 26 };
const addressFont: FontSpec = { size: 36, weight: 800, lineHeight: 46 };
const bodyFont: FontSpec = { size: 22, weight: 400, lineHeight: 32 };
const sectionFont: FontSpec = { size: 24, weight: 700, lineHeight: 34 };
const labelFont: FontSpec = { size: 16, weight: 600, lineHeight: 22 };
const valueFont: FontSpec = { size: 22, weight: 700, lineHeight: 30 };
const mutedFont: FontSpec = { size: 18, weight: 400, lineHeight: 26 };
const ratingFont: FontSpec = { size: 40, weight: 800, lineHeight: 48 };

function fontString(spec: FontSpec): string {
  return `${spec.weight} ${spec.size}px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", "Hiragino Sans GB", sans-serif`;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: FontSpec,
): string[] {
  const content = text.trim() || " ";
  ctx.font = fontString(font);
  const lines: string[] = [];
  for (const paragraph of content.split(/\n+/)) {
    let current = "";
    for (const char of Array.from(paragraph)) {
      const next = current + char;
      if (!current || ctx.measureText(next).width <= maxWidth) {
        current = next;
      } else {
        lines.push(current);
        current = char;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [" "];
}

function blockHeight(lineCount: number, font: FontSpec): number {
  return lineCount * font.lineHeight;
}

function measureTextHeight(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: FontSpec,
): number {
  return blockHeight(wrapLines(ctx, text, maxWidth, font).length, font);
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: FontSpec,
  color: string,
): number {
  const lines = wrapLines(ctx, text, maxWidth, font);
  ctx.fillStyle = color;
  ctx.font = fontString(font);
  ctx.textBaseline = "top";
  for (let index = 0; index < lines.length; index += 1) {
    ctx.fillText(lines[index], x, y + index * font.lineHeight);
  }
  return blockHeight(lines.length, font);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function photoDrawSize(photo: PreparedCardImagePhoto): { width: number; height: number } {
  const width = INNER_WIDTH;
  const rawHeight = Math.max(1, Math.round((photo.height / photo.width) * width));
  return { width, height: Math.min(rawHeight, 720) };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    image.src = dataUrl;
  });
}

export async function renderCardImageJpeg(
  model: CardImageModel,
  labels: CardImageDocumentLabels,
  locale: string,
): Promise<Blob> {
  const measureCanvas = document.createElement("canvas");
  const measure = measureCanvas.getContext("2d");
  if (!measure) throw new Error("CANVAS_UNAVAILABLE");

  const { snapshot, photos } = model;
  const basics = [
    [labels.layout, snapshot.layoutLabel],
    [labels.price, snapshot.priceLabel],
    [labels.unit, snapshot.unitLabel],
    [labels.area, snapshot.areaLabel],
    [labels.managementFee, snapshot.managementFeeLabel],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  const listSections: Array<{
    title: string;
    items: Array<{ text: string }>;
    tone: "neutral" | "good" | "risk";
  }> = [
    { title: labels.pros, items: snapshot.pros, tone: "good" },
    { title: labels.risks, items: snapshot.risks, tone: "risk" },
    { title: labels.facts, items: snapshot.facts, tone: "neutral" },
    { title: labels.followUps, items: snapshot.followUps, tone: "neutral" },
    { title: labels.actionItems, items: snapshot.actionItems, tone: "neutral" },
  ];

  const sectionChrome = 16 + sectionFont.lineHeight + 12 + 16;
  const sectionGap = 16;

  const basicsContent =
    basics.length === 0 && !snapshot.listingUrl && !snapshot.setupNotes
      ? mutedFont.lineHeight
      : basics.reduce((sum, [, value]) => {
          return (
            sum +
            labelFont.lineHeight +
            4 +
            measureTextHeight(measure, value, INNER_WIDTH, valueFont) +
            14
          );
        }, 0) +
        (snapshot.listingUrl
          ? labelFont.lineHeight +
            4 +
            measureTextHeight(measure, snapshot.listingUrl, INNER_WIDTH, mutedFont) +
            14
          : 0) +
        (snapshot.setupNotes
          ? labelFont.lineHeight +
            4 +
            measureTextHeight(measure, snapshot.setupNotes, INNER_WIDTH, bodyFont) +
            14
          : 0);

  const ratingText =
    snapshot.overallRating == null
      ? labels.ratingEmpty
      : `${"★".repeat(snapshot.overallRating)}${"☆".repeat(5 - snapshot.overallRating)}  ${snapshot.overallRating}/5`;
  const ratingContent =
    snapshot.overallRating == null ? mutedFont.lineHeight : ratingFont.lineHeight;

  const listContentHeights = listSections.map((section) => {
    if (section.items.length === 0) return mutedFont.lineHeight;
    return section.items.reduce((sum, item) => {
      return (
        sum +
        measureTextHeight(measure, `• ${item.text}`, INNER_WIDTH, bodyFont) +
        10
      );
    }, 0);
  });

  const photosContent =
    photos.length === 0
      ? mutedFont.lineHeight
      : photos.reduce((sum, photo) => {
          let next = sum + photoDrawSize(photo).height + 10 + valueFont.lineHeight + 4;
          if (photo.note.trim()) {
            next +=
              measureTextHeight(
                measure,
                `${labels.photoNote}: ${photo.note}`,
                INNER_WIDTH,
                mutedFont,
              ) + 8;
          }
          return next + 18;
        }, 0);

  const headerInner =
    24 +
    titleFont.lineHeight +
    8 +
    measureTextHeight(
      measure,
      snapshot.address || labels.emptySection,
      CONTENT_WIDTH - 48,
      addressFont,
    ) +
    10 +
    mutedFont.lineHeight +
    28;

  let total =
    PAD +
    headerInner +
    24 +
    sectionChrome +
    basicsContent +
    sectionGap +
    sectionChrome +
    ratingContent +
    sectionGap;

  for (const contentH of listContentHeights) {
    total += sectionChrome + contentH + sectionGap;
  }
  total += sectionChrome + photosContent + sectionGap;
  if (snapshot.disclaimer.trim()) {
    total += measureTextHeight(measure, snapshot.disclaimer, CONTENT_WIDTH, mutedFont) + 12;
  }
  total += mutedFont.lineHeight + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_IMAGE_WIDTH;
  canvas.height = Math.ceil(total);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");

  ctx.fillStyle = "#FDF6F0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let cursor = PAD;

  // Header
  roundRect(ctx, PAD, cursor, CONTENT_WIDTH, headerInner, 24);
  ctx.fillStyle = "#111111";
  ctx.fill();
  let hy = cursor + 24;
  const hx = PAD + 24;
  hy +=
    drawWrappedText(ctx, labels.title, hx, hy, CONTENT_WIDTH - 48, titleFont, "rgba(255,255,255,0.7)") +
    8;
  hy +=
    drawWrappedText(
      ctx,
      snapshot.address || labels.emptySection,
      hx,
      hy,
      CONTENT_WIDTH - 48,
      addressFont,
      "#FFFFFF",
    ) + 10;
  drawWrappedText(
    ctx,
    `${labels.viewingAt}: ${formatCardImageDate(snapshot.viewingAt, locale) || labels.emptySection}`,
    hx,
    hy,
    CONTENT_WIDTH - 48,
    mutedFont,
    "rgba(255,255,255,0.82)",
  );
  cursor += headerInner + 24;

  const drawBoxedSection = (
    title: string,
    tone: "neutral" | "good" | "risk",
    contentHeight: number,
    paint: (contentTop: number) => void,
  ) => {
    const boxTop = cursor;
    const boxHeight = sectionChrome + contentHeight;
    const bg =
      tone === "good" ? "#F0FDF4" : tone === "risk" ? "#FEF2F2" : "#FFFFFF";
    const border =
      tone === "good" ? "#BBF7D0" : tone === "risk" ? "#FECACA" : "#E7E2DD";
    roundRect(ctx, PAD, boxTop, CONTENT_WIDTH, boxHeight, 18);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.stroke();
    let cy = boxTop + 16;
    cy +=
      drawWrappedText(ctx, title, PAD + INNER, cy, INNER_WIDTH, sectionFont, "#1A1A1A") + 12;
    paint(cy);
    cursor = boxTop + boxHeight + sectionGap;
  };

  drawBoxedSection(labels.basics, "neutral", basicsContent, (top) => {
    let cy = top;
    if (basics.length === 0 && !snapshot.listingUrl && !snapshot.setupNotes) {
      drawWrappedText(ctx, labels.emptySection, PAD + INNER, cy, INNER_WIDTH, mutedFont, "#9CA3AF");
      return;
    }
    for (const [label, value] of basics) {
      cy +=
        drawWrappedText(ctx, label, PAD + INNER, cy, INNER_WIDTH, labelFont, "#6B7280") + 4;
      cy +=
        drawWrappedText(ctx, value, PAD + INNER, cy, INNER_WIDTH, valueFont, "#1A1A1A") + 14;
    }
    if (snapshot.listingUrl) {
      cy +=
        drawWrappedText(
          ctx,
          labels.listingUrl,
          PAD + INNER,
          cy,
          INNER_WIDTH,
          labelFont,
          "#6B7280",
        ) + 4;
      cy +=
        drawWrappedText(
          ctx,
          snapshot.listingUrl,
          PAD + INNER,
          cy,
          INNER_WIDTH,
          mutedFont,
          "#2563EB",
        ) + 14;
    }
    if (snapshot.setupNotes) {
      cy +=
        drawWrappedText(
          ctx,
          labels.setupNotes,
          PAD + INNER,
          cy,
          INNER_WIDTH,
          labelFont,
          "#6B7280",
        ) + 4;
      drawWrappedText(
        ctx,
        snapshot.setupNotes,
        PAD + INNER,
        cy,
        INNER_WIDTH,
        bodyFont,
        "#1A1A1A",
      );
    }
  });

  drawBoxedSection(labels.rating, "neutral", ratingContent, (top) => {
    drawWrappedText(
      ctx,
      ratingText,
      PAD + INNER,
      top,
      INNER_WIDTH,
      snapshot.overallRating == null ? mutedFont : ratingFont,
      snapshot.overallRating == null ? "#9CA3AF" : "#1A1A1A",
    );
  });

  listSections.forEach((section, index) => {
    drawBoxedSection(section.title, section.tone, listContentHeights[index], (top) => {
      let cy = top;
      if (section.items.length === 0) {
        drawWrappedText(
          ctx,
          labels.emptySection,
          PAD + INNER,
          cy,
          INNER_WIDTH,
          mutedFont,
          "#9CA3AF",
        );
        return;
      }
      for (const item of section.items) {
        cy +=
          drawWrappedText(
            ctx,
            `• ${item.text}`,
            PAD + INNER,
            cy,
            INNER_WIDTH,
            bodyFont,
            "#1A1A1A",
          ) + 10;
      }
    });
  });

  const loadedPhotos = await Promise.all(photos.map((photo) => loadImage(photo.dataUrl)));
  drawBoxedSection(labels.photos, "neutral", photosContent, (top) => {
    let cy = top;
    if (photos.length === 0) {
      drawWrappedText(
        ctx,
        labels.emptySection,
        PAD + INNER,
        cy,
        INNER_WIDTH,
        mutedFont,
        "#9CA3AF",
      );
      return;
    }
    photos.forEach((photo, index) => {
      const size = photoDrawSize(photo);
      ctx.fillStyle = "#F5F3F0";
      ctx.fillRect(PAD + INNER, cy, size.width, size.height);
      ctx.drawImage(loadedPhotos[index], PAD + INNER, cy, size.width, size.height);
      cy += size.height + 10;
      cy +=
        drawWrappedText(ctx, photo.tag, PAD + INNER, cy, INNER_WIDTH, valueFont, "#1A1A1A") +
        4;
      if (photo.note.trim()) {
        cy +=
          drawWrappedText(
            ctx,
            `${labels.photoNote}: ${photo.note}`,
            PAD + INNER,
            cy,
            INNER_WIDTH,
            mutedFont,
            "#4B5563",
          ) + 8;
      }
      cy += 18;
    });
  });

  if (snapshot.disclaimer.trim()) {
    cursor +=
      drawWrappedText(
        ctx,
        snapshot.disclaimer,
        PAD,
        cursor,
        CONTENT_WIDTH,
        mutedFont,
        "#6B7280",
      ) + 12;
  }
  drawWrappedText(
    ctx,
    `${labels.generatedAt}: ${formatCardImageDate(snapshot.generatedAt, locale)}`,
    PAD,
    cursor,
    CONTENT_WIDTH,
    mutedFont,
    "#9CA3AF",
  );

  for (const image of loadedPhotos) {
    image.src = "";
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("IMAGE_ENCODE_FAILED"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
  canvas.width = 1;
  canvas.height = 1;
  measureCanvas.width = 1;
  measureCanvas.height = 1;
  return blob;
}
