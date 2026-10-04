"use client";

import type { ReactNode } from "react";

/** Lightweight markdown for ChatGPT-style viewing reports (no extra deps). */
export function ReportMarkdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = splitBlocks(text.trim());
  if (!blocks.length) return null;

  return (
    <div className={`report-md space-y-3 text-[13px] leading-relaxed text-[#1A1A1A] ${className}`}>
      {blocks.map((block, index) => (
        <Block key={`${block.type}-${index}`} block={block} />
      ))}
    </div>
  );
}

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "hr" }
  | { type: "p"; text: string };

function splitBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push({ type: "p", text: paragraph.join("\n").trim() });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    out.push({ type: "ul", items: [...list] });
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      flushParagraph();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      flushParagraph();
      out.push({ type: "hr" });
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      flushParagraph();
      const level = heading[1].length;
      out.push({
        type: level === 1 ? "h1" : level === 2 ? "h2" : "h3",
        text: heading[2].trim(),
      });
      continue;
    }
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1].trim());
      continue;
    }
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      list.push(numbered[1].trim());
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushList();
  flushParagraph();
  return out;
}

function Block({ block }: { block: Block }) {
  if (block.type === "hr") {
    return <hr className="border-black/10" />;
  }
  if (block.type === "h1") {
    return <h2 className="text-[17px] font-bold leading-snug">{inlineMarkdown(block.text)}</h2>;
  }
  if (block.type === "h2") {
    return <h3 className="pt-1 text-[15px] font-bold leading-snug">{inlineMarkdown(block.text)}</h3>;
  }
  if (block.type === "h3") {
    return <h4 className="text-[13px] font-bold leading-snug text-[#374151]">{inlineMarkdown(block.text)}</h4>;
  }
  if (block.type === "ul") {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {block.items.map((item) => (
          <li key={item.slice(0, 48)}>{inlineMarkdown(item)}</li>
        ))}
      </ul>
    );
  }
  return <p className="whitespace-pre-wrap">{inlineMarkdown(block.text)}</p>;
}

function inlineMarkdown(text: string): ReactNode {
  // Split **bold** and `code` lightly.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-black/5 px-1 text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}
