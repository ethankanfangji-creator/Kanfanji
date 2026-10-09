"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Camera, MapPin, Search, Video } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { formatMessage } from "@/lib/i18n";
import { displayViewingTag } from "@/components/portfolio/ViewingTagsPicker";
import {
  collectFrequentViewingTags,
  normalizeTagKey,
} from "@/lib/portfolio/viewing-tags";
import { shortenAddressLabel } from "@/lib/shorten-address";
import {
  filterAndSortViewings,
  type ViewingListSort,
  type ViewingListTagFilter,
} from "@/lib/viewings/list-filter";
import {
  viewingListCover,
  type ViewingListItem,
} from "@/lib/viewings/list-item";
import { ViewingMapCover } from "@/components/viewings/ViewingMapCover";
import {
  BrowseLayoutToggle,
  browseCardClass,
  browseCoverClass,
  browseListClass,
  useBrowseLayout,
  useBrowseLayoutWide,
} from "@/components/ui/BrowseLayoutToggle";

const FREQUENT_FILTER_LIMIT = 8;

function formatWhen(iso: string, locale: string) {
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

function CardCover({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <MapPin className="h-4 w-4 text-[#9CA3AF] sm:h-5 sm:w-5" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
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
      className={`inline-flex min-h-[var(--touch-target)] shrink-0 items-center rounded-full px-3.5 text-[12px] font-semibold transition ${
        active
          ? "bg-black text-white"
          : "bg-black/5 text-[#374151] hover:bg-black/10"
      }`}
    >
      {children}
    </button>
  );
}

export function ViewingsIndex({
  viewings,
  loading,
  error,
}: {
  viewings: ViewingListItem[];
  loading: boolean;
  error: string;
}) {
  const { locale, messages } = useI18n();
  const v = messages.viewings;
  const p = messages.portfolio;
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<ViewingListTagFilter>("all");
  const [hasReportOnly, setHasReportOnly] = useState(false);
  const [sort, setSort] = useState<ViewingListSort>("updated_desc");
  const [layout, setLayout] = useBrowseLayout();
  const layoutWide = useBrowseLayoutWide();
  const effectiveLayout = layoutWide ? layout : "list";

  const displayLabels = useMemo(
    () => ({
      liked: p.decisionLiked,
      shortlist: p.decisionShortlist,
      passed: p.decisionPassed,
      revisit: p.decisionRevisit,
    }),
    [p.decisionLiked, p.decisionPassed, p.decisionRevisit, p.decisionShortlist],
  );

  const frequentTags = useMemo(
    () =>
      collectFrequentViewingTags(viewings, {
        limit: FREQUENT_FILTER_LIMIT,
      }),
    [viewings],
  );

  // Drop stale tag filter when that tag no longer appears in the list.
  useEffect(() => {
    if (tagFilter === "all") return;
    const stillPresent = frequentTags.some(
      (tag) => normalizeTagKey(tag) === normalizeTagKey(tagFilter),
    );
    if (!stillPresent) setTagFilter("all");
  }, [frequentTags, tagFilter]);

  const filtered = useMemo(
    () =>
      filterAndSortViewings(viewings, {
        query,
        tag: tagFilter,
        hasReportOnly,
        sort,
      }),
    [viewings, query, tagFilter, hasReportOnly, sort],
  );

  const filtersActive =
    Boolean(query.trim()) || tagFilter !== "all" || hasReportOnly;

  return (
    <div className="space-y-4">
      <div
        className="sticky top-0 z-10 -mx-1 space-y-3 bg-[var(--color-canvas)]/95 px-1 pb-2 backdrop-blur"
        style={{ paddingTop: "max(0.25rem, env(safe-area-inset-top, 0px))" }}
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={v.searchPlaceholder}
            className="h-11 w-full rounded-full border border-black/10 bg-white pl-10 pr-4 text-[14px] outline-none focus:border-black/25 focus:ring-2 focus:ring-black/5"
          />
        </div>

        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip active={tagFilter === "all"} onClick={() => setTagFilter("all")}>
            {v.filterAll}
          </Chip>
          {frequentTags.map((tag) => {
            const active = normalizeTagKey(tagFilter) === normalizeTagKey(tag);
            return (
              <Chip
                key={tag}
                active={active}
                onClick={() => setTagFilter(active ? "all" : tag)}
              >
                {displayViewingTag(tag, displayLabels)}
              </Chip>
            );
          })}
          <Chip
            active={hasReportOnly}
            onClick={() => setHasReportOnly((current) => !current)}
          >
            {v.filterHasReport}
          </Chip>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <BrowseLayoutToggle
              layout={layout}
              onChange={setLayout}
              labels={{ list: v.layoutList, grid: v.layoutGrid }}
            />
            <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#6B7280]">
              <span className="sr-only">{v.sortLabel}</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as ViewingListSort)}
                className="min-h-[var(--touch-target)] rounded-full border border-black/10 bg-white px-2.5 text-[12px] font-semibold text-[#374151] outline-none"
                aria-label={v.sortLabel}
              >
                <option value="updated_desc">{v.sortUpdated}</option>
                <option value="address_asc">{v.sortAddress}</option>
              </select>
            </label>
          </div>
        </div>

        {!loading && viewings.length > 0 ? (
          <p className="text-[12px] font-semibold text-[#6B7280]">
            {filtersActive && filtered.length !== viewings.length
              ? `${filtered.length} / ${formatMessage(v.countLabel, { n: viewings.length })}`
              : formatMessage(v.countLabel, { n: filtered.length })}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-[13px] text-[#991B1B]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-[13px] font-semibold text-[#6B7280]">
          {v.loading}
        </p>
      ) : null}

      {!loading && !error && viewings.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.05] bg-white p-6 text-center shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <p className="text-[15px] font-bold">{v.empty}</p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center rounded-full bg-black px-4 text-[13px] font-bold text-white"
          >
            {messages.brand.name}
          </Link>
        </div>
      ) : null}

      {!loading && !error && viewings.length > 0 && filtered.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.05] bg-white p-6 text-center">
          <p className="text-[14px] font-semibold text-[#6B7280]">{v.emptySearch}</p>
          {filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTagFilter("all");
                setHasReportOnly(false);
              }}
              className="mt-3 text-[13px] font-bold underline"
            >
              {v.filterAll}
            </button>
          ) : null}
        </div>
      ) : null}

      <ul className={browseListClass(effectiveLayout)}>
        {filtered.map((viewing) => {
          const cover = viewingListCover(viewing);
          const photoCount = viewing.photo_urls.length;
          const videoCount = viewing.video_urls.length;
          return (
            <li key={viewing.id}>
              <Link
                href={`/viewings/${viewing.id}?from=viewings`}
                className={browseCardClass(effectiveLayout)}
              >
                <div className={browseCoverClass(effectiveLayout)}>
                  {cover.kind === "map" ? (
                    <ViewingMapCover lat={cover.lat} lng={cover.lng} />
                  ) : (
                    <CardCover src={cover.kind === "photo" ? cover.url : null} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[13px] font-bold leading-snug text-[#1A1A1A] sm:text-[14px]"
                    title={viewing.address}
                  >
                    {shortenAddressLabel(viewing.address, 48)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#8A8A8A]">
                    {formatWhen(viewing.updated_at, locale)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#6B7280]">
                    {(viewing.tags?.length
                      ? viewing.tags
                      : viewing.decisionStatus
                        ? [viewing.decisionStatus]
                        : []
                    )
                      .slice(0, 3)
                      .map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 font-semibold text-[#374151]"
                        >
                          {displayViewingTag(tag, displayLabels)}
                        </span>
                      ))}
                    {viewing.hasReport ? (
                      <span className="rounded-full bg-black/5 px-1.5 py-0.5 font-semibold">
                        {v.filterHasReport}
                      </span>
                    ) : null}
                    {photoCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5" title={v.photos}>
                        <Camera className="h-3 w-3" aria-hidden /> {photoCount}
                      </span>
                    ) : null}
                    {videoCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5" title={v.videos}>
                        <Video className="h-3 w-3" aria-hidden /> {videoCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
