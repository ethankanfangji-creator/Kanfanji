"use client";

/**
 * Read-only compare for local chat threads.
 *
 * Ownership: each thread exists only in this browser's localStorage
 * (`kanfangji.viewingChat.threads.v1`). There is no server copy, so this page
 * must not call an API to load or authorize the ids. A link opened on another
 * device shows「此裝置找不到這筆紀錄」for every id it does not have.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { PageContainer } from "@/components/ui/primitives";
import {
  ChatCompareBoard,
  type CompareBoardItem,
  type CompareColumnView,
} from "@/components/comparison/ChatCompareBoard";
import {
  COMPARE_SECTION_ROWS,
  compareRowIsVisible,
  parseCompareIds,
  projectThreadForCompare,
  rowDiffers,
  type CompareRowKey,
  type CompareSectionId,
  type ThreadCompareColumn,
} from "@/lib/comparison/from-thread";
import { getLocalThread } from "@/lib/viewing-chat/local-store";
import { snapshotFromThreadColumns } from "@/lib/comparison/share-snapshot";

let columnSnapshot: { key: string; columns: CompareColumnView[] | null } = {
  key: "",
  columns: null,
};

function subscribeToThreads() {
  return () => {};
}

function threadsServerSnapshot(): CompareColumnView[] | null {
  return null;
}

/** Cached so useSyncExternalStore does not see a new array every read. */
function threadsClientSnapshot(key: string): CompareColumnView[] | null {
  if (columnSnapshot.key === key) return columnSnapshot.columns;
  const { rawIds, locale, missing } = JSON.parse(key) as {
    rawIds: string | null;
    locale: string;
    missing: string;
  };
  const ids = parseCompareIds(rawIds);
  const columns =
    ids.length < 2
      ? null
      : ids.map((id): CompareColumnView => {
          const thread = getLocalThread(id);
          if (!thread) return { kind: "missing", threadId: id, message: missing };
          return {
            kind: "found",
            column: projectThreadForCompare(thread, { locale }),
          };
        });
  columnSnapshot = { key, columns };
  return columns;
}

function sectionLabel(
  id: CompareSectionId,
  labels: {
    basic: string;
    nearby: string;
    feel: string;
    condition: string;
    notes: string;
  },
): string {
  switch (id) {
    case "basic":
      return labels.basic;
    case "nearby":
      return labels.nearby;
    case "feel":
      return labels.feel;
    case "condition":
      return labels.condition;
    case "notes":
      return labels.notes;
  }
}

