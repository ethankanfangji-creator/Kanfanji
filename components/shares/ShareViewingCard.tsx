"use client";

import Link from "next/link";
import {
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  MessageSquareText,
  UserPlus,
  RefreshCw,
  Share2,
  ShieldOff,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ShareReportCommentsPanel } from "@/components/viewing-chat/ShareReportCommentsPanel";
import { SheetCloseButton } from "@/components/viewing-chat/shell/SheetCloseButton";
import { ViewingMapCover } from "@/components/viewings/ViewingMapCover";
import {
  isShareLinkOpen,
  recipientInitials,
  type ShareViewingGroup,
} from "@/lib/share-access/group-links";
import type { OwnerShareLinkListItem } from "@/lib/share-access/types";
import { withBrowseOrigin } from "@/lib/browse-origin";
import { canNativeShareUrl } from "@/lib/share-or-copy";
import { shortenAddressLabel } from "@/lib/shorten-address";

const LIST_AVATAR_CAP = 3;

function ShareCover({ lat, lng }: { lat: number | null; lng: number | null }) {
  if (lat != null && lng != null) {
    return <ViewingMapCover lat={lat} lng={lng} />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#F5F3F0]">
      <Link2 className="h-4 w-4 text-[#9CA3AF]" aria-hidden />
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

function RecipientAvatars({
  links,
  labels,
  unreadByLinkId,
  selectedId,
  addActive,
  size,
  cap,
  onSelectLink,
  onAdd,
}: {
  links: OwnerShareLinkListItem[];
  labels: {
    recipientGeneral: string;
    manageRecipient: string;
    unreadComments: string;
    moreRecipients: string;
    addRecipient: string;
  };
  unreadByLinkId: Record<string, number>;
  selectedId: string | null;
  addActive: boolean;
  size: "sm" | "md";
  /** When set, collapse extras behind +N (expand on tap). */
  cap?: number;
  onSelectLink: (link: OwnerShareLinkListItem) => void;
  onAdd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const useCap = typeof cap === "number" && links.length > cap && !expanded;
  const visible = useCap ? links.slice(0, cap) : links;
  const overflow = useCap ? links.length - cap! : 0;
  const sizeClass =
    size === "sm"
      ? "h-8 w-8 text-[11px]"
      : "h-10 w-10 text-[12px]";
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {visible.map((link) => {
        const name = link.recipientLabel?.trim() || labels.recipientGeneral;
        const initials = recipientInitials(
          link.recipientLabel,
          labels.recipientGeneral,
        );
        const open = isShareLinkOpen(link);
        const unread = unreadByLinkId[link.id] ?? 0;
        return (
          <button
            key={link.id}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectLink(link);
            }}
            title={name}
            aria-label={
              unread > 0
                ? `${name} · ${labels.unreadComments}`
                : `${labels.manageRecipient}: ${name}`
            }
            className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-bold transition ${sizeClass} ${
              open ? "bg-[#1A1A1A] text-white" : "bg-[#E5E7EB] text-[#6B7280]"
            } ${selectedId === link.id ? "ring-2 ring-black/30 ring-offset-1" : ""}`}
          >
            {initials}
            {unread > 0 ? (
              <span
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#DC2626] ring-2 ring-white"
                aria-hidden
              />
            ) : null}
          </button>
        );
      })}
      {overflow > 0 ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded(true);
          }}
          aria-label={labels.moreRecipients.replace("{n}", String(overflow))}
          title={labels.moreRecipients.replace("{n}", String(overflow))}
          className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] font-bold text-[#374151] ring-1 ring-black/8 ${sizeClass}`}
        >
          +{overflow}
        </button>
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAdd();
        }}
        title={labels.addRecipient}
        aria-label={labels.addRecipient}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] ring-1 ring-black/12 transition hover:bg-[#FAF6F1] ${sizeClass} ${
          addActive ? "ring-2 ring-black/30 ring-offset-1" : ""
        }`}
      >
        <UserPlus className={iconClass} aria-hidden />
      </button>
    </div>
  );
}

export function ShareViewingCard({
  group,
  labels,
  layout,
  busyId,
  unreadByLinkId,
  selectedLink,
  onSelectLink,
  onCloseSheet,
  onShare,
  onStop,
  onReopen,
  onRotate,
  onStopAll,
  onPublish,
  onAddRecipient,
  onOpenCommentsWall,
  commentWallLabels,
  autoOpenComments = false,
  focusCommentId = null,
}: {
  group: ShareViewingGroup;
  labels: {
    recipientGeneral: string;
    statusActive: string;
    statusExpired: string;
    statusClosed: string;
    contentStale: string;
    share: string;
    openPublicPage: string;
    copy: string;
    stop: string;
    stopAll: string;
    reopen: string;
    rotate: string;
    publish: string;
    addRecipient: string;
    addRecipientPlaceholder: string;
    addRecipientHint: string;
    commentsWall: string;
    openViewing: string;
    manageRecipient: string;
    unreadComments: string;
    moreRecipients: string;
    close: string;
  };
  commentWallLabels: {
    title: string;
    empty: string;
    guestDefault: string;
    loadFailed: string;
    deleteComment: string;
    deleteCommentFailed: string;
    recipientGeneral: string;
    reply: string;
    replyPlaceholder: string;
    replySubmit: string;
    replyFailed: string;
    ownerAuthor: string;
  };
  layout: "list" | "grid";
  busyId: string | null;
  unreadByLinkId: Record<string, number>;
  selectedLink: OwnerShareLinkListItem | null;
  onSelectLink: (link: OwnerShareLinkListItem) => void;
  onCloseSheet: () => void;
  onShare: (link: OwnerShareLinkListItem) => void;
  onStop: (link: OwnerShareLinkListItem) => void;
  onReopen: (link: OwnerShareLinkListItem) => void;
  onRotate: (link: OwnerShareLinkListItem) => void;
  onStopAll: (viewingId: string) => void;
  onPublish: (link: OwnerShareLinkListItem) => void;
  /** Create a named recipient code; resolve true on success. */
  onAddRecipient: (viewingId: string, recipientLabel: string) => Promise<boolean>;
  /** Fired when the owner opens the per-report comments wall (e.g. clear unread). */
  onOpenCommentsWall?: (viewingId: string) => void;
  /** Notification deep link: open comments wall on first paint. */
  autoOpenComments?: boolean;
  focusCommentId?: string | null;
}) {
  const [commentsWallOpen, setCommentsWallOpen] = useState(autoOpenComments);
  const didAutoOpenRef = useRef(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState("");
  const isList = layout === "list";
  const coverClass = isList
    ? "relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#EEE] sm:h-[4.5rem] sm:w-[4.5rem]"
    : "relative h-28 w-full shrink-0 overflow-hidden rounded-xl bg-[#EEE]";
  const cardShell =
    "overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition hover:border-black/10 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]";

  const statusTone =
    group.status === "active"
      ? "bg-[#ECFDF5] text-[#065F46]"
      : group.status === "expired"
        ? "bg-[#FFFBEB] text-[#92400E]"
        : "bg-[#F3F4F6] text-[#4B5563]";
  const statusText =
    group.status === "active"
      ? labels.statusActive
      : group.status === "expired"
        ? labels.statusExpired
        : labels.statusClosed;

  const sheetOpen =
    !addSheetOpen &&
    selectedLink &&
    selectedLink.viewingId === group.viewingId
      ? selectedLink
      : null;
  const nativeShare = canNativeShareUrl();
  const hasOpenLinks = group.links.some(isShareLinkOpen);
  const publishTarget = group.links.find(isShareLinkOpen) ?? null;
  const viewingHref = withBrowseOrigin(
    `/viewings/${group.viewingId}`,
    "shares",
  );
  const publicPageOpenable =
    sheetOpen &&
    isShareLinkOpen(sheetOpen) &&
    !sheetOpen.needsRegenerate &&
    Boolean(sheetOpen.urlPath);
  const selectedId = sheetOpen?.id ?? null;
  const adding = busyId === "add-recipient";
  const stoppingAll = busyId === `stop-all:${group.viewingId}`;

  useEffect(() => {
    if (selectedLink?.viewingId === group.viewingId) {
      setAddSheetOpen(false);
    }
  }, [selectedLink, group.viewingId]);

  useEffect(() => {
    if (!autoOpenComments || didAutoOpenRef.current) return;
    didAutoOpenRef.current = true;
    setCommentsWallOpen(true);
    onOpenCommentsWall?.(group.viewingId);
    // Intentionally omit onOpenCommentsWall: parent passes an inline callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per deep link
  }, [autoOpenComments, group.viewingId]);

  function openAddSheet() {
    onCloseSheet();
    setRecipientDraft("");
    setAddSheetOpen(true);
  }

  function closeAddSheet() {
    setAddSheetOpen(false);
    setRecipientDraft("");
  }

  async function submitAddRecipient() {
    const label = recipientDraft.trim();
    if (!label || adding) return;
    const ok = await onAddRecipient(group.viewingId, label);
    if (ok) closeAddSheet();
  }

  const avatarLabels = {
    recipientGeneral: labels.recipientGeneral,
    manageRecipient: labels.manageRecipient,
    unreadComments: labels.unreadComments,
    moreRecipients: labels.moreRecipients,
    addRecipient: labels.addRecipient,
  };

  const avatarRow = (size: "sm" | "md", cap?: number) => (
    <RecipientAvatars
      links={group.links}
      labels={avatarLabels}
      unreadByLinkId={unreadByLinkId}
      selectedId={selectedId}
      addActive={addSheetOpen}
      size={size}
      cap={cap}
      onSelectLink={onSelectLink}
      onAdd={openAddSheet}
    />
  );

  const titleBlock = (
    <>
      <p
        className="truncate text-[13px] font-bold leading-snug text-[#1A1A1A] sm:text-[14px]"
        title={group.address}
      >
        {shortenAddressLabel(group.address, 48)}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${statusTone}`}
        >
          {statusText}
        </span>
        {group.contentStale ? (
          <span
            className="rounded-full bg-[#FFFBEB] px-1.5 py-0.5 text-[11px] font-semibold text-[#92400E]"
            title={labels.contentStale}
          >
            {labels.contentStale}
          </span>
        ) : null}
      </div>
    </>
  );

  const mainInner = (
    <>
      <div className={coverClass}>
        <ShareCover lat={group.lat} lng={group.lng} />
      </div>
      <div className="min-w-0 flex-1">{titleBlock}</div>
    </>
  );

  return (
    <li>
      <div className={cardShell}>
        {isList ? (
          <div className="flex items-start gap-2 p-2.5">
            <Link
              href={viewingHref}
              className="flex min-w-0 flex-1 gap-3"
              aria-label={`${labels.openViewing}: ${group.address}`}
            >
              {mainInner}
            </Link>
            <div className="max-w-[42%] shrink-0 pt-0.5">
              {avatarRow("sm", LIST_AVATAR_CAP)}
            </div>
          </div>
        ) : (
          <>
            <Link
              href={viewingHref}
              className="flex gap-3 p-2.5 sm:flex-col sm:gap-2 sm:p-3"
              aria-label={`${labels.openViewing}: ${group.address}`}
            >
              {mainInner}
            </Link>
            <div className="border-t border-black/[0.04] px-3 py-2.5">
              {avatarRow("md")}
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-0.5 border-t border-black/[0.04] px-2 py-1.5">
          <IconAction label={labels.openViewing} href={viewingHref}>
            <ExternalLink className="h-4 w-4" aria-hidden />
          </IconAction>
          <IconAction
            label={labels.commentsWall}
            tone={commentsWallOpen ? "primary" : "default"}
            onClick={() => {
              setCommentsWallOpen((open) => {
                const next = !open;
                if (next) onOpenCommentsWall?.(group.viewingId);
                return next;
              });
            }}
          >
            <MessageSquareText className="h-4 w-4" aria-hidden />
          </IconAction>
          {publishTarget ? (
            <IconAction
              label={labels.publish}
              tone={group.contentStale ? "primary" : "default"}
              disabled={busyId === publishTarget.id}
              onClick={() => onPublish(publishTarget)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </IconAction>
          ) : null}
          {hasOpenLinks ? (
            <IconAction
              label={labels.stopAll}
              tone="danger"
              disabled={stoppingAll}
              onClick={() => onStopAll(group.viewingId)}
            >
              <ShieldOff className="h-4 w-4" aria-hidden />
            </IconAction>
          ) : null}
        </div>

        {commentsWallOpen ? (
          <div className="border-t border-black/[0.04] px-3 pb-3 pt-1">
            <ShareReportCommentsPanel
              viewingId={group.viewingId}
              focusCommentId={focusCommentId}
              labels={commentWallLabels}
            />
          </div>
        ) : null}
      </div>

      {addSheetOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={labels.addRecipient}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">{labels.addRecipient}</p>
                <p className="mt-0.5 truncate text-[12px] text-[#6B7280]">
                  {shortenAddressLabel(group.address, 40)}
                </p>
              </div>
              <SheetCloseButton label={labels.close} onClick={closeAddSheet} />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-[#6B7280]">
              {labels.addRecipientHint}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="text"
                value={recipientDraft}
                maxLength={40}
                autoFocus
                placeholder={labels.addRecipientPlaceholder}
                onChange={(event) => setRecipientDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitAddRecipient();
                  }
                }}
                className="min-h-11 w-full rounded-full border border-black/10 bg-[#FAF6F1] px-4 text-[13px] outline-none focus:border-black/25"
              />
              <button
                type="button"
                disabled={!recipientDraft.trim() || adding}
                onClick={() => void submitAddRecipient()}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-black px-4 text-[12px] font-bold text-white disabled:opacity-40"
              >
                {labels.addRecipient}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sheetOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={labels.manageRecipient}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">
                  {sheetOpen.recipientLabel?.trim() || labels.recipientGeneral}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-[#6B7280]">
                  {shortenAddressLabel(group.address, 40)}
                </p>
              </div>
              <SheetCloseButton label={labels.close} onClick={onCloseSheet} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={
                  busyId === sheetOpen.id ||
                  sheetOpen.status === "revoked" ||
                  sheetOpen.needsRegenerate ||
                  !sheetOpen.urlPath
                }
                onClick={() => onShare(sheetOpen)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-black px-3 text-[12px] font-bold text-white disabled:opacity-40"
              >
                {nativeShare ? (
                  <Share2 className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {nativeShare ? labels.share : labels.copy}
              </button>
              {sheetOpen.status === "closed" ? (
                <button
                  type="button"
                  disabled={busyId === sheetOpen.id}
                  onClick={() => onReopen(sheetOpen)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#ECFDF5] px-3 text-[12px] font-bold text-[#065F46] disabled:opacity-40"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  {labels.reopen}
                </button>
              ) : sheetOpen.status !== "revoked" ? (
                <button
                  type="button"
                  disabled={busyId === sheetOpen.id}
                  onClick={() => onStop(sheetOpen)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#FEF2F2] px-3 text-[12px] font-bold text-[#991B1B] disabled:opacity-40"
                >
                  <ShieldOff className="h-4 w-4" aria-hidden />
                  {labels.stop}
                </button>
              ) : (
                <div />
              )}
              {publicPageOpenable ? (
                <Link
                  href={withBrowseOrigin(sheetOpen.urlPath, "shares")}
                  className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#FAF6F1] px-3 text-[12px] font-bold text-[#1A1A1A] ring-1 ring-black/8"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  {labels.openPublicPage}
                </Link>
              ) : null}
              {sheetOpen.status === "active" || sheetOpen.status === "closed" ? (
                <button
                  type="button"
                  disabled={busyId === sheetOpen.id}
                  onClick={() => onRotate(sheetOpen)}
                  className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#FAF6F1] px-3 text-[12px] font-bold text-[#1A1A1A] ring-1 ring-black/8 disabled:opacity-40"
                >
                  <KeyRound className="h-4 w-4" aria-hidden />
                  {labels.rotate}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
