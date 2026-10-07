"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Clock3,
  Copy,
  ExternalLink,
  Link2,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldOff,
} from "lucide-react";
import { ClientAuthBar } from "@/components/ClientAuthBar";
import { useI18n } from "@/components/I18nProvider";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { PageContainer } from "@/components/ui/primitives";
import { formatMessage } from "@/lib/i18n";
import { shortenAddressLabel } from "@/lib/shorten-address";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type {
  OwnerShareCommentListItem,
  OwnerShareLinkListItem,
} from "@/lib/share-access/types";

type Tab = "links" | "comments";
type LinkFilter = "open" | "closed" | "all";

function formatWhen(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(
    locale === "en" ? "en-CA" : locale === "th" ? "th-TH" : "zh-TW",
    {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(new Date(iso));
}

function statusLabel(
  status: OwnerShareLinkListItem["status"],
  labels: { statusActive: string; statusExpired: string; statusClosed: string },
) {
  if (status === "closed" || status === "revoked") return labels.statusClosed;
  if (status === "expired") return labels.statusExpired;
  return labels.statusActive;
}

function statusTone(status: OwnerShareLinkListItem["status"]) {
  if (status === "active") return "bg-emerald-50 text-emerald-800 ring-emerald-100";
  if (status === "expired") return "bg-amber-50 text-amber-900 ring-amber-100";
  return "bg-stone-100 text-stone-600 ring-stone-200";
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[12px] font-semibold transition ${
        active
          ? "bg-black text-white"
          : "bg-black/5 text-[#374151] hover:bg-black/10"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-black/10 bg-white/70 px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-black/[0.04] text-[#6B7280]">
        {icon}
      </div>
      <p className="mt-4 text-[15px] font-bold text-[#1A1A1A]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-[#6B7280]">
        {hint}
      </p>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  href,
  disabled,
  tone = "default",
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  tone?: "default" | "danger" | "primary";
  children: ReactNode;
}) {
  const toneClass =
    tone === "primary"
      ? "bg-black text-white hover:bg-black/90"
      : tone === "danger"
        ? "border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B] hover:bg-[#FEE2E2]"
        : "border border-black/10 bg-white text-[#1F2937] hover:bg-black/[0.03]";
  const className = `inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition disabled:opacity-40 sm:min-w-0 sm:justify-start sm:px-3 ${toneClass}`;
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={className}>
        {children}
        <span className="hidden sm:inline">{label}</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={className}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
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

  async function stopLink(item: OwnerShareLinkListItem) {
    if (item.status === "closed" || item.status === "revoked") return;
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/share/links/${item.id}/close`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || labels.stopFailed);
      }
      const closedAt = new Date().toISOString();
      setLinks((prev) => {
        if (linkFilter === "open") return prev.filter((row) => row.id !== item.id);
        return prev.map((row) =>
          row.id === item.id
            ? { ...row, status: "closed", closedAt }
            : row,
        );
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.stopFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function reopenLink(item: OwnerShareLinkListItem) {
    if (item.status !== "closed") return;
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/share/links/${item.id}/reopen`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || labels.reopenFailed);
      }
      setLinks((prev) => {
        if (linkFilter === "closed") return prev.filter((row) => row.id !== item.id);
        return prev.map((row) =>
          row.id === item.id
            ? { ...row, status: "active", closedAt: null }
            : row,
        );
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.reopenFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function publishLink(item: OwnerShareLinkListItem) {
    if (item.status === "revoked") return;
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/share/links/${item.id}/publish`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || labels.publishFailed);
      }
      showToast(labels.publishDone);
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.publishFailed);
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
    <div className="relative min-h-screen w-full overflow-x-hidden text-[var(--color-text)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[var(--color-canvas)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[280px] bg-[radial-gradient(90%_70%_at_10%_-10%,rgba(17,17,17,0.08),transparent_55%),radial-gradient(70%_50%_at_90%_0%,rgba(180,120,70,0.12),transparent_50%)]"
      />

      <PageContainer narrow className="relative pb-28 pt-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <BackHomeLink label={labels.back} className="mb-2" />
            <h1 className="text-[22px] font-[800] leading-[1.15] tracking-tight">
              {labels.title}
            </h1>
            <p className="mt-1 text-[13px] text-[#6B7280]">{labels.subtitle}</p>
          </div>
          <div className="mt-1.5 shrink-0">
            <ClientAuthBar />
          </div>
        </div>

        {!authReady ? (
          <div className="space-y-3">
            <div className="h-11 animate-pulse rounded-full bg-black/[0.06]" />
            <div className="h-28 animate-pulse rounded-3xl bg-black/[0.05]" />
          </div>
        ) : !signedIn ? (
          <div className="rounded-3xl border border-black/[0.05] bg-white/90 p-8 text-center shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-black/[0.04]">
              <Link2 className="h-5 w-5 text-[#6B7280]" aria-hidden />
            </div>
            <p className="mt-4 text-[15px] font-bold">{labels.signInRequired}</p>
            <Link
              href={`/login?next=${encodeURIComponent("/shares")}`}
              className="mt-5 inline-flex h-11 items-center rounded-full bg-black px-5 text-[13px] font-bold text-white"
            >
              {labels.signIn}
            </Link>
          </div>
        ) : (
          <>
            <div
              className="mb-4 inline-flex rounded-full bg-black/[0.05] p-1"
              role="tablist"
              aria-label={labels.title}
            >
              {(
                [
                  ["links", labels.tabLinks, Link2],
                  ["comments", labels.tabComments, MessageSquareText],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => switchTab(id)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold transition ${
                    tab === id
                      ? "bg-white text-black shadow-sm"
                      : "text-[#6B7280] hover:text-[#111]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            <div
              className="sticky top-0 z-10 -mx-1 space-y-3 bg-[var(--color-canvas)]/90 px-1 pb-3 backdrop-blur"
              style={{ paddingTop: "max(0.25rem, env(safe-area-inset-top, 0px))" }}
            >
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]"
                  aria-hidden
                />
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder={labels.searchPlaceholder}
                  className="h-11 w-full rounded-full border border-black/10 bg-white pl-10 pr-4 text-[14px] outline-none focus:border-black/25 focus:ring-2 focus:ring-black/5"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {tab === "links" ? (
                  (
                    [
                      ["open", labels.filterOpen],
                      ["closed", labels.filterClosed],
                      ["all", labels.filterAll],
                    ] as const
                  ).map(([id, label]) => (
                    <Chip
                      key={id}
                      active={linkFilter === id}
                      onClick={() => setLinkFilter(id)}
                    >
                      {label}
                    </Chip>
                  ))
                ) : viewingFilter ? (
                  <Chip
                    active
                    onClick={() => {
                      setViewingFilter("");
                      router.replace("/shares?tab=comments");
                    }}
                  >
                    {labels.clearViewingFilter}
                  </Chip>
                ) : null}

                {!loading ? (
                  <p className="ml-auto text-[12px] font-semibold text-[#6B7280]">
                    {tab === "links"
                      ? formatMessage(labels.countLinks, { n: links.length })
                      : formatMessage(labels.countComments, {
                          n: comments.length,
                        })}
                  </p>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="mb-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] font-medium text-[#991B1B]">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="space-y-3">
                <div className="h-36 animate-pulse rounded-3xl bg-black/[0.05]" />
                <div className="h-36 animate-pulse rounded-3xl bg-black/[0.04]" />
              </div>
            ) : tab === "links" ? (
              links.length === 0 ? (
                <EmptyState
                  icon={<Link2 className="h-5 w-5" aria-hidden />}
                  title={labels.emptyLinks}
                  hint={labels.emptyLinksHint}
                />
              ) : (
                <ul className="space-y-2.5">
                  {links.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-3xl border border-black/[0.05] bg-white p-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)] transition hover:border-black/10 hover:shadow-[0_6px_24px_rgba(0,0,0,0.05)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="text-[15px] font-bold leading-snug text-[#111]"
                            title={item.address}
                          >
                            {shortenAddressLabel(item.address, 52)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#6B7280]">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 ring-1 ring-inset ${statusTone(item.status)}`}
                            >
                              {statusLabel(item.status, labels)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-1.5 text-[12px] text-[#6B7280] sm:grid-cols-2">
                        <p className="inline-flex items-center gap-1.5">
                          <Clock3 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                          <span>
                            {labels.lastOpened}:{" "}
                            <span className="font-semibold text-[#374151]">
                              {item.lastResolvedAt
                                ? formatWhen(item.lastResolvedAt, locale)
                                : labels.neverOpened}
                            </span>
                          </span>
                        </p>
                        <p>
                          {labels.created}:{" "}
                          <span className="font-semibold text-[#374151]">
                            {formatWhen(item.createdAt, locale)}
                          </span>
                        </p>
                        {item.closedAt || item.revokedAt ? (
                          <p>
                            {labels.closedAt}:{" "}
                            <span className="font-semibold text-[#374151]">
                              {formatWhen(item.closedAt ?? item.revokedAt, locale)}
                            </span>
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-3.5 flex flex-wrap gap-2 border-t border-black/[0.04] pt-3">
                        <ActionButton
                          label={labels.copy}
                          disabled={
                            busyId === item.id ||
                            item.status === "revoked" ||
                            item.needsRegenerate ||
                            !item.urlPath
                          }
                          onClick={() => void copyLink(item)}
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        </ActionButton>
                        {item.status === "closed" ? (
                          <ActionButton
                            label={labels.reopen}
                            disabled={busyId === item.id}
                            onClick={() => void reopenLink(item)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                          </ActionButton>
                        ) : item.status !== "revoked" ? (
                          <ActionButton
                            label={labels.stop}
                            tone="danger"
                            disabled={busyId === item.id}
                            onClick={() => void stopLink(item)}
                          >
                            <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                          </ActionButton>
                        ) : null}
                        {item.status !== "revoked" ? (
                          <ActionButton
                            label={labels.publish}
                            disabled={busyId === item.id}
                            onClick={() => void publishLink(item)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                          </ActionButton>
                        ) : null}
                        <ActionButton
                          label={labels.viewComments}
                          onClick={() => openCommentsFor(item.viewingId)}
                        >
                          <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                        </ActionButton>
                        <ActionButton
                          label={labels.openViewing}
                          tone="primary"
                          href={`/viewings/${item.viewingId}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </ActionButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : comments.length === 0 ? (
              <EmptyState
                icon={<MessageSquareText className="h-5 w-5" aria-hidden />}
                title={labels.emptyComments}
                hint={labels.emptyCommentsHint}
              />
            ) : (
              <ul className="space-y-2.5">
                {comments.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/viewings/${item.viewingId}`}
                      className="block rounded-3xl border border-black/[0.05] bg-white p-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)] transition hover:border-black/10 hover:shadow-[0_6px_24px_rgba(0,0,0,0.05)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p
                          className="min-w-0 text-[13px] font-bold text-[#111]"
                          title={item.address}
                        >
                          {shortenAddressLabel(item.address, 48)}
                        </p>
                        <span className="shrink-0 text-[11px] font-semibold text-[#9CA3AF]">
                          {formatWhen(item.createdAt, locale)}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] font-semibold text-[#6B7280]">
                        {item.authorLabel || messages.share.commentsGuestDefault}
                      </p>
                      <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-[#1F2937]">
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

      {toast ? (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
          style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <p className="rounded-full bg-[#111] px-4 py-2.5 text-[12px] font-bold text-white shadow-[0_8px_30px_rgba(0,0,0,0.2)]">
            {toast}
          </p>
        </div>
      ) : null}
    </div>
  );
}
