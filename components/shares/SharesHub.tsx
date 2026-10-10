"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bookmark,
  ExternalLink,
  Link2,
  MapPin,
  MessageSquareText,
  Search,
  Trash2,
} from "lucide-react";
import { ClientAuthBar } from "@/components/ClientAuthBar";
import { useI18n } from "@/components/I18nProvider";
import { ShareViewingCard } from "@/components/shares/ShareViewingCard";
import { shareOrCopyUrl } from "@/lib/share-or-copy";
import {
  BrowseLayoutToggle,
  browseCoverClass,
  browseListClass,
  useBrowseLayout,
  useBrowseLayoutWide,
} from "@/components/ui/BrowseLayoutToggle";
import { BrowsePageHeader } from "@/components/ui/BrowsePageHeader";
import { PageContainer } from "@/components/ui/primitives";
import { ViewingMapCover } from "@/components/viewings/ViewingMapCover";
import { formatMessage } from "@/lib/i18n";
import { shortenAddressLabel } from "@/lib/shorten-address";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { SavedShareListItem } from "@/lib/share-access/saves";
import {
  filterShareViewingGroups,
  groupShareLinksByViewing,
  recipientInitials,
} from "@/lib/share-access/group-links";
import { withBrowseOrigin } from "@/lib/browse-origin";
import type { OwnerShareLinkListItem } from "@/lib/share-access/types";
import type { NotificationItem } from "@/lib/notifications/types";

type Tab = "links" | "received";
type LinkFilter = "open" | "closed" | "stale" | "unread" | "all";
type ReceivedFilter = "open" | "invalid" | "replies" | "all";

const COMMENT_NOTIF_TYPES = new Set(["share_comment", "share_comment_reply"]);

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
  status: OwnerShareLinkListItem["status"] | SavedShareListItem["status"],
  labels: { statusActive: string; statusExpired: string; statusClosed: string },
) {
  if (status === "closed" || status === "revoked") return labels.statusClosed;
  if (status === "expired") return labels.statusExpired;
  return labels.statusActive;
}

function statusTone(
  status: OwnerShareLinkListItem["status"] | SavedShareListItem["status"],
) {
  if (status === "active") return "bg-[#ECFDF5] text-[#065F46]";
  if (status === "expired") return "bg-[#FFFBEB] text-[#92400E]";
  return "bg-[#F3F4F6] text-[#4B5563]";
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
          ? "bg-[#1A1A1A] text-white"
          : "bg-white/80 text-[#4B5563] ring-1 ring-black/8 hover:bg-white"
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
    <div className="rounded-[28px] bg-white/80 px-6 py-14 text-center shadow-[0_1px_0_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FAF6F1] text-[#6B7280]">
        {icon}
      </div>
      <p className="mt-5 text-[16px] font-bold tracking-tight text-[#1A1A1A]">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[#6B7280]">
        {hint}
      </p>
    </div>
  );
}

function IconAction({
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
      ? "bg-[#1A1A1A] text-white hover:bg-black"
      : tone === "danger"
        ? "text-[#991B1B] hover:bg-[#FEF2F2]"
        : "text-[#374151] hover:bg-black/[0.04]";
  const className = `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-35 ${toneClass}`;
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={className}>
        {children}
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
    </button>
  );
}

function ShareCover({ lat, lng }: { lat: number | null; lng: number | null }) {
  if (lat != null && lng != null) {
    return <ViewingMapCover lat={lat} lng={lng} />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#F5F3F0]">
      <MapPin className="h-4 w-4 text-[#9CA3AF] sm:h-5 sm:w-5" aria-hidden />
    </div>
  );
}