export function ChatComparePage() {
  const { messages, locale } = useI18n();
  const lite = messages.compareLite;
  const chat = messages.chat;
  const router = useRouter();
  const params = useSearchParams();
  const rawIds = params.get("ids");
  const ids = useMemo(() => parseCompareIds(rawIds), [rawIds]);
  const snapshotKey = JSON.stringify({
    rawIds,
    locale,
    missing: lite.compareMissingOnDevice,
  });
  const [gate, setGate] = useState<
    | { kind: "pending" }
    | { kind: "allowed"; compareId: string }
    | { kind: "blocked"; reason: "login" | "upgrade" | "failed" }
  >({ kind: "pending" });
  const [shareOpen, setShareOpen] = useState(false);
  const [shareAck, setShareAck] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareId, setShareId] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  useEffect(() => {
    if (ids.length < 2) return;
    let cancelled = false;
    setGate({ kind: "pending" });
    void fetch("/api/compare/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "chat_history", itemIds: ids }),
    }).then(async (response) => {
      if (cancelled) return;
      if (response.status === 401) setGate({ kind: "blocked", reason: "login" });
      else if (response.status === 402 || response.status === 400) setGate({ kind: "blocked", reason: "upgrade" });
      else if (!response.ok) setGate({ kind: "blocked", reason: "failed" });
      else {
        const body = (await response.json()) as { compareId?: string };
        setGate({ kind: "allowed", compareId: body.compareId ?? "" });
      }
    }).catch(() => {
      if (!cancelled) setGate({ kind: "blocked", reason: "failed" });
    });
    return () => {
      cancelled = true;
    };
  }, [ids]);
  const columns = useSyncExternalStore(
    subscribeToThreads,
    () => threadsClientSnapshot(snapshotKey),
    threadsServerSnapshot,
  );

  function onBack() {
    if (window.history.length <= 1) {
      router.push("/");
      return;
    }
    router.back();
  }

  const rowLabel = (key: CompareRowKey): string => {
    switch (key) {
      case "address":
        return chat.fieldLabels.address;
      case "viewedAt":
        return lite.compareViewedAt;
      case "price":
        return chat.fieldLabels.price;
      case "area":
        return chat.fieldLabels.area;
      case "layout":
        return chat.fieldLabels.layout;
      case "floor":
        return chat.fieldLabels.floor;
      case "yearBuilt":
        return chat.fieldLabels.year_built;
      case "propertyType":
        return lite.compareRowPropertyType;
      case "strata":
        return lite.compareRowStrata;
      case "transit":
        return chat.fieldLabels.transit;
      case "schools":
        return chat.intelSchools;
      case "supermarket":
        return lite.compareRowSupermarket;
      case "park":
        return lite.compareRowPark;
      case "parking":
        return chat.fieldLabels.parking;
      case "noise":
        return chat.fieldLabels.noise;
      case "odor":
        return chat.fieldLabels.odor;
      case "light":
        return chat.fieldLabels.light;
      case "water_damage":
        return chat.fieldLabels.water_damage;
      case "electrical":
        return chat.fieldLabels.electrical;
      case "plumbing":
        return chat.fieldLabels.plumbing;
      case "hvac":
        return chat.fieldLabels.hvac;
      case "pros":
        return chat.fieldLabels.pros;
      case "cons":
        return chat.fieldLabels.cons;
      case "intelRiskTags":
        return chat.intelRisks;
    }
  };

  const found = (columns ?? []).flatMap((column) =>
    column.kind === "found" ? [column.column] : [],
  );

  async function createShare() {
    if (gate.kind !== "allowed" || !gate.compareId || !shareAck || found.length < 2) return;
    setShareBusy(true);
    try {
      const response = await fetch("/api/compare/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compareId: gate.compareId,
          snapshot: snapshotFromThreadColumns(found),
          acknowledgeAddresses: true,
        }),
      });
      const body = (await response.json()) as { url?: string; shareId?: string };
      if (!response.ok || !body.url) {
        setShareMessage(
          response.status === 429 ? messages.compare.shareRateLimited : messages.compare.startFailed,
        );
        return;
      }
      setShareUrl(body.url);
      setShareId(body.shareId ?? "");
      setShareOpen(false);
      setShareMessage("");
      await navigator.clipboard?.writeText(body.url);
    } catch (err) {
      setShareMessage(err instanceof Error ? err.message : messages.compare.error);
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeShare() {
    if (!shareId) return;
    try {
      const response = await fetch(`/api/compare/shares/${shareId}/revoke`, { method: "POST" });
      if (!response.ok) {
        setShareMessage(messages.compare.error);
        return;
      }
      setShareUrl("");
      setShareId("");
      setShareMessage(messages.compare.shareRevoked);
    } catch {
      setShareMessage(messages.compare.error);
    }
  }

  const items: CompareBoardItem[] = COMPARE_SECTION_ROWS.flatMap((section) => {
    const rows = section.rows.filter((key) => compareRowIsVisible(key, found));
    if (rows.length === 0) return [];
    const sectionLabels = {
      basic: lite.compareSectionBasic,
      nearby: lite.compareSectionNearby,
      feel: lite.compareSectionFeel,
      condition: lite.compareSectionCondition,
      notes: lite.compareSectionNotes,
    };
    return [
      {
        type: "section" as const,
        id: section.id,
        label: sectionLabel(section.id, sectionLabels),
      },
      ...rows.map((key) => ({
        type: "field" as const,
        key,
        label: rowLabel(key),
        hint: key === "intelRiskTags" ? lite.compareRiskTagHint : undefined,
        differs: rowDiffers(
          found.map((column: ThreadCompareColumn) => column.rows[key]),
        ),
      })),
    ];
  });

  return (
    <div className="min-h-screen w-full bg-[var(--color-canvas)] text-[var(--color-text)]">
      <PageContainer className="py-6 pb-16">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[var(--touch-target)] items-center gap-1 text-[12px] font-medium text-[#6B7280]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {lite.compareBack}
        </button>
        <h1 className="mt-2 text-[20px] font-[800] tracking-tight">{lite.compareTitle}</h1>
        {gate.kind === "allowed" && found.length >= 2 ? (
          <button
            type="button"
            className="mt-3 text-sm font-bold underline"
            onClick={() => {
              if (gate.kind !== "allowed" || !gate.compareId) {
                setShareMessage(messages.compare.startFailed);
                return;
              }
              setShareOpen(true);
            }}
          >
            {messages.compare.share}
          </button>
        ) : null}
        {shareOpen ? (
          <div className="mt-3 rounded-xl border border-black/10 bg-white p-4 text-sm" role="dialog">
            <h2 className="font-bold">{messages.compare.shareNoticeTitle}</h2>
            <p className="mt-2">{messages.compare.shareNoticeBody}</p>
            <ul className="mt-2 list-disc pl-5">
              <li>{messages.compare.shareNoticePoint1}</li>
              <li>{messages.compare.shareNoticePoint2}</li>
              <li>{messages.compare.shareNoticePoint3}</li>
            </ul>
            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={shareAck}
                onChange={(event) => setShareAck(event.target.checked)}
              />
              {messages.compare.shareAcknowledge}
            </label>
            <button
              type="button"
              className="mt-3 font-bold underline disabled:opacity-50"
              disabled={!shareAck || shareBusy}
              onClick={() => void createShare()}
            >
              {messages.compare.shareCreate}
            </button>
          </div>
        ) : null}
        {shareUrl ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-3 rounded-xl border border-black/5 bg-white p-3 text-[11px] break-all"
          >
            <span className="sr-only">{messages.compare.shareCopied}</span>
            <p className="mb-1 font-bold">{messages.compare.shareHint}</p>
            <p>{messages.compare.shareCopyOnce}</p>
            <a href={shareUrl} className="text-[#2563EB]">
              {shareUrl}
            </a>
            {shareId ? (
              <button type="button" className="mt-2 block font-bold underline" onClick={() => void revokeShare()}>
                {messages.compare.shareRevoke}
              </button>
            ) : null}
          </div>
        ) : null}
        {shareMessage ? <p className="mt-2 text-sm">{shareMessage}</p> : null}
        {gate.kind === "pending" && ids.length >= 2 ? (
          <p className="mt-4 text-sm">{messages.compare.loading}</p>
        ) : null}
        {gate.kind === "blocked" && gate.reason === "login" ? (
          <div className="mt-4 space-y-3">
            <p>{messages.compare.gateLoginBody}</p>
            <a className="inline-flex font-bold underline" href={`/login?mode=signup&next=${encodeURIComponent(`/compare?ids=${ids.join(",")}`)}`}>
              {messages.compare.gateLoginCta}
            </a>
          </div>
        ) : null}
        {gate.kind === "blocked" && gate.reason === "upgrade" ? (
          <div className="mt-4 space-y-3">
            <p>{messages.compare.gateUpgradeBody}</p>
            <Link href="/login" className="inline-flex font-bold underline">
              {messages.aiBoundary.ctaUpgrade}
            </Link>
          </div>
        ) : null}
        {gate.kind === "blocked" && gate.reason === "failed" ? <p className="mt-4">{messages.compare.startFailed}</p> : null}
        <p className="mt-1 text-[12px] text-[#6B7280]">{lite.compareSubtitle}</p>

        {ids.length < 2 ? (
          <div className="mt-8 rounded-[22px] border border-black/[0.05] bg-white p-6 text-center shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[14px] font-bold">{lite.compareNeedTwo}</p>
            <Link
              href="/"
              className="mt-4 inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-full bg-black px-5 text-[13px] font-bold text-white"
            >
              {lite.compareBackHome}
            </Link>
          </div>
        ) : gate.kind === "allowed" && columns ? (
          <div className="mt-6">
            <ChatCompareBoard
              columns={columns}
              items={items}
              labels={{
                empty: lite.compareEmptyCell,
                skipped: lite.compareSkipped,
                inferred: lite.compareInferred,
                diff: lite.compareDiffSr,
              }}
            />
          </div>
        ) : null}
      </PageContainer>
    </div>
  );
}
