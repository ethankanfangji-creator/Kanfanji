"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Database,
  LifeBuoy,
  LogIn,
  LogOut,
  Check,
  PanelLeft,
  Pin,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useI18n } from "@/components/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { resetSyncEngineSingleton } from "@/lib/sync";
import { setPersistenceAccountScope } from "@/lib/idb/draft-store";
import type { ViewingChatThread } from "@/lib/viewing-chat/types";
import { shortenAddressLabel } from "@/lib/shorten-address";
import { formatMessage } from "@/lib/i18n";
import { COMPARE_LITE_MAX } from "@/lib/comparison/from-thread";
import { CompareSelectionBar } from "@/components/viewing-chat/shell/CompareSelectionBar";

function supportMailto(locale: string, email?: string | null): string {
  const to =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@kanfangji.app";
  const subject = encodeURIComponent(`[Kanfangji] Support (${locale})`);
  const body = encodeURIComponent(
    [
      email ? `Account: ${email}` : "Account: guest",
      `Locale: ${locale}`,
      "",
      "Please describe the issue:",
      "",
    ].join("\n"),
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
function RailButton({
  label,
  active,
  onClick,
  href,
  expanded,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  expanded: boolean;
  children: ReactNode;
}) {
  const className = expanded
    ? `flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors ${
        active ? "bg-black text-white" : "text-[#374151] hover:bg-black/5"
      }`
    : `flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${
        active ? "bg-black text-white" : "text-[#374151] hover:bg-black/5"
      }`;

  const content = (
    <>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{children}</span>
      {expanded ? (
        <span className="truncate text-[13px] font-bold">{label}</span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={label} title={label}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      aria-label={label}
      title={label}
      aria-pressed={active}
    >
      {content}
    </button>
  );
}

export function IconRail({
  sidebarOpen,
  onToggleSidebar,
  onNew,
  onOpenSearch,
  onOpenMedia,
  searchOpen,
  mediaOpen,
  threads,
  activeId,
  onSelectThread,
  onDeleteThread,
  onTogglePinThread,
  compareMode,
  selectedIds,
  onToggleCompareMode,
  onToggleSelect,
  onOpenCompare,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNew: () => void;
  onOpenSearch: () => void;
  onOpenMedia: () => void;
  searchOpen?: boolean;
  mediaOpen?: boolean;
  threads: ViewingChatThread[];
  activeId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onTogglePinThread: (id: string) => void;
  compareMode: boolean;
  selectedIds: string[];
  onToggleCompareMode: () => void;
  onToggleSelect: (id: string) => void;
  onOpenCompare: () => void;
}) {
  const { messages, locale } = useI18n();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(() => !isSupabaseConfigured());
  const [profileOpen, setProfileOpen] = useState(false);
  const [maxHintShown, setMaxHintShown] = useState(false);
  const [seenCompareMode, setSeenCompareMode] = useState(compareMode);
  if (compareMode !== seenCompareMode) {
    setSeenCompareMode(compareMode);
    setMaxHintShown(false);
  }
  const profileRef = useRef<HTMLDivElement>(null);
  const expanded = sidebarOpen;
  const recent = threads.slice(0, 20);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.auth
      .getUser()
      .then(({ data }) => setUser(data.user))
      .catch(() => {
        setPersistenceAccountScope(null);
        setUser(null);
      })
      .finally(() => setReady(true));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const profileLabel = !user
    ? messages.nav.signIn
    : user.email || messages.nav.signOut;

  return (
    <nav
      className={`hidden h-full shrink-0 flex-col border-r border-black/8 bg-white py-3 transition-[width] duration-200 ease-out md:flex ${
        expanded ? "w-[240px] px-2.5" : "w-14 items-center"
      }`}
      aria-label="App controls"
    >
      <div className={`flex shrink-0 flex-col gap-1 ${expanded ? "" : "items-center"}`}>
        <RailButton
          label={messages.chat.toggleSidebar}
          active={sidebarOpen}
          expanded={expanded}
          onClick={onToggleSidebar}
        >
          <PanelLeft className="h-5 w-5" strokeWidth={2} />
        </RailButton>
        <RailButton
          label={messages.chat.newThread}
          expanded={expanded}
          onClick={onNew}
        >
          <Plus className="h-5 w-5" strokeWidth={2.25} />
        </RailButton>
        <RailButton
          label={messages.chat.searchRecords}
          active={searchOpen}
          expanded={expanded}
          onClick={onOpenSearch}
        >
          <Search className="h-5 w-5" strokeWidth={2} />
        </RailButton>
        <RailButton
          label={messages.chat.mediaLibrary}
          active={mediaOpen}
          expanded={expanded}
          onClick={onOpenMedia}
        >
          <Database className="h-5 w-5" strokeWidth={2} />
        </RailButton>
      </div>

      {expanded ? (
        <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-black/8 pt-2">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1.5">
            <p className="text-[12px] font-bold text-[#6B7280]">
              {messages.chat.historyTitle}
            </p>
            {threads.length >= 2 ? (
              <button
                type="button"
                onClick={onToggleCompareMode}
                className="inline-flex min-h-[var(--touch-target)] items-center rounded-full border border-black/10 px-2.5 text-[12px] font-bold"
              >
                {compareMode
                  ? messages.compareLite.compareCancel
                  : messages.compareLite.compareToggle}
              </button>
            ) : null}
          </div>
          {compareMode && maxHintShown ? (
            <p className="px-3 pb-1 text-[12px] font-semibold text-[#92400E]" role="status">
              {messages.compareLite.compareMaxReached}
            </p>
          ) : null}
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {recent.length === 0 ? (
              <li className="px-3 py-6 text-center text-[12px] text-[#6B7280]">
                {messages.chat.emptyHistory}
              </li>
            ) : (
              recent.map((thread) => {
                const active = thread.id === activeId;
                const selected = selectedIds.includes(thread.id);
                const locked =
                  compareMode && !selected && selectedIds.length >= COMPARE_LITE_MAX;
                const preview =
                  [...thread.messages]
                    .reverse()
                    .find((m) => m.transcript || m.text)?.transcript ||
                  [...thread.messages].reverse().find((m) => m.text)?.text ||
                  "";
                return (
                  <li key={thread.id} className={`group relative ${locked ? "opacity-40" : ""}`}>
                    <button
                      type="button"
                      role={compareMode ? "checkbox" : undefined}
                      aria-checked={compareMode ? selected : undefined}
                      aria-disabled={locked || undefined}
                      onClick={() => {
                        if (!compareMode) {
                          onSelectThread(thread.id);
                          return;
                        }
                        if (locked) {
                          setMaxHintShown(true);
                          return;
                        }
                        onToggleSelect(thread.id);
                      }}
                      className={`flex w-full items-start gap-2 rounded-xl py-2.5 pl-3 text-left ${
                        compareMode ? "pr-3" : "pr-16"
                      } ${!compareMode && active ? "bg-[#EFF6FF]" : "hover:bg-[#FAF6F1]"}`}
                    >
                      {compareMode ? (
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                            selected
                              ? "border-black bg-black text-white"
                              : "border-black/20 bg-white"
                          }`}
                          aria-hidden
                        >
                          {selected ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-[13px] font-bold text-[#1A1A1A]">
                        {thread.pinned ? (
                          <Pin
                            className="h-3 w-3 shrink-0 fill-current text-[#2563EB]"
                            aria-hidden
                          />
                        ) : null}
                        <span className="truncate" title={thread.address || undefined}>
                          {thread.address
                            ? shortenAddressLabel(thread.normalizedAddress || thread.address)
                            : "—"}
                        </span>
                      </p>
                      {preview ? (
                        <p className="mt-0.5 truncate text-[11px] text-[#6B7280]">
                          {preview}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-[#9CA3AF]">
                        {new Date(thread.updatedAt).toLocaleString()}
                      </p>
                      </span>
                    </button>
                    {compareMode ? null : (
                    <div className="absolute right-1 top-2 flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onTogglePinThread(thread.id);
                        }}
                        className={`flex h-8 w-8 items-center justify-center rounded-full opacity-70 hover:bg-[#EFF6FF] hover:text-[#2563EB] group-hover:opacity-100 ${
                          thread.pinned
                            ? "text-[#2563EB] opacity-100"
                            : "text-[#9CA3AF]"
                        }`}
                        aria-label={
                          thread.pinned
                            ? messages.chat.unpinHistory
                            : messages.chat.pinHistory
                        }
                        title={
                          thread.pinned
                            ? messages.chat.unpinHistory
                            : messages.chat.pinHistory
                        }
                      >
                        <Pin
                          className={`h-3.5 w-3.5 ${thread.pinned ? "fill-current" : ""}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteThread(thread.id);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[#9CA3AF] opacity-70 hover:bg-[#FEF2F2] hover:text-[#991B1B] group-hover:opacity-100"
                        aria-label={messages.chat.deleteHistory}
                        title={messages.chat.deleteHistory}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
          {compareMode ? (
            <CompareSelectionBar
              selectedText={formatMessage(messages.compareLite.compareSelectedCount, {
                n: selectedIds.length,
              })}
              openText={formatMessage(messages.compareLite.compareOpen, {
                n: selectedIds.length,
              })}
              disabled={selectedIds.length < 2}
              onOpen={onOpenCompare}
            />
          ) : null}
        </div>
      ) : null}

      <div
        className={`mt-auto flex shrink-0 flex-col gap-1 ${expanded ? "border-t border-black/8 pt-2" : "items-center"}`}
      >
        <div className="relative w-full" ref={profileRef}>
          {!ready ? (
            <span
              className={`block animate-pulse rounded-2xl bg-[#EFEAE4] ${
                expanded ? "h-11 w-full" : "h-11 w-11"
              }`}
              role="status"
              aria-label="Loading account"
            />
          ) : !isSupabaseConfigured() ? (
            <RailButton label="Supabase" expanded={expanded}>
              <UserRound className="h-5 w-5 text-[#991B1B]" />
            </RailButton>
          ) : (
            <>
              <RailButton
                label={profileLabel}
                active={profileOpen}
                expanded={expanded}
                onClick={() => setProfileOpen((v) => !v)}
              >
                <UserRound className="h-5 w-5" strokeWidth={2} />
              </RailButton>
              {profileOpen ? (
                <div
                  className={`absolute z-50 min-w-[180px] rounded-2xl border border-black/10 bg-white p-2 shadow-lg ${
                    expanded
                      ? "bottom-[calc(100%+6px)] left-0 right-0"
                      : "bottom-0 left-[calc(100%+8px)]"
                  }`}
                >
                  {user ? (
                    <p className="truncate px-2 py-1.5 text-[11px] text-[#6B7280]">
                      {user.email}
                    </p>
                  ) : null}

                  <div className="px-1 py-1">
                    <LanguageSwitcher className="w-full" />
                  </div>

                  <div className="my-1 border-t border-black/8" />

                  <a
                    href={supportMailto(locale, user?.email)}
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[12px] font-bold hover:bg-[#FAF6F1]"
                  >
                    <LifeBuoy className="h-3.5 w-3.5 shrink-0" />
                    {messages.nav.contactSupport}
                  </a>
                  {user ? (
                    <button
                      type="button"
                      onClick={() => {
                        const supabase = getSupabase();
                        void supabase?.auth.signOut().then(() => {
                          resetSyncEngineSingleton();
                          setPersistenceAccountScope(null);
                          setProfileOpen(false);
                          router.replace("/login");
                        });
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[12px] font-bold hover:bg-[#FAF6F1]"
                    >
                      <LogOut className="h-3.5 w-3.5 shrink-0" />
                      {messages.nav.signOut}
                    </button>
                  ) : (
                    <Link
                      href="/login"
                      onClick={() => setProfileOpen(false)}
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[12px] font-bold hover:bg-[#FAF6F1]"
                    >
                      <LogIn className="h-3.5 w-3.5 shrink-0" />
                      {messages.nav.signIn}
                    </Link>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