export function SharesHub() {
  const { locale, messages } = useI18n();
  const labels = messages.sharesHub;
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const initialTab: Tab = tabParam === "received" ? "received" : "links";
  // viewingId in URL scopes the links tab (e.g. notification deep link).
  const initialViewingId =
    initialTab === "links" ? searchParams.get("viewingId")?.trim() || "" : "";
  const focusCommentId =
    initialTab === "links" ? searchParams.get("commentId")?.trim() || "" : "";
  const initialQ = searchParams.get("q")?.trim() || "";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [authReady, setAuthReady] = useState(() => !isSupabaseConfigured());
  const [signedIn, setSignedIn] = useState(false);
  const [q, setQ] = useState(initialQ);
  const [debouncedQ, setDebouncedQ] = useState(initialQ);
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("open");
  const [receivedFilter, setReceivedFilter] = useState<ReceivedFilter>("open");
  const [viewingFilter, setViewingFilter] = useState(initialViewingId);
  const [links, setLinks] = useState<OwnerShareLinkListItem[]>([]);
  const [received, setReceived] = useState<SavedShareListItem[]>([]);
  const [unreadByLinkId, setUnreadByLinkId] = useState<Record<string, number>>(
    {},
  );
  const [unreadReplyByLinkId, setUnreadReplyByLinkId] = useState<
    Record<string, number>
  >({});
  const [unreadReplyNotificationIdsByLink, setUnreadReplyNotificationIdsByLink] =
    useState<Record<string, string[]>>({});
  const [unreadNotificationIdsByLink, setUnreadNotificationIdsByLink] =
    useState<Record<string, string[]>>({});
  const [selectedLink, setSelectedLink] =
    useState<OwnerShareLinkListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [layout, setLayout] = useBrowseLayout();
  const layoutWide = useBrowseLayoutWide();
  const effectiveLayout = layoutWide ? layout : "list";
  const cardShell =
    "overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition hover:border-black/10 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]";
  const cardMainClass =
    effectiveLayout === "grid"
      ? "flex gap-3 p-2.5 sm:flex-col sm:gap-2 sm:p-3"
      : "flex gap-3 p-2.5";
  const coverClass = browseCoverClass(effectiveLayout);

  const viewingGroups = filterShareViewingGroups(
    groupShareLinksByViewing(
      viewingFilter
        ? links.filter((row) => row.viewingId === viewingFilter)
        : links,
    ),
    linkFilter,
    unreadByLinkId,
  );

  const filteredReceived = received.filter((item) => {
    const openable =
      item.status === "active" && !item.needsRegenerate && Boolean(item.urlPath);
    const hasReplies = (unreadReplyByLinkId[item.shareLinkId] ?? 0) > 0;
    if (receivedFilter === "all") return true;
    if (receivedFilter === "open") return openable;
    if (receivedFilter === "replies") return hasReplies;
    return !openable;
  });

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
        const notifRes = await fetch("/api/notifications?limit=100", {
          credentials: "same-origin",
        });
        if (!cancelled && notifRes.ok) {
          const notifBody = (await notifRes.json()) as {
            items?: NotificationItem[];
          };
          const ownerCounts: Record<string, number> = {};
          const ownerIds: Record<string, string[]> = {};
          const replyCounts: Record<string, number> = {};
          const replyIds: Record<string, string[]> = {};
          for (const item of notifBody.items ?? []) {
            if (item.readAt) continue;
            const shareLinkId = item.payload?.shareLinkId;
            if (typeof shareLinkId !== "string" || !shareLinkId) continue;
            if (COMMENT_NOTIF_TYPES.has(item.type)) {
              ownerCounts[shareLinkId] = (ownerCounts[shareLinkId] ?? 0) + 1;
              ownerIds[shareLinkId] = [...(ownerIds[shareLinkId] ?? []), item.id];
            }
            if (item.type === "share_comment_reply") {
              replyCounts[shareLinkId] = (replyCounts[shareLinkId] ?? 0) + 1;
              replyIds[shareLinkId] = [...(replyIds[shareLinkId] ?? []), item.id];
            }
          }
          setUnreadByLinkId(ownerCounts);
          setUnreadNotificationIdsByLink(ownerIds);
          setUnreadReplyByLinkId(replyCounts);
          setUnreadReplyNotificationIdsByLink(replyIds);
        }

        if (tab === "links") {
          // Fetch all statuses so grouped cards can show stopped avatars too.
          const params = new URLSearchParams({
            status: "all",
            limit: "100",
          });
          if (debouncedQ) params.set("q", debouncedQ);
          const response = await fetch(`/api/share/links?${params}`);
          const body = (await response.json()) as {
            items?: OwnerShareLinkListItem[];
            error?: string;
          };
          if (!response.ok) throw new Error(body.error || labels.loadFailed);
          if (!cancelled) {
            setLinks(body.items ?? []);
          }
        } else {
          const params = new URLSearchParams({ limit: "100" });
          if (debouncedQ) params.set("q", debouncedQ);
          const response = await fetch(`/api/share/saves?${params}`);
          const body = (await response.json()) as {
            items?: SavedShareListItem[];
            error?: string;
          };
          if (!response.ok) throw new Error(body.error || labels.loadFailed);
          if (!cancelled) setReceived(body.items ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : labels.loadFailed);
          if (tab === "links") setLinks([]);
          else setReceived([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authReady, signedIn, tab, debouncedQ, labels.loadFailed]);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2000);
  }

  async function toastShareOrCopy(absolute: string, title?: string) {
    const result = await shareOrCopyUrl({ url: absolute, title });
    if (result === "shared") showToast(labels.shared);
    else if (result === "copied") showToast(labels.copied);
    else if (result === "failed") showToast(labels.copyFailed);
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
    await toastShareOrCopy(absolute, item.address);
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
      const next: OwnerShareLinkListItem = {
        ...item,
        status: "closed",
        closedAt,
      };
      setLinks((prev) =>
        prev.map((row) => (row.id === item.id ? next : row)),
      );
      setSelectedLink((prev) => (prev?.id === item.id ? next : prev));
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.stopFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function stopAllLinks(viewingId: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(labels.stopAllConfirm)
    ) {
      return;
    }
    setBusyId(`stop-all:${viewingId}`);
    try {
      const response = await fetch("/api/share/links/close-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewingId }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || labels.stopAllFailed);
      }
      const closedAt = new Date().toISOString();
      setLinks((prev) =>
        prev.map((row) =>
          row.viewingId === viewingId && row.status === "active"
            ? { ...row, status: "closed", closedAt }
            : row,
        ),
      );
      setSelectedLink((prev) =>
        prev && prev.viewingId === viewingId && prev.status === "active"
          ? { ...prev, status: "closed", closedAt }
          : prev,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.stopAllFailed);
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
      const next: OwnerShareLinkListItem = {
        ...item,
        status: "active",
        closedAt: null,
      };
      setLinks((prev) =>
        prev.map((row) => (row.id === item.id ? next : row)),
      );
      setSelectedLink((prev) => (prev?.id === item.id ? next : prev));
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.reopenFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function markNotificationsRead(ids: string[]) {
    if (!ids.length) return;
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // Badge already cleared locally; ignore network errors.
    }
  }

  async function markLinkCommentsRead(shareLinkId: string) {
    const ids = unreadNotificationIdsByLink[shareLinkId];
    if (!ids?.length) return;
    setUnreadByLinkId((prev) => {
      const next = { ...prev };
      delete next[shareLinkId];
      return next;
    });
    setUnreadNotificationIdsByLink((prev) => {
      const next = { ...prev };
      delete next[shareLinkId];
      return next;
    });
    await markNotificationsRead(ids);
  }

  async function markReceivedRepliesRead(shareLinkId: string) {
    const ids = unreadReplyNotificationIdsByLink[shareLinkId];
    if (!ids?.length) return;
    setUnreadReplyByLinkId((prev) => {
      const next = { ...prev };
      delete next[shareLinkId];
      return next;
    });
    setUnreadReplyNotificationIdsByLink((prev) => {
      const next = { ...prev };
      delete next[shareLinkId];
      return next;
    });
    await markNotificationsRead(ids);
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
      setLinks((prev) =>
        prev.map((row) =>
          row.viewingId === item.viewingId && row.status === "active"
            ? { ...row, contentStale: false }
            : row,
        ),
      );
      showToast(labels.publishDone);
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.publishFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function rotateLink(item: OwnerShareLinkListItem) {
    if (item.status === "revoked") return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(labels.rotateConfirm)
    ) {
      return;
    }
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/share/links/${item.id}/rotate`, {
        method: "POST",
      });
      const body = (await response.json()) as {
        link?: OwnerShareLinkListItem;
        urlPath?: string;
        error?: string;
      };
      if (!response.ok || !body.link || !body.urlPath) {
        throw new Error(body.error || labels.rotateFailed);
      }
      const next: OwnerShareLinkListItem = {
        ...item,
        ...body.link!,
        address: item.address,
        urlPath: body.urlPath!,
        needsRegenerate: false,
        lat: item.lat,
        lng: item.lng,
        recipientLabel: body.link!.recipientLabel ?? item.recipientLabel,
      };
      setLinks((prev) => {
        const withoutOld = prev.filter((row) => row.id !== item.id);
        return [next, ...withoutOld];
      });
      setSelectedLink((prev) => (prev?.id === item.id ? next : prev));
      const absolute = `${window.location.origin}${body.urlPath}`;
      await toastShareOrCopy(absolute, item.address);
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.rotateFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function addRecipientCode(
    viewingId: string,
    recipientLabel: string,
  ): Promise<boolean> {
    const label = recipientLabel.trim();
    if (!viewingId || !label || busyId) return false;
    setBusyId("add-recipient");
    try {
      const response = await fetch("/api/share/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewingId,
          recipientLabel: label,
        }),
      });
      const body = (await response.json()) as {
        link?: OwnerShareLinkListItem & { token?: string };
        urlPath?: string;
        error?: string;
      };
      if (response.status === 409 && body.error === "RECIPIENT_EXISTS") {
        showToast(labels.recipientExists);
        return false;
      }
      if (!response.ok || !body.link || !body.urlPath) {
        throw new Error(body.error || labels.addRecipientFailed);
      }
      const absolute =
        typeof window !== "undefined"
          ? `${window.location.origin}${body.urlPath}`
          : body.urlPath;
      await toastShareOrCopy(absolute, label);
      const params = new URLSearchParams({
        status: "all",
        limit: "100",
      });
      if (q.trim()) params.set("q", q.trim());
      const listRes = await fetch(`/api/share/links?${params}`);
      if (listRes.ok) {
        const listBody = (await listRes.json()) as { items?: OwnerShareLinkListItem[] };
        setLinks(Array.isArray(listBody.items) ? listBody.items : []);
      }
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.addRecipientFailed);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  /** Clear property scope from notification deep links. */
  function clearViewingFilter() {
    setViewingFilter("");
    router.replace("/shares?tab=links");
  }

  function switchTab(next: Tab) {
    setTab(next);
    setViewingFilter("");
    // Tab chrome has no address context → show all addresses.
    setQ("");
    setDebouncedQ("");
    if (next === "received") {
      router.replace("/shares?tab=received");
      return;
    }
    router.replace("/shares");
  }

  async function removeReceived(item: SavedShareListItem) {
    setBusyId(item.id);
    try {
      const response = await fetch(
        `/api/share/saves?id=${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        showToast(labels.removeReceivedFailed);
        return;
      }
      setReceived((prev) => prev.filter((row) => row.id !== item.id));
    } catch {
      showToast(labels.removeReceivedFailed);
    } finally {
      setBusyId(null);
    }
  }

  const countLabel =
    tab === "links"
      ? formatMessage(labels.countReports, { n: viewingGroups.length })
      : formatMessage(labels.countReceived, { n: filteredReceived.length });

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden text-[#1A1A1A]">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#FAF6F1]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(80%_60%_at_0%_0%,rgba(180,120,70,0.14),transparent_55%),radial-gradient(60%_50%_at_100%_10%,rgba(17,17,17,0.06),transparent_50%)]"
      />

      <PageContainer className="relative pb-28 pt-5">
        <BrowsePageHeader
          backLabel={messages.nav.back}
          title={labels.title}
          subtitle={labels.subtitle}
          actions={<ClientAuthBar />}
        />

        {!authReady ? (
          <div className="space-y-3">
            <div className="h-12 animate-pulse rounded-2xl bg-black/[0.05]" />
            <div className="h-32 animate-pulse rounded-[28px] bg-black/[0.04]" />
          </div>
        ) : !signedIn ? (
          <div className="rounded-[28px] bg-white px-6 py-12 text-center shadow-[0_8px_40px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FAF6F1]">
              <Link2 className="h-5 w-5 text-[#6B7280]" aria-hidden />
            </div>
            <p className="mt-5 text-[16px] font-bold">{labels.signInRequired}</p>
            <Link
              href={`/login?next=${encodeURIComponent("/shares")}`}
              className="mt-6 inline-flex h-11 items-center rounded-full bg-[#1A1A1A] px-6 text-[13px] font-bold text-white"
            >
              {labels.signIn}
            </Link>
          </div>
        ) : (
          <>
            <div
              className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-black/[0.04] p-1"
              role="tablist"
              aria-label={labels.title}
            >
              {(
                [
                  ["links", labels.tabLinks, Link2],
                  ["received", labels.tabReceived, Bookmark],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => switchTab(id)}
                  className={`inline-flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-bold transition sm:flex-row sm:gap-1.5 sm:text-[13px] ${
                    tab === id
                      ? "bg-white text-[#1A1A1A] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                      : "text-[#6B7280] hover:text-[#111]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>

            <div
              className="sticky top-0 z-10 -mx-1 mb-4 space-y-2.5 bg-[#FAF6F1]/92 px-1 pb-3 backdrop-blur-md"
              style={{ paddingTop: "max(0.35rem, env(safe-area-inset-top, 0px))" }}
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
                  className="h-11 w-full rounded-2xl border-0 bg-white pl-10 pr-4 text-[14px] shadow-[0_1px_0_rgba(0,0,0,0.04)] outline-none ring-1 ring-black/[0.06] focus:ring-2 focus:ring-black/15"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {tab === "links"
                  ? (
                      [
                        ["open", labels.filterOpen],
                        ["stale", labels.filterStale],
                        ["unread", labels.filterUnread],
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
                  : (
                      [
                        ["open", labels.filterReceivedOpen],
                        ["replies", labels.filterReceivedReplies],
                        ["invalid", labels.filterReceivedInvalid],
                        ["all", labels.filterAll],
                      ] as const
                    ).map(([id, label]) => (
                      <Chip
                        key={id}
                        active={receivedFilter === id}
                        onClick={() => setReceivedFilter(id)}
                      >
                        {label}
                      </Chip>
                    ))}
                {tab === "links" && viewingFilter ? (
                  <Chip active onClick={clearViewingFilter}>
                    {labels.clearViewingFilter}
                  </Chip>
                ) : null}

                <div className="ml-auto flex items-center gap-2">
                  <BrowseLayoutToggle
                    layout={layout}
                    onChange={setLayout}
                    labels={{
                      list: labels.layoutList,
                      grid: labels.layoutGrid,
                    }}
                  />
                  {!loading ? (
                    <p className="text-[11px] font-semibold tracking-wide text-[#9CA3AF]">
                      {countLabel}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {error ? (
              <div className="mb-3 rounded-2xl bg-[#FEF2F2] px-4 py-3 text-[13px] font-medium text-[#991B1B] ring-1 ring-[#FECACA]">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="space-y-3">
                <div className="h-28 animate-pulse rounded-[24px] bg-black/[0.04]" />
                <div className="h-28 animate-pulse rounded-[24px] bg-black/[0.03]" />
              </div>
            ) : tab === "received" ? (
              filteredReceived.length === 0 ? (
                <EmptyState
                  icon={<Bookmark className="h-6 w-6" aria-hidden />}
                  title={labels.emptyReceived}
                  hint={labels.emptyReceivedHint}
                />
              ) : (
                <ul className={browseListClass(effectiveLayout)}>
                  {filteredReceived.map((item) => {
                    const openable =
                      item.status === "active" &&
                      !item.needsRegenerate &&
                      Boolean(item.urlPath);
                    const reportHref = openable
                      ? withBrowseOrigin(item.urlPath, "shares")
                      : "";
                    const commentsHref = openable
                      ? withBrowseOrigin(`${item.urlPath}#share-comments`, "shares")
                      : "";
                    const hasReplies =
                      (unreadReplyByLinkId[item.shareLinkId] ?? 0) > 0;
                    const sharedByLine = formatMessage(labels.sharedBy, {
                      name: item.sharedByLabel || "—",
                    });
                    const recipientBit = item.recipientLabel?.trim()
                      ? ` · ${item.recipientLabel.trim()}`
                      : "";
                    const sharerInitials = recipientInitials(
                      item.sharedByLabel,
                      "—",
                    );
                    const sharerFace = (
                      <div
                        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1A1A1A] text-[11px] font-bold text-white"
                        title={sharedByLine}
                        aria-label={sharedByLine}
                      >
                        {item.sharedByAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.sharedByAvatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          sharerInitials
                        )}
                      </div>
                    );
                    const main = (
                      <>
                        <div className={coverClass}>
                          <ShareCover lat={item.lat} lng={item.lng} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p
                                className="truncate text-[13px] font-bold leading-snug text-[#1A1A1A] sm:text-[14px]"
                                title={item.address}
                              >
                                {shortenAddressLabel(item.address, 48)}
                              </p>
                              <p
                                className="mt-0.5 truncate text-[11px] font-semibold text-[#6B7280]"
                                title={`${sharedByLine}${recipientBit}`}
                              >
                                {sharedByLine}
                                {recipientBit}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[#8A8A8A]">
                                {formatWhen(item.savedAt, locale)}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                                    openable
                                      ? statusTone(item.status)
                                      : "bg-black/5 text-[#6B7280]"
                                  }`}
                                >
                                  {openable
                                    ? statusLabel(item.status, labels)
                                    : labels.receivedInvalid}
                                </span>
                                {item.contentUpdated && openable ? (
                                  <span
                                    className="rounded-full bg-[#EFF6FF] px-1.5 py-0.5 text-[11px] font-semibold text-[#1D4ED8]"
                                    title={labels.contentUpdated}
                                  >
                                    {labels.contentUpdated}
                                  </span>
                                ) : null}
                                {hasReplies && openable ? (
                                  <span
                                    className="rounded-full bg-[#FEF3C7] px-1.5 py-0.5 text-[11px] font-semibold text-[#92400E]"
                                    title={labels.hasReplies}
                                  >
                                    {labels.hasReplies}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {sharerFace}
                          </div>
                        </div>
                      </>
                    );
                    return (
                      <li key={item.id}>
                        <div
                          className={`${cardShell} ${openable ? "" : "opacity-80"}`}
                        >
                          {openable ? (
                            <Link
                              href={reportHref}
                              className={cardMainClass}
                              aria-label={`${labels.openReceived}: ${sharedByLine}`}
                            >
                              {main}
                            </Link>
                          ) : (
                            <div className={cardMainClass}>{main}</div>
                          )}
                          <div className="flex flex-wrap items-center gap-0.5 border-t border-black/[0.04] px-2 py-1.5">
                            {openable ? (
                              <>
                                <IconAction
                                  label={labels.openReceived}
                                  href={reportHref}
                                >
                                  <ExternalLink className="h-4 w-4" aria-hidden />
                                </IconAction>
                                <IconAction
                                  label={labels.openReceivedComments}
                                  tone={hasReplies ? "primary" : "default"}
                                  onClick={() => {
                                    void markReceivedRepliesRead(item.shareLinkId);
                                    router.push(commentsHref);
                                  }}
                                >
                                  <MessageSquareText
                                    className="h-4 w-4"
                                    aria-hidden
                                  />
                                </IconAction>
                              </>
                            ) : null}
                            <IconAction
                              label={labels.removeReceived}
                              tone="danger"
                              disabled={busyId === item.id}
                              onClick={() => void removeReceived(item)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </IconAction>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : viewingGroups.length === 0 ? (
              <EmptyState
                icon={<Link2 className="h-6 w-6" aria-hidden />}
                title={labels.emptyLinks}
                hint={labels.emptyLinksHint}
              />
            ) : (
              <ul className={browseListClass(effectiveLayout)}>
                {viewingGroups.map((group) => (
                  <ShareViewingCard
                    key={group.viewingId}
                    group={group}
                    layout={effectiveLayout}
                    busyId={busyId}
                    unreadByLinkId={unreadByLinkId}
                    selectedLink={selectedLink}
                    labels={{
                      recipientGeneral: labels.recipientGeneral,
                      statusActive: labels.statusActive,
                      statusExpired: labels.statusExpired,
                      statusClosed: labels.statusClosed,
                      contentStale: labels.contentStale,
                      share: labels.share,
                      openPublicPage: labels.openPublicPage,
                      copy: labels.copy,
                      stop: labels.stop,
                      stopAll: labels.stopAll,
                      reopen: labels.reopen,
                      rotate: labels.rotate,
                      publish: labels.publish,
                      addRecipient: labels.addRecipient,
                      addRecipientPlaceholder: labels.addRecipientPlaceholder,
                      addRecipientHint: labels.addRecipientHint,
                      commentsWall: labels.commentsWall,
                      openViewing: labels.openViewing,
                      manageRecipient: labels.manageRecipient,
                      unreadComments: labels.unreadComments,
                      moreRecipients: labels.moreRecipients,
                      close: labels.close,
                    }}
                      commentWallLabels={{
                        title: labels.commentsWall,
                        empty: labels.emptyComments,
                        guestDefault: messages.share.commentsGuestDefault,
                        loadFailed: labels.loadFailed,
                        deleteComment: labels.deleteComment,
                        deleteCommentFailed: labels.deleteCommentFailed,
                        recipientGeneral: labels.recipientGeneral,
                        reply: labels.reply,
                        replyPlaceholder: labels.replyPlaceholder,
                        replySubmit: labels.replySubmit,
                        replyFailed: labels.replyFailed,
                        ownerAuthor: labels.ownerAuthor,
                      }}
                    onSelectLink={(link) => {
                      setSelectedLink(link);
                      void markLinkCommentsRead(link.id);
                    }}
                    onCloseSheet={() => setSelectedLink(null)}
                    onShare={(link) => void copyLink(link)}
                    onStop={(link) => void stopLink(link)}
                    onReopen={(link) => void reopenLink(link)}
                    onRotate={(link) => void rotateLink(link)}
                    onStopAll={(viewingId) => void stopAllLinks(viewingId)}
                    onPublish={(link) => void publishLink(link)}
                    onAddRecipient={(viewingId, recipientLabel) =>
                      addRecipientCode(viewingId, recipientLabel)
                    }
                    onOpenCommentsWall={(viewingId) => {
                      for (const link of links) {
                        if (link.viewingId === viewingId) {
                          void markLinkCommentsRead(link.id);
                        }
                      }
                    }}
                    autoOpenComments={
                      Boolean(viewingFilter) &&
                      group.viewingId === viewingFilter
                    }
                    focusCommentId={
                      viewingFilter &&
                      group.viewingId === viewingFilter &&
                      focusCommentId
                        ? focusCommentId
                        : null
                    }
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </PageContainer>

      {toast ? (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
          style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <p className="rounded-full bg-[#1A1A1A] px-4 py-2.5 text-[12px] font-bold text-white shadow-[0_8px_30px_rgba(0,0,0,0.22)]">
            {toast}
          </p>
        </div>
      ) : null}
    </div>
  );
}
