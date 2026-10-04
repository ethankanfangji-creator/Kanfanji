"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, ExternalLink, MessageSquareText, ShieldOff } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { PageContainer } from "@/components/ui/primitives";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type {
  OwnerShareCommentListItem,
  OwnerShareLinkListItem,
} from "@/lib/share-access/types";

type Tab = "links" | "comments";
type LinkFilter = "open" | "revoked" | "all";

function formatWhen(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(
    locale === "en" ? "en-CA" : locale === "th" ? "th-TH" : "zh-TW",
    {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(new Date(iso));
}

function statusLabel(
  status: OwnerShareLinkListItem["status"],
  labels: { statusActive: string; statusExpired: string; statusRevoked: string },
) {
  if (status === "revoked") return labels.statusRevoked;
  if (status === "expired") return labels.statusExpired;
  return labels.statusActive;
}

export function SharesHub() {
  const { locale, messages } = useI18n();
  const labels = messages.sharesHub;
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTab: Tab =
    searchParams.get("tab") === "comments" ? "comments" : "links";
  const initialViewingId = searchParams.get("viewingId")?.trim() || "";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [authReady, setAuthReady] = useState(() => !isSupabaseConfigured());
  const [signedIn, setSignedIn] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("open");
  const [viewingFilter, setViewingFilter] = useState(initialViewingId);
  const [links, setLinks] = useState<OwnerShareLinkListItem[]>([]);
  const [comments, setComments] = useState<OwnerShareCommentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setAuthReady(true);
      setSignedIn(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setSignedIn(Boolean(data.user));
      setAuthReady(true);
      if (!data.user) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authReady || !signedIn) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    const load = async () => {
      try {
        if (tab === "links") {
          const params = new URLSearchParams({
            status: linkFilter,
            limit: "100",
          });
          if (debouncedQ) params.set("q", debouncedQ);
          const response = await fetch(`/api/share/links?${params}`);
          const body = (await response.json()) as {
            items?: OwnerShareLinkListItem[];
            error?: string;
          };
          if (!response.ok) throw new Error(body.error || labels.loadFailed);
          if (!cancelled) setLinks(body.items ?? []);
        } else {
          const params = new URLSearchParams({ limit: "100" });
          if (debouncedQ) params.set("q", debouncedQ);
          if (viewingFilter) params.set("viewingId", viewingFilter);
          const response = await fetch(`/api/share/comments?${params}`);
          const body = (await response.json()) as {
            items?: OwnerShareCommentListItem[];
            error?: string;
          };
          if (!response.ok) throw new Error(body.error || labels.loadFailed);
          if (!cancelled) setComments(body.items ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : labels.loadFailed);
          if (tab === "links") setLinks([]);
          else setComments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authReady, signedIn, tab, linkFilter, debouncedQ, viewingFilter, labels.loadFailed]);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2000);
  }

  async function copyLink(item: OwnerShareLinkListItem) {
    if (item.needsRegenerate || !item.urlPath || item.status === "revoked") {
      showToast(labels.needsRegenerate);
      return;
    }
    const absolute =
      typeof window !== "undefined"
        ? `${window.location.origin}${item.urlPath}`
        : item.urlPath;
    try {
      await navigator.clipboard.writeText(absolute);
      showToast(labels.copied);
    } catch {
      showToast(labels.copyFailed);
    }
  }

  async function revokeLink(item: OwnerShareLinkListItem) {
    if (item.status === "revoked") return;
    if (!window.confirm(messages.shareAccess.confirmRevoke)) return;
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/share/links/${item.id}/revoke`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || labels.revokeFailed);
      }
      setLinks((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                status: "revoked",
                revokedAt: new Date().toISOString(),
                urlPath: "",
                needsRegenerate: true,
              }
            : row,
        ),
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.revokeFailed);
    } finally {
      setBusyId(null);
    }
  }

  function openCommentsFor(viewingId: string) {
    setViewingFilter(viewingId);
    setTab("comments");
    router.replace(`/shares?tab=comments&viewingId=${encodeURIComponent(viewingId)}`);
  }

  function switchTab(next: Tab) {
    setTab(next);
    if (next === "links") {
      setViewingFilter("");
      router.replace("/shares");
    } else {
      const params = new URLSearchParams({ tab: "comments" });
      if (viewingFilter) params.set("viewingId", viewingFilter);
      router.replace(`/shares?${params}`);
    }
  }

  return (
    <div className="min-h-screen w-full flex justify-center bg-[var(--color-canvas)] text-[var(--color-text)]">
      <PageContainer narrow className="pt-6 pb-28">
        <Link
          href="/"
          className="inline-flex min-h-[var(--touch-target)] items-center gap-1 text-[var(--font-size-xs)] font-medium text-[var(--color-text-muted)] mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {labels.back}
        </Link>
        <h1 className="text-[20px] font-[800] tracking-tight leading-[1.1] mb-4">
          {labels.title}
        </h1>

        {!authReady ? (
          <div className="h-24 animate-pulse rounded-[22px] bg-[#EFEAE4]" />
        ) : !signedIn ? (
          <div className="rounded-[22px] border border-black/[0.05] bg-white p-6 text-center shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[14px] font-semibold">{labels.signInRequired}</p>
            <Link
              href={`/login?next=${encodeURIComponent("/shares")}`}
              className="mt-4 inline-flex h-10 items-center rounded-full bg-black px-4 text-[13px] font-bold text-white"
            >
              {labels.signIn}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              {(
                [
                  ["links", labels.tabLinks],
                  ["comments", labels.tabComments],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => switchTab(id)}
                  className={`min-h-10 rounded-full px-4 text-[13px] font-bold ${
                    tab === id
                      ? "bg-black text-white"
                      : "border border-black/10 bg-white text-[#374151]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder={labels.searchPlaceholder}
                className="min-h-11 flex-1 rounded-2xl border border-black/10 bg-white px-4 text-[14px] outline-none ring-black/20 focus:ring-2"
              />
              {tab === "links" ? (
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["open", labels.filterOpen],
                      ["revoked", labels.filterRevoked],
                      ["all", labels.filterAll],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setLinkFilter(id)}
                      className={`min-h-10 rounded-full px-3 text-[12px] font-bold ${
                        linkFilter === id
                          ? "bg-[#1F2937] text-white"
                          : "border border-black/10 bg-white text-[#4B5563]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : viewingFilter ? (
                <button
                  type="button"
                  onClick={() => {
                    setViewingFilter("");
                    router.replace("/shares?tab=comments");
                  }}
                  className="min-h-10 rounded-full border border-black/10 bg-white px-3 text-[12px] font-bold text-[#4B5563]"
                >
                  {labels.filterAll}
                </button>
              ) : null}
            </div>

            {toast ? (
              <p className="mb-3 text-[12px] font-semibold text-[#065F46]" role="status">
                {toast}
              </p>
            ) : null}
            {error ? (
              <div className="mb-3 rounded-[18px] border border-[#FECACA] bg-[#FEF2F2] p-4 text-[13px] text-[#991B1B]">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="h-28 animate-pulse rounded-[22px] bg-[#EFEAE4]" />
            ) : tab === "links" ? (
              links.length === 0 ? (
                <p className="rounded-[22px] border border-black/[0.05] bg-white p-6 text-center text-[14px] font-semibold text-[#6B7280]">
                  {labels.emptyLinks}
                </p>
              ) : (
                <ul className="space-y-3">
                  {links.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold leading-[1.3] line-clamp-2">
                            {item.address}
                          </p>
                          <p className="mt-1 text-[12px] font-semibold text-[#6B7280]">
                            {statusLabel(item.status, labels)}
                            {" · "}
                            {item.passwordEnabled ? labels.passwordOn : labels.passwordOff}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            item.status === "active"
                              ? "bg-[#ECFDF5] text-[#065F46]"
                              : item.status === "expired"
                                ? "bg-[#FFFBEB] text-[#92400E]"
                                : "bg-[#F3F4F6] text-[#4B5563]"
                          }`}
                        >
                          {statusLabel(item.status, labels)}
                        </span>
                      </div>
                      <dl className="mt-3 grid gap-1 text-[12px] text-[#6B7280]">
                        <div>
                          <dt className="inline font-semibold">{labels.expires}: </dt>
                          <dd className="inline">
                            {item.expiresAt
                              ? formatWhen(item.expiresAt, locale)
                              : labels.noExpiry}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline font-semibold">{labels.lastOpened}: </dt>
                          <dd className="inline">
                            {item.lastResolvedAt
                              ? formatWhen(item.lastResolvedAt, locale)
                              : labels.neverOpened}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline font-semibold">{labels.created}: </dt>
                          <dd className="inline">{formatWhen(item.createdAt, locale)}</dd>
                        </div>
                        {item.revokedAt ? (
                          <div>
                            <dt className="inline font-semibold">{labels.revokedAt}: </dt>
                            <dd className="inline">{formatWhen(item.revokedAt, locale)}</dd>
                          </div>
                        ) : null}
                      </dl>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={
                            busyId === item.id ||
                            item.status === "revoked" ||
                            item.needsRegenerate ||
                            !item.urlPath
                          }
                          onClick={() => void copyLink(item)}
                          aria-label={labels.copy}
                          title={labels.copy}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 disabled:opacity-40"
                        >
                          <Copy className="h-4 w-4" aria-hidden />
                        </button>
                        {item.status !== "revoked" ? (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => void revokeLink(item)}
                            aria-label={labels.revoke}
                            title={labels.revoke}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#FECACA] text-[#991B1B] disabled:opacity-40"
                          >
                            <ShieldOff className="h-4 w-4" aria-hidden />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openCommentsFor(item.viewingId)}
                          aria-label={labels.viewComments}
                          title={labels.viewComments}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10"
                        >
                          <MessageSquareText className="h-4 w-4" aria-hidden />
                        </button>
                        <Link
                          href={`/viewings/${item.viewingId}`}
                          aria-label={labels.openViewing}
                          title={labels.openViewing}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden />
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : comments.length === 0 ? (
              <p className="rounded-[22px] border border-black/[0.05] bg-white p-6 text-center text-[14px] font-semibold text-[#6B7280]">
                {labels.emptyComments}
              </p>
            ) : (
              <ul className="space-y-3">
                {comments.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/viewings/${item.viewingId}`}
                      className="block rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
                    >
                      <p className="text-[13px] font-bold text-[#111827] line-clamp-1">
                        {item.address}
                      </p>
                      <p className="mt-1 text-[12px] font-semibold text-[#6B7280]">
                        {item.authorLabel || messages.share.commentsGuestDefault}
                        {" · "}
                        {formatWhen(item.createdAt, locale)}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-[1.45] text-[#1F2937]">
                        {item.body}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PageContainer>
    </div>
  );
}
