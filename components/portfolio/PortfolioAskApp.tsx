"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, History, Plus, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { DecisionStatusPicker } from "@/components/portfolio/DecisionStatusPicker";
import { AI_CONSENT_VERSION } from "@/lib/ai-boundary/client";
import {
  aiErrorUiCopyFromBoundary,
  mapAiErrorToUi,
} from "@/lib/ai-boundary/map-ai-error-ui";
import { track } from "@/lib/analytics/client";
import type { AskRewriteHint, AskScopeMode } from "@/lib/analytics/events";
import { COMPARE_LITE_MAX } from "@/lib/comparison/from-thread";
import { formatMessage } from "@/lib/i18n";
import { localPreferenceBlock } from "@/lib/viewing-chat/ai-preferences";
import { submitAiFeedback } from "@/lib/viewing-chat/submit-ai-feedback";
import {
  buildHistoryForAsk,
  buildPortfolioCorpus,
  createPortfolioSession,
  daysAgoIso,
  defaultPortfolioScope,
  DECISION_STATUSES,
  deletePortfolioSession,
  findLastUserQuestion,
  filterThreadsByScope,
  getActivePortfolioSessionId,
  getPortfolioSession,
  historyExcludingTrailingAssistant,
  listPortfolioSessions,
  mergeShareCommentsIntoCards,
  setActivePortfolioSessionId,
  startOfLocalDayIso,
  titleFromTurns,
  upsertPortfolioSession,
  type DecisionStatus,
  type PortfolioAskResult,
  type PortfolioChatTurn,
  type PortfolioFactCard,
  type PortfolioRewriteHint,
  type PortfolioScope,
  type PortfolioSession,
} from "@/lib/portfolio";
import {
  deletePortfolioSessionOnCloud,
  pullPortfolioSessionsFromCloud,
  pushPortfolioSessionToCloud,
} from "@/lib/portfolio/session-sync";
import { filterHistoryThreads } from "@/lib/viewing-chat/history-filter";
import {
  listLocalThreads,
  patchLocalThread,
} from "@/lib/viewing-chat/local-store";
import { buildChatStatePayload, pushViewingThread } from "@/lib/viewing-chat/cloud-push";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { shortenAddressLabel } from "@/lib/shorten-address";

const CONSENT_KEY = "kanfangji.chat.consentSession";
const VISIBLE_TURNS = 20;

function consentSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const existing = window.sessionStorage.getItem(CONSENT_KEY);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c_${Date.now()}`;
  window.sessionStorage.setItem(CONSENT_KEY, next);
  return next;
}

function newTurnId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function scopeChipText(
  scope: PortfolioScope,
  count: number,
  labels: {
    scopeChipAll: string;
    scopeChipTime: string;
    scopeChipIds: string;
    scopeChipStatus: string;
  },
): string {
  if (scope.mode === "ids") {
    return formatMessage(labels.scopeChipIds, { n: String(count) });
  }
  if (scope.mode === "time") {
    return formatMessage(labels.scopeChipTime, { n: String(count) });
  }
  if (scope.mode === "status") {
    return formatMessage(labels.scopeChipStatus, { n: String(count) });
  }
  return formatMessage(labels.scopeChipAll, { n: String(count) });
}

export function PortfolioAskApp() {
  const { messages: t, locale } = useI18n();
  const p = t.portfolio;
  const router = useRouter();
  const persistTimer = useRef<number | null>(null);

  const [threads, setThreads] = useState(() =>
    typeof window === "undefined" ? [] : listLocalThreads(),
  );
  const [session, setSession] = useState<PortfolioSession | null>(null);
  const [sessionList, setSessionList] = useState<PortfolioSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const [scope, setScope] = useState<PortfolioScope>(defaultPortfolioScope);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeHint, setScopeHint] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<PortfolioChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [draftTime, setDraftTime] = useState<"all" | "today" | "7d" | "30d">("all");
  const [draftQuery, setDraftQuery] = useState("");
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [draftStatuses, setDraftStatuses] = useState<DecisionStatus[]>([]);

  const refreshThreads = useCallback(() => {
    setThreads(listLocalThreads());
  }, []);

  const refreshSessionList = useCallback(() => {
    setSessionList(listPortfolioSessions());
  }, []);

  const persistSession = useCallback(
    (next: { scope?: PortfolioScope; turns?: PortfolioChatTurn[]; title?: string }) => {
      const base =
        session ??
        createPortfolioSession({
          scope: next.scope ?? scope,
          turns: next.turns ?? turns,
        });
      const saved = upsertPortfolioSession({
        ...base,
        scope: next.scope ?? base.scope,
        turns: next.turns ?? base.turns,
        title: next.title ?? titleFromTurns(next.turns ?? base.turns),
      });
      setSession(saved);
      setActivePortfolioSessionId(saved.id);
      refreshSessionList();

      if (persistTimer.current) window.clearTimeout(persistTimer.current);
      persistTimer.current = window.setTimeout(() => {
        if (!userId) return;
        void pushPortfolioSessionToCloud(saved);
      }, 600);
      return saved;
    },
    [refreshSessionList, scope, session, turns, userId],
  );

  useEffect(() => {
    refreshThreads();
    const activeId = getActivePortfolioSessionId();
    const existing = activeId ? getPortfolioSession(activeId) : null;
    if (existing) {
      setSession(existing);
      setScope(existing.scope ?? defaultPortfolioScope());
      setTurns(existing.turns);
    } else {
      const created = createPortfolioSession();
      setSession(created);
    }
    refreshSessionList();
  }, [refreshSessionList, refreshThreads]);

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    const source = from === "nav" || from === "tab" ? from : "direct";
    track({ name: "ask_opened", props: { source } });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      if (data.user) {
        void pullPortfolioSessionsFromCloud().then(() => {
          refreshSessionList();
          const activeId = getActivePortfolioSessionId();
          const existing = activeId ? getPortfolioSession(activeId) : null;
          if (existing) {
            setSession(existing);
            setScope(existing.scope ?? defaultPortfolioScope());
            setTurns(existing.turns);
          }
        });
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, authSession) => {
      setUserId(authSession?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, [refreshSessionList]);

  const scopedThreads = useMemo(
    () => filterThreadsByScope(threads, scope),
    [threads, scope],
  );
  const cards = useMemo(() => buildPortfolioCorpus(scopedThreads), [scopedThreads]);
  const addressFiltered = useMemo(
    () => filterHistoryThreads(threads, draftQuery).slice(0, 60),
    [threads, draftQuery],
  );

  const hiddenCount = showOlder ? 0 : Math.max(0, turns.length - VISIBLE_TURNS);
  const visibleTurns = showOlder ? turns : turns.slice(-VISIBLE_TURNS);

  function openScopeSheet() {
    if (scope.mode === "time" && scope.since) {
      const today = startOfLocalDayIso();
      const d7 = daysAgoIso(7);
      const d30 = daysAgoIso(30);
      if (scope.since === today) setDraftTime("today");
      else if (scope.since === d7) setDraftTime("7d");
      else if (scope.since === d30) setDraftTime("30d");
      else setDraftTime("all");
    } else {
      setDraftTime("all");
    }
    setDraftIds(scope.mode === "ids" ? [...(scope.viewingIds ?? [])] : []);
    setDraftStatuses(scope.mode === "status" ? [...(scope.statuses ?? [])] : []);
    setDraftQuery("");
    setScopeOpen(true);
  }

  function applyScope() {
    let next: PortfolioScope = defaultPortfolioScope();
    if (draftIds.length > 0) {
      next = { mode: "ids", viewingIds: draftIds };
    } else if (draftStatuses.length > 0) {
      next = { mode: "status", statuses: draftStatuses };
    } else if (draftTime === "today") {
      next = { mode: "time", since: startOfLocalDayIso() };
    } else if (draftTime === "7d") {
      next = { mode: "time", since: daysAgoIso(7) };
    } else if (draftTime === "30d") {
      next = { mode: "time", since: daysAgoIso(30) };
    }
    setScope(next);
    persistSession({ scope: next, turns });
    setScopeOpen(false);
    if (turns.length > 0) setScopeHint(true);
  }

  async function persistDecision(threadId: string, status: DecisionStatus | null) {
    patchLocalThread(threadId, { decisionStatus: status });
    refreshThreads();
    track({
      name: "decision_status_changed",
      props: { status: status ?? "none", surface: "ask" },
    });
    const thread = listLocalThreads().find((row) => row.id === threadId);
    if (!thread || !userId || thread.id.startsWith("local_")) return;
    if (thread.cloud?.state !== "synced" && thread.cloud?.state !== "syncing") return;
    try {
      await pushViewingThread({
        threadId: thread.id,
        address: thread.address,
        baseRevision: thread.cloud?.revision,
        previouslySynced: true,
        messages: thread.messages,
        chatState: buildChatStatePayload(thread),
        clientUpdatedAt: new Date().toISOString(),
        report: thread.report,
        metadata: thread.metadata,
      });
    } catch {
      /* local mark still saved */
    }
  }

  async function loadShareCommentsForCards(
    baseCards: PortfolioFactCard[],
  ): Promise<PortfolioFactCard[]> {
    if (!userId || baseCards.length === 0) return baseCards;
    const viewingIds = baseCards
      .map((card) => card.id)
      .filter((id) => !id.startsWith("local_"));
    if (viewingIds.length === 0) return baseCards;
    try {
      const response = await fetch("/api/portfolio/share-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewingIds }),
      });
      if (!response.ok) return baseCards;
      const data = (await response.json()) as {
        commentsByViewingId?: Record<string, unknown>;
      };
      return mergeShareCommentsIntoCards(baseCards, data.commentsByViewingId ?? {});
    } catch {
      return baseCards;
    }
  }

  async function runAsk(input: {
    question: string;
    historyTurns: PortfolioChatTurn[];
    rewriteHint?: PortfolioRewriteHint | null;
    replaceAssistantId?: string | null;
    appendUser?: boolean;
  }) {
    const q = input.question.trim();
    if (!q || busy) return;
    setError("");
    setScopeHint(false);

    let working = input.historyTurns;
    if (input.appendUser !== false && !input.replaceAssistantId) {
      const userTurn: PortfolioChatTurn = {
        id: newTurnId(),
        role: "user",
        text: q,
        createdAt: new Date().toISOString(),
      };
      working = [...working, userTurn];
      setTurns(working);
      setDraft("");
    }

    const userTurnId =
      [...working].reverse().find((turn) => turn.role === "user")?.id ?? null;
    const isRewrite = Boolean(input.rewriteHint);
    const rewriteHintTrack: AskRewriteHint = input.rewriteHint ?? "none";
    const scopeMode = (scope.mode ?? "all") as AskScopeMode;

    setBusy(true);
    try {
      const cardsWithComments = await loadShareCommentsForCards(cards);
      const homeCount = Math.min(40, Math.max(1, cardsWithComments.length || 1));
      const hasShareComments = cardsWithComments.some(
        (card) => card.shareComments.length > 0,
      );
      track({
        name: "ask_question_sent",
        props: {
          scope_mode: scopeMode,
          home_count: homeCount,
          has_share_comments: hasShareComments,
          is_rewrite: isRewrite,
          rewrite_hint: rewriteHintTrack,
        },
      });
      const response = await fetch("/api/portfolio/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          cards: cardsWithComments,
          history: buildHistoryForAsk(working),
          rewriteHint: input.rewriteHint ?? null,
          preferenceBlock: localPreferenceBlock("portfolio") || undefined,
          locale,
          consentVersion: AI_CONSENT_VERSION,
          consentSessionId: consentSessionId(),
          identityKind: userId ? "user" : "guest",
          scopeMode,
          sessionId: session?.id ?? null,
          turnId: userTurnId,
        }),
      });
      const data = (await response.json()) as PortfolioAskResult & {
        error?: string;
        code?: string;
        tier?: "guest" | "free" | "pro";
        limit?: "tier" | "network";
        resetsAt?: string | null;
      };
      if (!response.ok) {
        if (data.code === "ai_quota_exceeded" || response.status === 429) {
          track({
            name: "ai_quota_exceeded",
            props: {
              tier: data.tier ?? (userId ? "free" : "guest"),
              endpoint: "portfolio",
              limit: data.limit ?? "tier",
            },
          });
        }
        const ui = mapAiErrorToUi(
          {
            code: data.code,
            status: response.status,
            error: data.error,
            tier: data.tier,
            limit: data.limit,
            resetsAt: data.resetsAt,
          },
          aiErrorUiCopyFromBoundary(t.aiBoundary),
          { isAuthenticated: Boolean(userId), locale },
        );
        throw new Error(ui.message);
      }
      const matchedIds = data.matchedIds ?? [];
      track({
        name: "ask_answer_received",
        props: {
          matched_count: Math.min(40, matchedIds.length),
          suggest_compare: Boolean(data.suggestCompare),
          has_citations: (data.citations?.length ?? 0) > 0,
        },
      });
      const assistant: PortfolioChatTurn = {
        id: input.replaceAssistantId || newTurnId(),
        role: "assistant",
        text: data.answer,
        createdAt: new Date().toISOString(),
        matchedIds,
        citations: data.citations ?? [],
        suggestCompare: Boolean(data.suggestCompare),
        feedback: null,
      };
      const nextTurns = input.replaceAssistantId
        ? working.map((turn) => (turn.id === input.replaceAssistantId ? assistant : turn))
        : [...working, assistant];
      setTurns(nextTurns);
      persistSession({ turns: nextTurns, scope });
    } catch (err) {
      setError(err instanceof Error ? err.message : p.errorGeneric);
      persistSession({ turns: working, scope });
    } finally {
      setBusy(false);
    }
  }

  function ask(question: string) {
    void runAsk({ question, historyTurns: turns, appendUser: true });
  }

  function rewrite(hint: PortfolioRewriteHint) {
    track({ name: "ask_rewrite", props: { hint } });
    const withoutAssistant = historyExcludingTrailingAssistant(turns);
    const question = findLastUserQuestion(withoutAssistant);
    if (!question) return;
    const previousAssistant = turns[turns.length - 1];
    const replaceId =
      previousAssistant?.role === "assistant" ? previousAssistant.id : null;
    void runAsk({
      question,
      historyTurns: withoutAssistant,
      rewriteHint: hint,
      replaceAssistantId: replaceId,
      appendUser: false,
    });
  }

  async function rateAnswer(turnId: string, rating: "like" | "dislike") {
    const nextTurns = turns.map((turn) =>
      turn.id === turnId
        ? {
            ...turn,
            feedback: turn.feedback === rating ? null : rating,
          }
        : turn,
    );
    setTurns(nextTurns);
    persistSession({ turns: nextTurns, scope });
    const turn = nextTurns.find((row) => row.id === turnId);
    if (!turn?.feedback) return;
    track({ name: "ask_feedback", props: { rating: turn.feedback } });
    await submitAiFeedback({
      kind: "portfolio",
      rating: turn.feedback,
      artifactExcerpt: turn.text,
      identityKind: userId ? "user" : "guest",
    });
  }

  function startNewChat() {
    const created = createPortfolioSession({ scope: defaultPortfolioScope() });
    setSession(created);
    setScope(defaultPortfolioScope());
    setTurns([]);
    setError("");
    setScopeHint(false);
    setShowOlder(false);
    refreshSessionList();
  }

  function loadSession(id: string) {
    const existing = getPortfolioSession(id);
    if (!existing) return;
    setSession(existing);
    setActivePortfolioSessionId(existing.id);
    setScope(existing.scope ?? defaultPortfolioScope());
    setTurns(existing.turns);
    setHistoryOpen(false);
    setShowOlder(false);
    setError("");
  }

  async function removeSession(id: string) {
    deletePortfolioSession(id);
    if (userId) await deletePortfolioSessionOnCloud(id);
    refreshSessionList();
    if (session?.id === id) startNewChat();
  }

  function continueWithIds(ids: string[]) {
    if (ids.length === 0) return;
    const next = { mode: "ids" as const, viewingIds: ids };
    setScope(next);
    persistSession({ scope: next, turns });
    setScopeHint(true);
  }

  function openCompare(ids: string[]) {
    const clipped = ids.slice(0, COMPARE_LITE_MAX);
    if (clipped.length < 2) return;
    const count = clipped.length as 2 | 3 | 4 | 5;
    track({ name: "ask_compare_opened", props: { count } });
    track({ name: "compare_opened", props: { count, source: "ask" } });
    router.push(`/compare?ids=${clipped.map(encodeURIComponent).join(",")}`);
  }

  const examples = [
    p.exampleBudget,
    p.exampleRisk,
    p.examplePrefer,
    p.exampleSummary,
    p.exampleCompare,
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#FAFAF8] text-[#111]">
      <header className="sticky top-0 z-10 border-b border-black/8 bg-[#FAFAF8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#374151] hover:bg-black/5"
            aria-label={p.backHome}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-bold tracking-tight">{p.title}</h1>
            <p className="truncate text-[12px] text-[#6B7280]">
              {session?.title || p.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#374151] hover:bg-black/5"
            aria-label={p.historyOpen}
            title={p.historyOpen}
          >
            <History className="h-5 w-5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={startNewChat}
            className="flex h-10 items-center gap-1 rounded-2xl bg-black px-3 text-[12px] font-bold text-white"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            {p.newChat}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-4 pt-3">
        <button
          type="button"
          onClick={openScopeSheet}
          className="mb-3 self-start rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#111] shadow-sm touch-manipulation"
        >
          {scopeChipText(scope, scopedThreads.length, p)}
        </button>
        {scopeHint ? (
          <p className="mb-2 text-[12px] text-[#6B7280]">{p.scopeChangedHint}</p>
        ) : null}

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-4">
          {turns.length === 0 ? (
            <div className="flex flex-col gap-2 pt-6">
              {cards.length === 0 ? (
                <p className="text-[14px] leading-relaxed text-[#6B7280]">{p.emptyCorpus}</p>
              ) : (
                examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    disabled={busy}
                    onClick={() => ask(example)}
                    className="rounded-2xl border border-black/8 bg-white px-4 py-3 text-left text-[14px] font-medium text-[#111] shadow-sm touch-manipulation hover:bg-black/[0.02] disabled:opacity-50"
                  >
                    {example}
                  </button>
                ))
              )}
            </div>
          ) : null}

          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowOlder(true)}
              className="self-center text-[12px] font-semibold text-[#6B7280] underline"
            >
              {formatMessage(p.olderTurnsHidden, { n: String(hiddenCount) })}
            </button>
          ) : null}

          {visibleTurns.map((turn) => (
            <div
              key={turn.id}
              className={`max-w-[95%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${
                turn.role === "user"
                  ? "ml-auto bg-black text-white"
                  : "mr-auto border border-black/8 bg-white text-[#111] shadow-sm"
              }`}
            >
              <p className="whitespace-pre-wrap">{turn.text}</p>
              {turn.role === "assistant" && turn.matchedIds && turn.matchedIds.length > 0 ? (
                <div className="mt-3 space-y-2 border-t border-black/8 pt-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    {p.matchedHomes}
                  </p>
                  <ul className="space-y-2">
                    {turn.matchedIds.map((id) => {
                      const thread = threads.find((row) => row.id === id);
                      const title = shortenAddressLabel(
                        thread?.normalizedAddress || thread?.address || id,
                      );
                      return (
                        <li key={id} className="rounded-xl bg-black/[0.03] px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/viewings/${encodeURIComponent(id)}`}
                              className="min-w-0 flex-1 text-[13px] font-semibold text-[#111] underline-offset-2 hover:underline"
                            >
                              {title}
                            </Link>
                            <span className="shrink-0 text-[11px] text-[#9CA3AF]">
                              {p.openViewing}
                            </span>
                          </div>
                          {thread ? (
                            <div className="mt-2">
                              <DecisionStatusPicker
                                compact
                                value={thread.decisionStatus ?? null}
                                labels={{
                                  label: p.decisionLabel,
                                  none: p.decisionNone,
                                  liked: p.decisionLiked,
                                  shortlist: p.decisionShortlist,
                                  passed: p.decisionPassed,
                                  revisit: p.decisionRevisit,
                                }}
                                onChange={(next) => void persistDecision(id, next)}
                              />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => continueWithIds(turn.matchedIds!)}
                      className="rounded-full bg-black/5 px-3 py-1.5 text-[12px] font-semibold touch-manipulation"
                    >
                      {p.continueWithThese}
                    </button>
                    {(turn.suggestCompare ||
                      (turn.matchedIds.length >= 2 &&
                        turn.matchedIds.length <= COMPARE_LITE_MAX)) &&
                    turn.matchedIds.length >= 2 ? (
                      <button
                        type="button"
                        onClick={() => openCompare(turn.matchedIds!)}
                        className="rounded-full bg-black px-3 py-1.5 text-[12px] font-semibold text-white touch-manipulation"
                      >
                        {p.openCompare}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {turn.role === "assistant" &&
              turn.citations &&
              turn.citations.length > 0 ? (
                <div className="mt-3 border-t border-black/8 pt-3">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    {p.citations}
                  </p>
                  <ul className="space-y-1.5">
                    {turn.citations.map((cite, index) => (
                      <li key={`${cite.viewingId}-${index}`} className="text-[12px] text-[#4B5563]">
                        <Link
                          href={`/viewings/${encodeURIComponent(cite.viewingId)}`}
                          className="font-semibold text-[#111] underline-offset-2 hover:underline"
                        >
                          {shortenAddressLabel(
                            threads.find((row) => row.id === cite.viewingId)?.address ||
                              cite.viewingId,
                          )}
                        </Link>
                        <span className="text-[#9CA3AF]"> — </span>
                        {cite.excerpt}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {turn.role === "assistant" ? (
                <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-black/8 pt-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void rateAnswer(turn.id, "like")}
                    aria-label={p.feedbackUseful}
                    title={p.feedbackUseful}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                      turn.feedback === "like"
                        ? "bg-black text-white"
                        : "text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A]"
                    }`}
                    aria-pressed={turn.feedback === "like"}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void rateAnswer(turn.id, "dislike")}
                    aria-label={p.feedbackNotUseful}
                    title={p.feedbackNotUseful}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                      turn.feedback === "dislike"
                        ? "bg-black text-white"
                        : "text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A]"
                    }`}
                    aria-pressed={turn.feedback === "dislike"}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  {turns[turns.length - 1]?.id === turn.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => rewrite("retry")}
                        className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold"
                      >
                        {p.rewriteRetry}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => rewrite("shorter")}
                        className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold"
                      >
                        {p.rewriteShorter}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => rewrite("more_citations")}
                        className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold"
                      >
                        {p.rewriteMoreCitations}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => rewrite("matches_only")}
                        className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold"
                      >
                        {p.rewriteMatchesOnly}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {busy ? (
            <p className="text-[13px] font-medium text-[#6B7280]">{p.sending}</p>
          ) : null}
          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
          ) : null}
        </div>

        <form
          className="sticky bottom-0 flex gap-2 border-t border-black/8 bg-[#FAFAF8] pt-3"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
          onSubmit={(event) => {
            event.preventDefault();
            ask(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={p.inputPlaceholder}
            disabled={busy}
            className="min-h-11 flex-1 rounded-2xl border border-black/10 bg-white px-4 text-[14px] outline-none ring-black/20 focus:ring-2 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="min-h-11 shrink-0 rounded-2xl bg-black px-4 text-[14px] font-bold text-white disabled:opacity-40 touch-manipulation"
          >
            {busy ? p.sending : p.send}
          </button>
        </form>
      </main>

      {historyOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 md:items-center">
          <div
            role="dialog"
            aria-modal
            aria-label={p.historyTitle}
            className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl md:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-bold">{p.historyTitle}</h2>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sessionList.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[#6B7280]">{p.historyEmpty}</p>
            ) : (
              <ul className="space-y-1">
                {sessionList.map((row) => (
                  <li key={row.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-black/[0.03]">
                    <button
                      type="button"
                      onClick={() => loadSession(row.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-[14px] font-semibold">{row.title}</p>
                      <p className="text-[11px] text-[#9CA3AF]">
                        {new Date(row.updatedAt).toLocaleString()} · {row.turns.length}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeSession(row.id)}
                      className="text-[12px] font-semibold text-[#9CA3AF] hover:text-[#111]"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {scopeOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 md:items-center">
          <div
            role="dialog"
            aria-modal
            aria-label={p.scopeSheetTitle}
            className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl md:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-bold">{p.scopeSheetTitle}</h2>
              <button
                type="button"
                onClick={() => setScopeOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
                aria-label={p.backHome}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-2 text-[12px] font-semibold text-[#6B7280]">{p.scopeTimeAll}</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {(
                [
                  ["all", p.scopeTimeAll],
                  ["today", p.scopeTimeToday],
                  ["7d", p.scopeTime7d],
                  ["30d", p.scopeTime30d],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setDraftTime(key);
                    setDraftIds([]);
                  }}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                    draftTime === key && draftIds.length === 0 && draftStatuses.length === 0
                      ? "bg-black text-white"
                      : "bg-black/5 text-[#374151]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="mb-2 text-[12px] font-semibold text-[#6B7280]">{p.scopeStatusLabel}</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {DECISION_STATUSES.map((status) => {
                const active = draftStatuses.includes(status);
                const label =
                  status === "liked"
                    ? p.decisionLiked
                    : status === "shortlist"
                      ? p.decisionShortlist
                      : status === "passed"
                        ? p.decisionPassed
                        : p.decisionRevisit;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setDraftStatuses((prev) =>
                        prev.includes(status)
                          ? prev.filter((item) => item !== status)
                          : [...prev, status],
                      );
                      setDraftIds([]);
                    }}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                      active ? "bg-black text-white" : "bg-black/5 text-[#374151]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={p.scopeSearchPlaceholder}
              className="mb-2 w-full rounded-xl border border-black/10 px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-black/15"
            />
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                className="text-[12px] font-semibold text-[#111] underline"
                onClick={() => setDraftIds(addressFiltered.map((row) => row.id))}
              >
                {p.scopeSelectAll}
              </button>
              <button
                type="button"
                className="text-[12px] font-semibold text-[#6B7280] underline"
                onClick={() => setDraftIds([])}
              >
                {p.scopeClear}
              </button>
            </div>
            <ul className="mb-4 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-black/8 p-2">
              {addressFiltered.map((thread) => {
                const checked = draftIds.includes(thread.id);
                return (
                  <li key={thread.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-black/[0.03]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setDraftIds((prev) =>
                            prev.includes(thread.id)
                              ? prev.filter((id) => id !== thread.id)
                              : [...prev, thread.id],
                          );
                          setDraftStatuses([]);
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {shortenAddressLabel(thread.normalizedAddress || thread.address)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = defaultPortfolioScope();
                  setScope(next);
                  persistSession({ scope: next, turns });
                  setScopeOpen(false);
                  if (turns.length > 0) setScopeHint(true);
                }}
                className="flex-1 rounded-2xl border border-black/10 py-3 text-[14px] font-semibold"
              >
                {p.scopeReset}
              </button>
              <button
                type="button"
                onClick={applyScope}
                className="flex-1 rounded-2xl bg-black py-3 text-[14px] font-bold text-white"
              >
                {p.scopeApply}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
