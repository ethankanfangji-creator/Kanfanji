"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  Copy,
  Pencil,
  Share2,
  X,
} from "lucide-react";
import { ComparisonBoard } from "@/components/comparison/ComparisonBoard";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { PageContainer } from "@/components/ui/primitives";
import {
  getComparison,
  putComparison,
  putComparisonShare,
  sortComparisonColumns,
  toComparisonShareSnapshot,
  touchComparison,
  type CompareSortKey,
  type ComparisonDraft,
} from "@/lib/comparison";
import { newShareToken } from "@/lib/media-paths";

export default function ComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { messages } = useI18n();
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ComparisonDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const row = await getComparison(id);
      if (!row) {
        setError(messages.compare.notFound);
        return;
      }
      setDraft(row);
    })();
  }, [id, messages.compare.notFound]);

  const sortedColumns = useMemo(() => {
    if (!draft) return [];
    return sortComparisonColumns(draft.columns, draft.sort.key, draft.sort.direction);
  }, [draft]);

  async function persist(next: ComparisonDraft) {
    const touched = touchComparison(next);
    setDraft(touched);
    await putComparison(touched);
  }

  async function onShare() {
    if (!draft) return;
    setBusy(true);
    try {
      const token = draft.shareToken || newShareToken();
      const snapshot = toComparisonShareSnapshot({
        ...draft,
        columns: sortedColumns,
      });
      await putComparisonShare({
        token,
        comparisonId: draft.id,
        snapshot,
        createdAt: new Date().toISOString(),
      });
      const next = { ...draft, shareToken: token };
      await persist(next);
      const url = `${window.location.origin}/c/${token}`;
      setShareUrl(url);
      await navigator.clipboard?.writeText(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.compare.error);
    } finally {
      setBusy(false);
    }
  }

  if (error && !draft) {
    return (
      <div className="min-h-screen flex justify-center bg-[#FDF6F0] p-6">
        <div className="max-w-[420px] w-full text-center space-y-3">
          <p className="font-bold">{error}</p>
          <Link href="/viewings" className="text-[13px] underline">
            {messages.compare.backToList}
          </Link>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDF6F0] text-[13px] text-[#6B7280]">
        {messages.compare.loading}
      </div>
    );
  }

  const labels = messages.compare;

  return (
    <div className="min-h-screen w-full flex justify-center bg-[var(--color-canvas)] text-[var(--color-text)]">
      <PageContainer className="pt-6 pb-28">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <Link
              href="/viewings"
              className="inline-flex min-h-[var(--touch-target)] items-center gap-1 text-[var(--font-size-xs)] font-medium text-[var(--color-text-muted)] mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> {labels.backToList}
            </Link>
            <h1 className="text-[20px] font-[800] tracking-tight">{labels.title}</h1>
            <p className="text-[var(--font-size-xs)] text-[var(--color-text-muted)] mt-1">
              {labels.subtitle} · {labels.lastUpdated}{" "}
              {new Date(draft.updatedAt).toLocaleString()}
            </p>
            <p className="text-[var(--font-size-xs)] text-[var(--color-text-muted)] mt-1">
              {labels.readOnlySource}
            </p>
          </div>
          <LanguageSwitcher />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {(
            [
              ["rating", labels.sortRating],
              ["price", labels.sortPrice],
              ["riskCount", labels.sortRisks],
            ] as Array<[CompareSortKey, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                void persist({
                  ...draft,
                  sort: {
                    key,
                    direction:
                      draft.sort.key === key && draft.sort.direction === "desc"
                        ? "asc"
                        : "desc",
                  },
                })
              }
              className={`h-9 px-3 rounded-full text-[11px] font-bold inline-flex items-center gap-1 border ${
                draft.sort.key === key
                  ? "bg-black text-white border-black"
                  : "bg-white border-black/10"
              }`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {label}
              {draft.sort.key === key
                ? draft.sort.direction === "desc"
                  ? " ↓"
                  : " ↑"
                : ""}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="h-9 px-3 rounded-full text-[11px] font-bold bg-white border border-black/10 inline-flex items-center gap-1"
          >
            {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {editing ? labels.doneEdit : labels.edit}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onShare()}
            className="h-9 px-3 rounded-full text-[11px] font-bold bg-black text-white inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Share2 className="w-3.5 h-3.5" /> {labels.share}
          </button>
        </div>

        {shareUrl ? (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-xl bg-white border border-black/5 p-3 text-[11px] break-all"
          >
            <span className="sr-only">{messages.compare.shareCopied}</span>
            <p className="font-bold mb-1 inline-flex items-center gap-1">
              <Copy className="w-3.5 h-3.5" /> {labels.shareHint}
            </p>
            <a href={shareUrl} className="text-[#2563EB]">
              {shareUrl}
            </a>
          </div>
        ) : null}

        <ComparisonBoard
          columns={sortedColumns}
          labels={{
            empty: labels.empty,
            price: labels.price,
            layout: labels.layout,
            location: labels.location,
            area: labels.area,
            managementFee: labels.managementFee,
            rating: labels.rating,
            pros: labels.pros,
            risks: labels.risks,
            followUps: labels.followUps,
            notes: labels.notes,
            includeInShare: labels.includeInShare,
          }}
          editing={editing}
          onChangeTitle={(columnId, title) =>
            void persist({
              ...draft,
              columns: draft.columns.map((c) =>
                c.id === columnId ? { ...c, title } : c,
              ),
            })
          }
          onChangeNotes={(columnId, notes) =>
            void persist({
              ...draft,
              columns: draft.columns.map((c) =>
                c.id === columnId ? { ...c, notes } : c,
              ),
            })
          }
          onChangeList={(columnId, field, text) =>
            void persist({
              ...draft,
              columns: draft.columns.map((c) =>
                c.id === columnId
                  ? {
                      ...c,
                      fields: {
                        ...c.fields,
                        [field]: text
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean),
                      },
                    }
                  : c,
              ),
            })
          }
          onToggleIncluded={(columnId) =>
            void persist({
              ...draft,
              columns: draft.columns.map((c) =>
                c.id === columnId ? { ...c, included: !c.included } : c,
              ),
            })
          }
        />

        <button
          type="button"
          onClick={() => router.push("/viewings")}
          className="ui-button ui-button--secondary mt-[var(--space-6)] w-full max-w-[var(--page-max-width-narrow)] mx-auto text-[var(--font-size-sm)]"
        >
          <X className="w-4 h-4" /> {labels.close}
        </button>
      </PageContainer>
    </div>
  );
}
