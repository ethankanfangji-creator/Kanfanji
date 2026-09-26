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
import { useMemo, useSyncExternalStore } from "react";
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
        ) : columns ? (
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
