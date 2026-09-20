"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Database,
  Globe,
  LogOut,
  PanelLeft,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useI18n } from "@/components/I18nProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { resetSyncEngineSingleton } from "@/lib/sync";
import { setPersistenceAccountScope } from "@/lib/idb/draft-store";
import type { ViewingChatThread } from "@/lib/viewing-chat/types";

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
  recordsLabel,
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
  recordsLabel: string;
}) {
  const { messages, locale, setLocale } = useI18n();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(() => !isSupabaseConfigured());
  const [langOpen, setLangOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
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
      if (langRef.current && !langRef.current.contains(target)) setLangOpen(false);
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
      className={`flex h-full shrink-0 flex-col border-r border-black/8 bg-white py-3 transition-[width] duration-200 ease-out ${
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
          <p className="shrink-0 px-3 pb-1.5 text-[12px] font-bold text-[#6B7280]">
            {messages.chat.historyTitle}
          </p>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {recent.length === 0 ? (
              <li className="px-3 py-6 text-center text-[12px] text-[#6B7280]">
                {messages.chat.emptyHistory}
              </li>
            ) : (
              recent.map((thread) => {
                const active = thread.id === activeId;
                const preview =
                  [...thread.messages]
                    .reverse()
                    .find((m) => m.transcript || m.text)?.transcript ||
                  [...thread.messages].reverse().find((m) => m.text)?.text ||
                  "";
                return (
                  <li key={thread.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelectThread(thread.id)}
                      className={`w-full rounded-xl py-2.5 pl-3 pr-10 text-left ${
                        active ? "bg-[#EFF6FF]" : "hover:bg-[#FAF6F1]"
                      }`}
                    >
                      <p className="truncate text-[13px] font-bold text-[#1A1A1A]">
                        {thread.address || "—"}
                      </p>
                      {preview ? (
                        <p className="mt-0.5 truncate text-[11px] text-[#6B7280]">
                          {preview}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-[#9CA3AF]">
                        {new Date(thread.updatedAt).toLocaleString()}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteThread(thread.id);
                      }}
                      className="absolute right-1.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full text-[#9CA3AF] opacity-70 hover:bg-[#FEF2F2] hover:text-[#991B1B] group-hover:opacity-100"
                      aria-label={messages.chat.deleteHistory}
                      title={messages.chat.deleteHistory}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <Link
            href="/viewings"
            className="mt-2 flex h-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-[#FAF6F1] text-[12px] font-bold"
          >
            {recordsLabel}
          </Link>
        </div>
      ) : null}

      <div
        className={`mt-auto flex shrink-0 flex-col gap-1 ${expanded ? "border-t border-black/8 pt-2" : "items-center"}`}
      >
        <div className="relative w-full" ref={langRef}>
          <RailButton
            label={messages.language.label}
            active={langOpen}
            expanded={expanded}
            onClick={() => {
              setLangOpen((v) => !v);
              setProfileOpen(false);
            }}
          >
            <Globe className="h-5 w-5" strokeWidth={2} />
          </RailButton>
          {langOpen ? (
            <div
              className={`absolute z-50 min-w-[128px] rounded-2xl border border-black/10 bg-white p-1.5 shadow-lg ${
                expanded
                  ? "bottom-[calc(100%+6px)] left-0 right-0"
                  : "bottom-0 left-[calc(100%+8px)]"
              }`}
            >
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setLocale(code as Locale);
                    setLangOpen(false);
                  }}
                  className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-[12px] font-bold ${
                    locale === code ? "bg-[#EFF6FF] text-[#1D4ED8]" : "hover:bg-[#FAF6F1]"
                  }`}
                >
                  {LOCALE_LABELS[code]}
                </button>
              ))}
            </div>
          ) : null}
        </div>

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
          ) : !user ? (
            <RailButton
              label={messages.nav.signIn}
              href="/login"
              expanded={expanded}
            >
              <UserRound className="h-5 w-5" strokeWidth={2} />
            </RailButton>
          ) : (
            <>
              <RailButton
                label={profileLabel}
                active={profileOpen}
                expanded={expanded}
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setLangOpen(false);
                }}
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
                  <p className="truncate px-2 py-1.5 text-[11px] text-[#6B7280]">
                    {user.email}
                  </p>
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
                    <LogOut className="h-3.5 w-3.5" />
                    {messages.nav.signOut}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
