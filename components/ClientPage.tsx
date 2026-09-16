"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  List,
  Mic,
  Share2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { ClientAuthBar } from "@/components/ClientAuthBar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { MediaPermissionBanner } from "@/components/media/MediaPermissionBanner";
import { PermissionPreflight } from "@/components/media/PermissionPreflight";
import { AudioNotePlayer } from "@/components/media/AudioNotePlayer";
import { RecordingMarkerBar } from "@/components/media/RecordingMarkerBar";
import { FieldChecklistPanel } from "@/components/viewing-wizard/FieldChecklistPanel";
import { PhotoAnnotator } from "@/components/viewing-wizard/PhotoAnnotator";
import { StepSetup } from "@/components/viewing-wizard/StepSetup";
import { StepShare } from "@/components/viewing-wizard/StepShare";
import { WizardBottomNav, WizardStepper } from "@/components/viewing-wizard/WizardStepper";
import { DecisionSummaryCard } from "@/components/share-card/DecisionSummaryCard";
import { SharePrivacyCheck } from "@/components/share-card/SharePrivacyCheck";
import { PdfExportButton } from "@/components/pdf/PdfExportButton";
import { useI18n } from "@/components/I18nProvider";
import {
  buildCardFromViewing,
  isDecisionSummarySnapshot,
  setOverallRating,
  togglePhotoSelection,
  toggleTextSelection,
  toPublicDecisionSummary,
  updateTextItem,
  type DecisionSummarySnapshot,
} from "@/lib/share-card";
import type { ShareLinkRecord } from "@/lib/share-access/types";
import { bankQuestions } from "@/lib/i18n";
import {
  attachMediaToMarkers,
  canAddMarkerNow,
  createAudioMarker,
  removeAudioMarker,
  serializeMarkersForAi,
  updateAudioMarker,
  type AudioMarker,
  type AudioMarkerTagId,
} from "@/lib/audio-markers";
import {
  claimsToLegacyStrings,
  softDeleteClaim,
  updateClaimText,
  validateAndNormalizeSummary,
  type ViewingAiSummary,
} from "@/lib/ai-summary";
import { AiSummaryPanel } from "@/components/media/AiSummaryPanel";
import {
  createCustomChecklistItem,
  createImageThumbnail,
  ensureFieldChecklist,
  normalizePhotoTagId,
  PHOTO_TAG_IDS,
  type FieldChecklistItem,
  type PhotoTagId,
} from "@/lib/field-capture";
import {
  deleteMedia,
  emptyDraft,
  getActiveDraft,
  getMedia,
  listMedia,
  putActiveDraft,
  putMedia,
  saveBlobAsMedia,
  updateMediaFields,
} from "@/lib/idb/draft-store";
import { createEntityId } from "@/lib/draft-db";
import { createSignedMediaUrl, extensionFor } from "@/lib/media";
import {
  createBrowserMediaPermissionAdapter,
  type CaptureKind,
  type MediaPermissionStatus,
} from "@/lib/media-permissions";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getSyncEngine, syncStatusToUi, type SessionUiStatus } from "@/lib/sync";
import {
  canEnterStep,
  canGenerateShareCard,
  fromDatetimeLocalValue,
  getShareChecklist,
  getStepStatus,
  isStep1Complete,
  mirrorSetupIntoPropertyDraft,
  toDatetimeLocalValue,
  type WizardStep,
} from "@/lib/viewing-wizard/readiness";
import type { User } from "@supabase/supabase-js";

type Question = {
  id: number;
  text: string;
  checked: boolean;
  answer?: string;
  isFollowUp?: boolean;
  basedOn?: string;
  isDynamic?: boolean;
  source?: "photo" | "audio" | "opendata" | string;
};

type AudioNote = {
  id: number;
  duration: number;
  transcript: string;
  matched: number[];
  mediaId?: string;
  kind?: "transcript" | "text";
  markers?: AudioMarker[];
};

type Clip = {
  id: number;
  label: string;
  time: string;
  durationSec?: number;
  url?: string;
  file?: Blob;
  mediaId?: string;
  remotePath?: string;
};

type Photo = {
  id: number;
  /** Full-resolution object URL (lazy; used when expanded). */
  url?: string;
  /** Thumbnail object URL for grid (preferred in list). */
  thumbUrl?: string;
  tag: string;
  tagId: PhotoTagId;
  note: string;
  file?: File;
  mediaId?: string;
  remotePath?: string;
};

const FREE_VIEWING_LIMIT = 3;

export function ClientPage() {
  const { locale, messages, t } = useI18n();
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [address, setAddress] = useState("");
  const [viewingAt, setViewingAt] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [priceLabel, setPriceLabel] = useState("");
  const [layoutLabel, setLayoutLabel] = useState("");
  const [areaLabel, setAreaLabel] = useState("");
  const [managementFeeLabel, setManagementFeeLabel] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [setupNotes, setSetupNotes] = useState("");
  const [textNoteDraft, setTextNoteDraft] = useState("");
  const [lookupError, setLookupError] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const [activeClipId, setActiveClipId] = useState<number | null>(null);
  const [expandedPhotoId, setExpandedPhotoId] = useState<number | null>(null);
  const [editingCard, setEditingCard] = useState(false);
  const [fieldChecklist, setFieldChecklist] = useState<FieldChecklistItem[]>([]);
  const [liveMarkers, setLiveMarkers] = useState<AudioMarker[]>([]);
  const [aiSummary, setAiSummary] = useState<ViewingAiSummary | null>(null);
  const [audioPlaybackUrls, setAudioPlaybackUrls] = useState<Record<number, string>>({});
  const [annotatingPhotoId, setAnnotatingPhotoId] = useState<number | null>(null);
  const [annotateTagId, setAnnotateTagId] = useState<PhotoTagId>("other");
  const [annotateNote, setAnnotateNote] = useState("");
  const [preflightKind, setPreflightKind] = useState<CaptureKind | null>(null);
  const [preflightStatus, setPreflightStatus] = useState<MediaPermissionStatus | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [permissionBanner, setPermissionBanner] = useState<{
    status: MediaPermissionStatus;
    message: string;
  } | null>(null);
  const [resumePendingAudio, setResumePendingAudio] = useState<{
    mediaId: string;
    durationSec: number;
    markers?: AudioMarker[];
  } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [identified, setIdentified] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [marketCode, setMarketCode] = useState<"CA" | "TH" | "OTHER">("CA");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [bankCollapsed, setBankCollapsed] = useState(false);
  const [audioState, setAudioState] = useState<"idle" | "recording" | "processing">("idle");
  const [audioSeconds, setAudioSeconds] = useState(0);
  const [notes, setNotes] = useState<AudioNote[]>([]);
  const [pros, setPros] = useState<string[]>(messages.defaults.pros);
  const [risks, setRisks] = useState<string[]>(messages.defaults.risks);
  const audioTimer = useRef<number | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioStartedAtRef = useRef(0);
  const audioDiscardRef = useRef(false);
  const audioMimeRef = useRef("audio/webm");
  const markerCooldownRef = useRef(0);
  const liveMarkersRef = useRef<AudioMarker[]>([]);
  const captureLockRef = useRef<CaptureKind | null>(null);
  const permissionAdapterRef = useRef(createBrowserMediaPermissionAdapter());
  const [clips, setClips] = useState<Clip[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const photosRef = useRef<Photo[]>([]);
  const clipsRef = useRef<Clip[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const audioImportInput = useRef<HTMLInputElement>(null);
  const [showCard, setShowCard] = useState(false);
  const [cardDraft, setCardDraft] = useState<DecisionSummarySnapshot | null>(null);
  const [showPrivacyCheck, setShowPrivacyCheck] = useState(false);
  const [privacyAction, setPrivacyAction] = useState<"copy" | "share" | null>(null);
  const [showLoginGate, setShowLoginGate] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [syncingCard, setSyncingCard] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [shareLink, setShareLink] = useState<ShareLinkRecord | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [sessionUiStatus, setSessionUiStatus] = useState<SessionUiStatus | null>(null);
  const [propertyDraft, setPropertyDraft] = useState<Record<string, unknown>>({});
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMode, setLoginMode] = useState<"signin" | "signup">("signin");
  const [loginError, setLoginError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [freeCount, setFreeCount] = useState(0);
  const [isPro, setIsPro] = useState(false);
  const clientUpdatedAtRef = useRef(new Date().toISOString());
  const autosaveTimer = useRef<number | null>(null);
  const draftHydratedRef = useRef(false);
  const persistGenerationRef = useRef(0);
  const notesRef = useRef<AudioNote[]>([]);
  const draftSessionIdRef = useRef<string | null>(null);
  const mediaUrlsReadyRef = useRef(false);
  const pendingMediaRef = useRef<
    Array<{
      id: string;
      kind: "photo" | "video";
      clientNumericId: number;
      label: string;
      mimeType: string;
      createdAt: string;
      blob: Blob;
      thumbBlob?: Blob | null;
      remotePath: string | null;
      uploadStatus: string;
      tagId?: string;
      note?: string;
    }>
  >([]);
  const draftSnapshotRef = useRef({
    address: "",
    tags: [] as string[],
    marketCode: "CA" as "CA" | "TH" | "OTHER",
    identified: false,
    questions: [] as Question[],
    notes: [] as AudioNote[],
    pros: [] as string[],
    risks: [] as string[],
    propertyDraft: {} as Record<string, unknown>,
    viewingId: null as string | null,
    shareToken: null as string | null,
    localSessionId: null as string | null,
    wizardStep: 1 as WizardStep,
    viewingAt: "",
    unitLabel: "",
    priceLabel: "",
    layoutLabel: "",
    areaLabel: "",
    managementFeeLabel: "",
    listingUrl: "",
    setupNotes: "",
    fieldChecklist: [] as FieldChecklistItem[],
    liveAudioMarkers: [] as AudioMarker[],
    aiSummary: null as ViewingAiSummary | null,
  });

  const configured = isSupabaseConfigured();
  const market = marketCode === "TH" ? "TH" : "CA";

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load owner share-link metadata once a cloud viewing exists.
  useEffect(() => {
    if (!user || !viewingId || !configured) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/share/links?viewingId=${encodeURIComponent(viewingId)}`);
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as { link?: ShareLinkRecord | null };
        if (cancelled) return;
        if (payload.link) {
          setShareLink(payload.link);
          if (payload.link.token) {
            setShareToken(payload.link.token);
            setShareUrl(`${window.location.origin}/s/${payload.link.token}`);
          } else if (payload.link.status === "revoked") {
            setShareToken(null);
            setShareUrl("");
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, viewingId, configured]);

  // Resume recoverable sync queue after login / page reopen (drain only; no silent create).
  useEffect(() => {
    if (!user || !draftReady || !configured) return;
    let cancelled = false;
    void (async () => {
      try {
        const draft = await getActiveDraft();
        if (draft?.localSessionId) draftSessionIdRef.current = draft.localSessionId;
        const engine = await getSyncEngine({ isPro });
        const result = await engine.processQueue();
        if (cancelled) return;
        if (draftSessionIdRef.current) {
          await refreshSessionUi(draftSessionIdRef.current);
          const session = await engine.getSession(draftSessionIdRef.current);
          if (session?.remoteViewingId) setViewingId(session.remoteViewingId);
        }
        if (result.skippedOffline) {
          setSyncMessage("目前離線，變更已保存在本機，恢復網路後會繼續同步");
        } else if (result.processed > 0) {
          setSyncMessage(
            result.failed > 0 || result.conflicts > 0
              ? "同步佇列已恢復，仍有項目待處理"
              : "同步佇列已恢復完成",
          );
        }
      } catch (error) {
        if (!cancelled) {
          setSyncMessage(error instanceof Error ? error.message : "恢復同步失敗");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, draftReady, configured]);

  // When network returns, continue pending uploads.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      if (!user || !draftReady) return;
      void (async () => {
        try {
          const engine = await getSyncEngine({ isPro });
          await engine.processQueue();
          if (draftSessionIdRef.current) await refreshSessionUi(draftSessionIdRef.current);
        } catch (error) {
          setSyncMessage(error instanceof Error ? error.message : "恢復網路後同步失敗");
        }
      })();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, draftReady, isPro]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !user) {
      let active = true;
      queueMicrotask(() => {
        if (!active) return;
        setFreeCount(0);
        setIsPro(false);
      });
      return () => {
        active = false;
      };
    }

    let cancelled = false;
    void (async () => {
      const [{ count }, { data: sub }] = await Promise.all([
        supabase
          .from("viewings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("subscriptions")
          .select("status, plan")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setFreeCount(count ?? 0);
      setIsPro(sub?.status === "active" || sub?.status === "trialing");
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    let active = true;
    if (params.get("checkout") === "success") {
      queueMicrotask(() => {
        if (!active) return;
        setIsPro(true);
        setShowPaywall(false);
        setSyncMessage("Pro 訂閱處理中，刷新後生效");
      });
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    liveMarkersRef.current = liveMarkers;
  }, [liveMarkers]);

  // Keep latest draft fields for flush without stale closures.
  useEffect(() => {
    draftSnapshotRef.current = {
      address,
      tags,
      marketCode,
      identified,
      questions,
      notes,
      pros,
      risks,
      propertyDraft,
      viewingId,
      shareToken,
      localSessionId: draftSessionIdRef.current,
      wizardStep,
      viewingAt,
      unitLabel,
      priceLabel,
      layoutLabel,
      areaLabel,
      managementFeeLabel,
      listingUrl,
      setupNotes,
      fieldChecklist,
      liveAudioMarkers: liveMarkers,
      aiSummary,
    };
  }, [
    address,
    tags,
    marketCode,
    identified,
    questions,
    notes,
    pros,
    risks,
    propertyDraft,
    viewingId,
    shareToken,
    wizardStep,
    viewingAt,
    unitLabel,
    priceLabel,
    layoutLabel,
    areaLabel,
    managementFeeLabel,
    listingUrl,
    setupNotes,
    fieldChecklist,
    liveMarkers,
    aiSummary,
  ]);

  async function ensureLocalSessionId(): Promise<string> {
    if (draftSessionIdRef.current) return draftSessionIdRef.current;
    const existing = await getActiveDraft();
    if (existing?.localSessionId) {
      draftSessionIdRef.current = existing.localSessionId;
      return existing.localSessionId;
    }
    const id = createEntityId();
    draftSessionIdRef.current = id;
    return id;
  }

  async function refreshSessionUi(sessionId?: string | null) {
    const id = sessionId ?? draftSessionIdRef.current;
    if (!id) {
      setSessionUiStatus(
        user
          ? syncStatusToUi("pending")
          : syncStatusToUi("local_only"),
      );
      return;
    }
    try {
      const engine = await getSyncEngine({ isPro });
      const ui = await engine.getSessionUiStatus(id);
      setSessionUiStatus(ui ?? syncStatusToUi(user ? "pending" : "local_only"));
    } catch {
      setSessionUiStatus(syncStatusToUi(user ? "pending" : "local_only"));
    }
  }

  async function flushDraftToIdb(
    patch?: Partial<{
      address: string;
      tags: string[];
      marketCode: "CA" | "TH" | "OTHER";
      identified: boolean;
      questions: Question[];
      notes: AudioNote[];
      pros: string[];
      risks: string[];
      propertyDraft: Record<string, unknown>;
      viewingId: string | null;
      shareToken: string | null;
      localSessionId: string | null;
      syncStatus: SessionUiStatus["status"] | "local" | "pending_upload" | "error";
      lastError: string | null;
      wizardStep: WizardStep;
      viewingAt: string;
      unitLabel: string;
      priceLabel: string;
      layoutLabel: string;
      listingUrl: string;
      setupNotes: string;
      areaLabel: string;
      managementFeeLabel: string;
      fieldChecklist: FieldChecklistItem[];
      liveAudioMarkers: AudioMarker[];
      aiSummary: ViewingAiSummary | null;
    }>,
  ) {
    if (!draftHydratedRef.current) return;
    if (patch) {
      draftSnapshotRef.current = { ...draftSnapshotRef.current, ...patch };
      if (patch.localSessionId) draftSessionIdRef.current = patch.localSessionId;
    }
    try {
      const snap = draftSnapshotRef.current;
      const existing = (await getActiveDraft()) ?? emptyDraft();
      const now = new Date().toISOString();
      clientUpdatedAtRef.current = now;
      const localSessionId =
        snap.localSessionId || draftSessionIdRef.current || existing.localSessionId || null;
      const propertyDraft = {
        ...mirrorSetupIntoPropertyDraft(snap.propertyDraft, {
          viewingAt: snap.viewingAt,
          unitLabel: snap.unitLabel,
          priceLabel: snap.priceLabel,
          layoutLabel: snap.layoutLabel,
          listingUrl: snap.listingUrl,
          setupNotes: snap.setupNotes,
          areaLabel: snap.areaLabel,
          managementFeeLabel: snap.managementFeeLabel,
        }),
        fieldChecklist: snap.fieldChecklist,
        aiSummary: snap.aiSummary,
      };
      await putActiveDraft({
        ...existing,
        localSessionId,
        address: snap.address,
        tags: snap.tags,
        market: snap.marketCode,
        identified: snap.identified,
        questions: snap.questions,
        notes: snap.notes,
        pros: snap.pros,
        risks: snap.risks,
        propertyDraft,
        remoteViewingId: snap.viewingId,
        shareToken: snap.shareToken,
        clientUpdatedAt: now,
        syncStatus: patch?.syncStatus ?? (snap.viewingId ? "pending" : "local_only"),
        lastError: patch?.lastError ?? null,
        wizardStep: snap.wizardStep,
        viewingAt: snap.viewingAt,
        unitLabel: snap.unitLabel,
        priceLabel: snap.priceLabel,
        layoutLabel: snap.layoutLabel,
        listingUrl: snap.listingUrl,
        setupNotes: snap.setupNotes,
        fieldChecklist: snap.fieldChecklist,
        liveAudioMarkers: snap.liveAudioMarkers,
        aiSummary: snap.aiSummary,
      });
      if (!sessionUiStatus || sessionUiStatus.status === "local_only" || !user) {
        setSessionUiStatus(syncStatusToUi(snap.viewingId && user ? "pending" : "local_only"));
      }
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "本機草稿儲存失敗");
    }
  }

  /**
   * Bridge UI/lib/idb draft → DraftDb, enqueue syncQueue, process per-item uploads.
   * Uses existing Supabase helpers via ViewingSyncAdapter (no new HTTP routes).
   */
  async function syncViaQueue(options?: { openCard?: boolean }) {
    const engine = await getSyncEngine({ isPro });
    const sessionId = await ensureLocalSessionId();
    const mediaRows = await listMedia();
    const snap = draftSnapshotRef.current;

    await engine.importActiveDraft({
      sessionId,
      userId: user?.id ?? null,
      remoteViewingId: snap.viewingId,
      shareToken: snap.shareToken,
      address: snap.address.trim(),
      tags: snap.tags,
      market: snap.marketCode,
      identified: snap.identified,
      questions: snap.questions,
      notes: snap.notes,
      pros: snap.pros,
      risks: snap.risks,
      propertyDraft: snap.propertyDraft,
      clientUpdatedAt: clientUpdatedAtRef.current,
      isPro,
      media: mediaRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        label: row.label,
        mimeType: row.mimeType,
        size: row.size,
        blob: row.blob,
        remotePath: row.remotePath,
        uploadStatus: row.uploadStatus,
        durationSec: null,
      })),
    });

    if (!user) {
      await flushDraftToIdb({ localSessionId: sessionId, syncStatus: "local_only" });
      await refreshSessionUi(sessionId);
      return { sessionId, skippedOffline: true as const, remoteViewingId: null };
    }

    setSessionUiStatus(syncStatusToUi("syncing"));
    await engine.enqueueSession(sessionId, { userId: user.id });
    const result = await engine.processQueue();
    const session = await engine.getSession(sessionId);
    const ui = await engine.getSessionUiStatus(sessionId);

    if (session?.remoteViewingId) {
      setViewingId(session.remoteViewingId);
      const token =
        typeof session.propertyDraft.shareToken === "string"
          ? session.propertyDraft.shareToken
          : shareToken;
      if (token) {
        setShareToken(token);
        setShareUrl(`${window.location.origin}/s/${token}`);
      }
    }

    // Mirror DraftDb upload results back to lib/idb media for reopen continuity.
    const syncedMedia = await engine.listSessionMedia(sessionId);
    const localMedia = await listMedia();
    for (const row of syncedMedia) {
      const local = localMedia.find((item) => item.id === row.id);
      if (!local) continue;
      if (row.storagePath && row.uploadStatus === "uploaded") {
        await putMedia({
          ...local,
          remotePath: row.storagePath,
          uploadStatus: "uploaded",
        });
      }
    }

    await flushDraftToIdb({
      localSessionId: sessionId,
      viewingId: session?.remoteViewingId ?? snap.viewingId,
      shareToken:
        (typeof session?.propertyDraft.shareToken === "string"
          ? session.propertyDraft.shareToken
          : snap.shareToken) ?? null,
      syncStatus: ui?.status ?? "pending",
      lastError: ui?.errorMessage ?? null,
    });
    setSessionUiStatus(ui);

    if (result.skippedOffline) {
      setSyncMessage("目前離線，變更已保存在本機，恢復網路後會繼續同步");
    } else if (ui?.status === "conflict") {
      setSyncMessage(ui.errorMessage || "本機與雲端衝突，未覆寫任一方");
    } else if (ui?.status === "failed") {
      setSyncMessage(ui.errorMessage || "同步失敗");
    } else if (ui?.status === "synced") {
      setSyncMessage("已上傳雲端 · 分享連結已就緒");
      if (options?.openCard) {
        setShowLoginGate(false);
        openDecisionCard();
      }
    } else if (ui?.status === "pending") {
      setSyncMessage("案件已建立，媒體上傳佇列處理中…");
      if (options?.openCard && session?.remoteViewingId) {
        setShowLoginGate(false);
        openDecisionCard();
      }
    }

    return { sessionId, result, ui, remoteViewingId: session?.remoteViewingId ?? null };
  }

  async function retrySyncQueue() {
    if (!user || !draftSessionIdRef.current) return;
    setSyncingCard(true);
    setSessionUiStatus(syncStatusToUi("syncing"));
    try {
      const engine = await getSyncEngine({ isPro });
      await engine.retryFailed(draftSessionIdRef.current);
      const session = await engine.getSession(draftSessionIdRef.current);
      const ui = await engine.getSessionUiStatus(draftSessionIdRef.current);
      if (session?.remoteViewingId) setViewingId(session.remoteViewingId);
      setSessionUiStatus(ui);
      setSyncMessage(ui?.errorMessage || (ui?.status === "synced" ? "同步完成" : "已重試同步"));
      await flushDraftToIdb({
        syncStatus: ui?.status ?? "pending",
        lastError: ui?.errorMessage ?? null,
        viewingId: session?.remoteViewingId ?? viewingId,
      });
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "重試失敗");
    } finally {
      setSyncingCard(false);
    }
  }

  // Hydrate single active draft from IndexedDB (metadata first; media URLs lazy on Step 2).
  useEffect(() => {
    let cancelled = false;
    draftHydratedRef.current = false;
    mediaUrlsReadyRef.current = false;

    void (async () => {
      try {
        const draft = await getActiveDraft();
        const mediaRows = await listMedia();
        if (cancelled) return;

        const pending = mediaRows
          .filter((row) => row.kind === "photo" || row.kind === "video")
          .map((row) => ({
            id: row.id,
            kind: row.kind as "photo" | "video",
            clientNumericId: row.clientNumericId,
            label: row.label,
            mimeType: row.mimeType,
            createdAt: row.createdAt,
            blob: row.blob,
            thumbBlob: row.thumbBlob,
            remotePath: row.remotePath,
            uploadStatus: row.uploadStatus,
            tagId: row.tagId,
            note: row.note,
          }));
        pendingMediaRef.current = pending;

        const nextPhotos: Photo[] = pending
          .filter((row) => row.kind === "photo")
          .map((row) => {
            const tagId = normalizePhotoTagId(row.tagId);
            return {
              id: row.clientNumericId,
              tag: row.label || messages.photoTagLabels[tagId],
              tagId,
              note: row.note || "",
              mediaId: row.id,
              remotePath: row.remotePath ?? undefined,
              file:
                row.uploadStatus === "uploaded"
                  ? undefined
                  : row.blob instanceof File
                    ? row.blob
                    : new File([row.blob], `${row.clientNumericId}.jpg`, { type: row.mimeType }),
            };
          });
        const nextClips: Clip[] = pending
          .filter((row) => row.kind === "video")
          .map((row) => ({
            id: row.clientNumericId,
            label: row.label,
            time: new Date(row.createdAt).toLocaleTimeString("zh-TW", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            mediaId: row.id,
            remotePath: row.remotePath ?? undefined,
            file: row.uploadStatus === "uploaded" ? undefined : row.blob,
          }));

        if (draft) {
          clientUpdatedAtRef.current = draft.clientUpdatedAt || new Date().toISOString();
          if (draft.localSessionId) draftSessionIdRef.current = draft.localSessionId;
          if (draft.address) setAddress(draft.address);
          setTags(draft.tags ?? []);
          setMarketCode(draft.market ?? "CA");
          setIdentified(Boolean(draft.identified));
          if (draft.questions?.length) setQuestions(draft.questions);
          if (draft.notes?.length) {
            setNotes(
              draft.notes.map((note) => ({
                ...note,
                kind: note.kind === "text" ? "text" : note.kind === "transcript" ? "transcript" : undefined,
                markers: Array.isArray(note.markers) ? note.markers : [],
              })),
            );
          }
          if (draft.pros?.length) setPros(draft.pros);
          if (draft.risks?.length) setRisks(draft.risks);
          setPropertyDraft(draft.propertyDraft ?? {});
          setViewingId(draft.remoteViewingId);
          setShareToken(draft.shareToken);
          if (draft.shareToken) {
            setShareUrl(`${window.location.origin}/s/${draft.shareToken}`);
          }
          if (draft.wizardStep === 1 || draft.wizardStep === 2 || draft.wizardStep === 3) {
            setWizardStep(draft.wizardStep);
          }
          setViewingAt(
            draft.viewingAt ||
              (typeof draft.propertyDraft?.viewingAt === "string"
                ? draft.propertyDraft.viewingAt
                : ""),
          );
          setUnitLabel(
            draft.unitLabel ||
              (typeof draft.propertyDraft?.unitLabel === "string"
                ? draft.propertyDraft.unitLabel
                : ""),
          );
          setPriceLabel(
            draft.priceLabel ||
              (typeof draft.propertyDraft?.priceLabel === "string"
                ? draft.propertyDraft.priceLabel
                : ""),
          );
          setLayoutLabel(
            draft.layoutLabel ||
              (typeof draft.propertyDraft?.layoutLabel === "string"
                ? draft.propertyDraft.layoutLabel
                : ""),
          );
          setAreaLabel(
            typeof draft.propertyDraft?.areaLabel === "string"
              ? draft.propertyDraft.areaLabel
              : "",
          );
          setManagementFeeLabel(
            typeof draft.propertyDraft?.managementFeeLabel === "string"
              ? draft.propertyDraft.managementFeeLabel
              : "",
          );
          setListingUrl(
            draft.listingUrl ||
              (typeof draft.propertyDraft?.listingUrl === "string"
                ? draft.propertyDraft.listingUrl
                : ""),
          );
          setSetupNotes(
            draft.setupNotes ||
              (typeof draft.propertyDraft?.setupNotes === "string"
                ? draft.propertyDraft.setupNotes
                : ""),
          );
          setFieldChecklist(
            ensureFieldChecklist(draft.fieldChecklist, messages.fieldChecklist.labels),
          );
          if (draft.liveAudioMarkers?.length) {
            setLiveMarkers(draft.liveAudioMarkers);
          }
          if (draft.aiSummary) {
            setAiSummary(draft.aiSummary);
          }
          if (isDecisionSummarySnapshot(draft.propertyDraft?.decisionSummaryDraft)) {
            setCardDraft(draft.propertyDraft.decisionSummaryDraft);
          } else if (isDecisionSummarySnapshot(draft.propertyDraft?.decisionSummary)) {
            setCardDraft(draft.propertyDraft.decisionSummary);
          }
          setSessionUiStatus(
            syncStatusToUi(
              draft.syncStatus === "local" || draft.syncStatus === "pending_upload"
                ? draft.syncStatus === "local"
                  ? "local_only"
                  : "pending"
                : draft.syncStatus === "error"
                  ? "failed"
                  : (draft.syncStatus as SessionUiStatus["status"]),
              draft.lastError,
            ),
          );
          setSyncMessage(
            draft.remoteViewingId
              ? "已還原本機草稿 · 登入後會自動同步"
              : "已還原本機草稿（IndexedDB）",
          );
        } else if (nextPhotos.length || nextClips.length) {
          setSessionUiStatus(syncStatusToUi("local_only"));
          setSyncMessage("已還原本機媒體（IndexedDB）");
        } else {
          setSessionUiStatus(syncStatusToUi("local_only"));
        }
        if (nextPhotos.length) setPhotos(nextPhotos);
        if (nextClips.length) setClips(nextClips);

        const pendingAudio = draft?.pendingAudioProcess;
        if (pendingAudio?.mediaId) {
          setResumePendingAudio({
            mediaId: pendingAudio.mediaId,
            durationSec: pendingAudio.durationSec || 1,
            markers: pendingAudio.markers,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setSyncMessage(error instanceof Error ? error.message : "本機草稿讀取失敗");
        }
      } finally {
        if (!cancelled) {
          // Allow persist only after React has applied hydrated state.
          window.setTimeout(() => {
            if (cancelled) return;
            draftHydratedRef.current = true;
            persistGenerationRef.current += 1;
            setDraftReady(true);
          }, 0);
        }
      }
    })();

    return () => {
      cancelled = true;
      // Do not revoke URLs here — Strict Mode remount would break restored previews.
    };
  }, []);

  // Lazy-create object URLs when user reaches capture step (thumbs first for photos).
  useEffect(() => {
    if (wizardStep < 2 || mediaUrlsReadyRef.current) return;
    if (pendingMediaRef.current.length === 0) {
      mediaUrlsReadyRef.current = true;
      return;
    }
    let cancelled = false;
    void (async () => {
      const pending = pendingMediaRef.current;
      const photoThumbs = new Map<number, string>();
      const photoFull = new Map<number, string>();
      const clipUrls = new Map<number, string>();
      for (const row of pending) {
        if (cancelled) return;
        if (row.kind === "photo") {
          if (row.thumbBlob) {
            photoThumbs.set(row.clientNumericId, URL.createObjectURL(row.thumbBlob));
          }
          // Defer full URL until expand — still create if no thumb so grid works.
          if (!row.thumbBlob) {
            const localUrl = URL.createObjectURL(row.blob);
            const url = row.remotePath
              ? (await createSignedMediaUrl(row.remotePath)) || localUrl
              : localUrl;
            photoFull.set(row.clientNumericId, url);
          }
        } else {
          const localUrl = URL.createObjectURL(row.blob);
          const url = row.remotePath
            ? (await createSignedMediaUrl(row.remotePath)) || localUrl
            : localUrl;
          clipUrls.set(row.clientNumericId, url);
        }
      }
      if (cancelled) return;
      mediaUrlsReadyRef.current = true;
      setPhotos((current) =>
        current.map((photo) => ({
          ...photo,
          thumbUrl: photo.thumbUrl || photoThumbs.get(photo.id) || photo.thumbUrl,
          url: photo.url || photoFull.get(photo.id) || photo.url,
        })),
      );
      setClips((current) =>
        current.map((clip) =>
          clip.url ? clip : { ...clip, url: clipUrls.get(clip.id) ?? clip.url },
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [wizardStep]);

  // Persist metadata draft to IndexedDB (media blobs saved at capture time).
  useEffect(() => {
    if (!draftReady || !draftHydratedRef.current) return;
    const handle = window.setTimeout(() => {
      void flushDraftToIdb();
    }, 450);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftReady,
    address,
    tags,
    marketCode,
    identified,
    questions,
    notes,
    pros,
    risks,
    propertyDraft,
    viewingId,
    shareToken,
    wizardStep,
    viewingAt,
    unitLabel,
    priceLabel,
    layoutLabel,
    areaLabel,
    managementFeeLabel,
    listingUrl,
    setupNotes,
    fieldChecklist,
    liveMarkers,
    aiSummary,
  ]);

  // After hydrate, resume Whisper for audio that was saved but not processed.
  useEffect(() => {
    if (!draftReady || !resumePendingAudio) return;
    let cancelled = false;
    void (async () => {
      const row = await getMedia(resumePendingAudio.mediaId);
      if (cancelled) return;
      setResumePendingAudio(null);
      if (!row?.blob) return;
      setSyncMessage("發現未完成的錄音，正在繼續分析…");
      await processRecording(
        row.blob,
        resumePendingAudio.durationSec,
        resumePendingAudio.mediaId,
        resumePendingAudio.markers,
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, resumePendingAudio]);

  useEffect(() => {
    if (audioState === "recording") {
      audioTimer.current = window.setInterval(() => setAudioSeconds((s) => s + 1), 1000);
    } else if (audioTimer.current) {
      clearInterval(audioTimer.current);
    }
    return () => {
      if (audioTimer.current) clearInterval(audioTimer.current);
    };
  }, [audioState]);

  // Save in-progress audio on background / lock / navigation away.
  useEffect(() => {
    function persistIfRecording() {
      if (audioRecorderRef.current && audioRecorderRef.current.state === "recording") {
        finishAudioRecorder({ discard: false, interrupted: true });
      }
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") persistIfRecording();
    }
    window.addEventListener("pagehide", persistIfRecording);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", persistIfRecording);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // When UI language changes, refresh static bank / defaults; keep dynamic & follow-ups.
  useEffect(() => {
    const nextBank = bankQuestions(locale, marketCode).map((q) => ({
      ...q,
      checked: false,
    }));
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setQuestions((current) => {
        const keep = current.filter((q) => q.isDynamic || q.isFollowUp || q.answer);
        if (keep.length === 0) return nextBank;
        const texts = new Set(keep.map((q) => q.text.toLowerCase()));
        return [...keep, ...nextBank.filter((q) => !texts.has(q.text.toLowerCase()))];
      });
      setPros((current) =>
        current.length === 0 || current.join("|") === messages.defaults.pros.join("|")
          ? messages.defaults.pros
          : current,
      );
      setRisks((current) =>
        current.length === 0 || current.join("|") === messages.defaults.risks.join("|")
          ? messages.defaults.risks
          : current,
      );
    });
    return () => {
      active = false;
    };
    // Only react to locale; market/messages follow locale switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  function activeQuestionBank() {
    if (questions.length > 0) return questions;
    return bankQuestions(locale, marketCode).map((q) => ({
      ...q,
      checked: false,
    }));
  }

  async function processRecording(blob: Blob, duration: number, existingMediaId?: string, markersInput?: AudioMarker[]) {
    setAudioState("processing");
    setSyncMessage("Whisper 轉文字中...");

    const bank = activeQuestionBank();
    if (questions.length === 0) {
      setQuestions(bank);
    }

    let mediaId = existingMediaId;
    if (!mediaId) {
      try {
        const saved = await saveBlobAsMedia({
          kind: "audio",
          label: `recording-${Date.now()}`,
          blob,
          clientNumericId: Date.now(),
        });
        mediaId = saved.id;
        const draft = await getActiveDraft();
        if (draft) {
          await putActiveDraft({
            ...draft,
            pendingAudioProcess: {
              mediaId: saved.id,
              clientNumericId: saved.clientNumericId,
              durationSec: duration,
              createdAt: new Date().toISOString(),
            },
          });
        }
      } catch {
        // Prefer continuing Whisper even if IDB write fails.
      }
    }

    try {
      const form = new FormData();
      const audioFile =
        blob instanceof File
          ? blob
          : new File([blob], `recording.${extensionFor(blob, "webm")}`, {
              type: blob.type || "audio/webm",
            });
      form.append("audio", audioFile);
      form.append(
        "questions",
        JSON.stringify(bank.map((q) => ({ id: q.id, text: q.text }))),
      );
      form.append("address", address.trim());
      form.append("market", marketCode);
      form.append("locale", locale);
      form.append("openData", JSON.stringify(propertyDraft.openData ?? null));
      form.append(
        "propertyContext",
        JSON.stringify({
          tags,
          neighborhood: propertyDraft.neighborhood,
          city: propertyDraft.city,
        }),
      );
      const markersForAi = attachMediaToMarkers(
        markersInput ?? liveMarkersRef.current,
        mediaId || "",
        draftSessionIdRef.current,
      );
      form.append("markers", JSON.stringify(serializeMarkersForAi(markersForAi)));
      if (mediaId) form.append("mediaId", mediaId);

      const response = await fetch("/api/process-recording", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        issues?: Array<{ path: string; message: string }>;
        warnings?: Array<{ path: string; message: string }>;
        transcript?: string;
        answers?: Array<{ id: number; status: "answered" | "pending"; answer: string }>;
        new_questions?: Array<{
          text: string;
          status: "answered" | "pending";
          answer: string;
          reason?: string;
          based_on?: string;
        }>;
        pros?: string[];
        risks?: string[];
        summary?: ViewingAiSummary;
      };

      if (!response.ok) {
        const detail =
          payload.issues?.slice(0, 2).map((i) => i.message).join("；") ||
          payload.error ||
          "錄音處理失敗";
        throw new Error(detail);
      }

      const noteId = Date.now();
      const normalized = validateAndNormalizeSummary(
        {
          transcript: payload.transcript,
          pros: payload.summary?.pros ?? payload.pros,
          risks: payload.summary?.risks ?? payload.risks,
          facts: payload.summary?.facts,
          followUps: payload.summary?.followUps,
          actionItems: payload.summary?.actionItems,
          summary: payload.summary,
          answers: payload.answers,
          new_questions: payload.new_questions,
        },
        { mediaId: mediaId ?? null, noteId },
      );

      if (!normalized.ok) {
        throw new Error(normalized.error);
      }

      const summary = {
        ...normalized.value,
        noteId,
        mediaId: mediaId ?? null,
      };
      setAiSummary(summary);

      const transcript = summary.transcript || payload.transcript || "";
      const matched =
        payload.answers
          ?.filter((item) => item.status === "answered")
          .map((item) => item.id) ?? [];
      const generated = payload.new_questions ?? [];

      const nextNote: AudioNote = {
        id: noteId,
        duration,
        transcript,
        matched,
        mediaId,
        kind: "transcript",
        markers: markersForAi,
      };
      const nextNotes = [...notesRef.current, nextNote];
      notesRef.current = nextNotes;
      setNotes(nextNotes);

      let nextQuestions: Question[] = [];
      setQuestions((current) => {
        const base = current.length > 0 ? current : bank;
        const updated = base.map((q) => {
          const hit = payload.answers?.find((item) => item.id === q.id);
          if (!hit) return q;
          return {
            ...q,
            checked: hit.status === "answered",
            answer: hit.answer,
          };
        });

        const existingTexts = new Set(updated.map((q) => q.text.trim().toLowerCase()));
        let nextId = updated.reduce((max, q) => Math.max(max, q.id), 0) + 1;
        const extras: Question[] = [];
        for (const item of generated) {
          const text = item.text.trim();
          if (!text || existingTexts.has(text.toLowerCase())) continue;
          existingTexts.add(text.toLowerCase());
          extras.push({
            id: nextId,
            text,
            checked: item.status === "answered",
            answer: item.answer || (item.status === "answered" ? "" : "待確認"),
            isFollowUp: true,
            basedOn: item.based_on || item.reason || "",
            isDynamic: true,
            source: "audio",
          });
          nextId += 1;
        }

        nextQuestions = [...updated, ...extras];
        return nextQuestions;
      });

      const nextPros = claimsToLegacyStrings(summary.pros, 5);
      const nextRisks = claimsToLegacyStrings(summary.risks, 5);
      if (nextPros.length) setPros(nextPros);
      if (nextRisks.length) setRisks(nextRisks);

      const draft = await getActiveDraft();
      if (draft?.pendingAudioProcess) {
        await putActiveDraft({ ...draft, pendingAudioProcess: null, aiSummary: summary });
      }

      await flushDraftToIdb({
        notes: nextNotes,
        questions: nextQuestions.length ? nextQuestions : questions,
        pros: nextPros.length ? nextPros : pros,
        risks: nextRisks.length ? nextRisks : risks,
        aiSummary: summary,
      });

      const followUpCount = generated.length || summary.followUps.length;
      const pendingCount =
        (payload.answers?.filter((item) => item.status === "pending").length ?? 0) +
        generated.filter((item) => item.status !== "answered").length;
      const warn =
        (payload.warnings?.length ?? 0) > 0 || normalized.warnings.length > 0
          ? " · 部分欄位已自動校正"
          : "";
      setSyncMessage(
        `AI 已整理：答到 ${matched.length} 題，新增 ${followUpCount} 個追問，${pendingCount} 題待確認 · 已存本機${warn}`,
      );
      setCaptureError(false);
    } catch (error) {
      setCaptureError(true);
      setSyncMessage(error instanceof Error ? error.message : "錄音處理失敗");
    } finally {
      setAudioState("idle");
      setAudioSeconds(0);
      captureLockRef.current = null;
      setLiveMarkers([]);
      void flushDraftToIdb({ liveAudioMarkers: [] });
    }
  }

  function finishAudioRecorder(options: { discard: boolean; interrupted?: boolean }) {
    audioDiscardRef.current = options.discard;
    const recorder = audioRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.requestData?.();
      } catch {
        // optional
      }
      recorder.stop();
      if (options.interrupted) {
        setSyncMessage(messages.permissions.interruptedSaved);
      }
      return;
    }
    permissionAdapterRef.current.release(audioStreamRef.current);
    audioStreamRef.current = null;
    audioRecorderRef.current = null;
    setAudioState("idle");
    captureLockRef.current = null;
  }

  async function persistAndProcessAudioBlob(blob: Blob, duration: number, interrupted?: boolean) {
    const clientNumericId = Date.now();
    let mediaId: string | undefined;
    const markers = attachMediaToMarkers(
      liveMarkersRef.current,
      "",
      draftSessionIdRef.current,
    );
    try {
      const saved = await saveBlobAsMedia({
        kind: "audio",
        label: `recording-${clientNumericId}`,
        blob,
        clientNumericId,
      });
      mediaId = saved.id;
      const withMedia = attachMediaToMarkers(markers, saved.id, draftSessionIdRef.current);
      await updateMediaFields(saved.id, { markers: withMedia });
      const draft = await getActiveDraft();
      if (draft) {
        await putActiveDraft({
          ...draft,
          pendingAudioProcess: {
            mediaId: saved.id,
            clientNumericId,
            durationSec: duration,
            createdAt: new Date().toISOString(),
            markers: withMedia,
          },
          liveAudioMarkers: withMedia,
        });
      }
      setLiveMarkers(withMedia);
      setSyncMessage(
        interrupted ? messages.permissions.interruptedSaved : messages.permissions.savedOnStop,
      );
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "錄音本機儲存失敗");
    }
    await processRecording(blob, duration, mediaId, markers);
  }


  function addLiveMarker(tagId: AudioMarkerTagId) {
    if (audioState !== "recording") return;
    const now = Date.now();
    if (!canAddMarkerNow(markerCooldownRef.current, now)) {
      setSyncMessage(messages.audio.markerCooldown);
      return;
    }
    markerCooldownRef.current = now;
    const marker = createAudioMarker({
      timeSec: Math.max(0, (now - audioStartedAtRef.current) / 1000),
      tagId,
      viewingSessionId: draftSessionIdRef.current,
    });
    setLiveMarkers((current) => {
      const next = [...current, marker];
      liveMarkersRef.current = next;
      void flushDraftToIdb({ liveAudioMarkers: next });
      return next;
    });
  }

  function updateNoteMarkers(noteId: number, nextMarkers: AudioMarker[]) {
    const existing = notesRef.current.find((item) => item.id === noteId);
    setNotes((current) => {
      const next = current.map((note) =>
        note.id === noteId ? { ...note, markers: nextMarkers } : note,
      );
      notesRef.current = next;
      return next;
    });
    if (existing?.mediaId) {
      void updateMediaFields(existing.mediaId, { markers: nextMarkers });
    }
    void flushDraftToIdb();
  }

  async function ensureAudioPlaybackUrl(note: AudioNote) {
    if (note.kind === "text" || !note.mediaId) return;
    if (audioPlaybackUrls[note.id]) return;
    const row = await getMedia(note.mediaId);
    if (!row?.blob) return;
    const url = URL.createObjectURL(row.blob);
    setAudioPlaybackUrls((current) => ({ ...current, [note.id]: url }));
  }

  async function beginAudioRecording() {
    const adapter = permissionAdapterRef.current;
    if (!adapter.isMediaDevicesSupported() || !adapter.isMediaRecorderSupported()) {
      setPermissionBanner({
        status: "unsupported",
        message: messages.permissions.status.unsupported,
      });
      setPreflightStatus("unsupported");
      return;
    }
    if (captureLockRef.current && captureLockRef.current !== "audio") {
      setSyncMessage(messages.permissions.busyElsewhere);
      return;
    }

    setPreflightBusy(true);
    const prior = await adapter.query("microphone");
    setPreflightStatus(prior);
    const result = await adapter.request("microphone", { audio: true });
    setPreflightBusy(false);

    if (!result.ok) {
      setPreflightStatus(result.status);
      setPermissionBanner({
        status: result.status,
        message: messages.permissions.status[result.status],
      });
      return;
    }

    try {
      captureLockRef.current = "audio";
      audioDiscardRef.current = false;
      setLiveMarkers([]);
      liveMarkersRef.current = [];
      markerCooldownRef.current = 0;
      void flushDraftToIdb({ liveAudioMarkers: [] });
      const stream = result.stream;
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";
      audioMimeRef.current = mime || "audio/webm";
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setPermissionBanner({
          status: "permission-revoked",
          message: messages.permissions.status["permission-revoked"],
        });
        finishAudioRecorder({ discard: false, interrupted: true });
      };
      recorder.onstop = () => {
        const discard = audioDiscardRef.current;
        adapter.release(stream);
        audioStreamRef.current = null;
        audioRecorderRef.current = null;
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || audioMimeRef.current,
        });
        audioChunksRef.current = [];
        if (discard || blob.size === 0) {
          setAudioState("idle");
          setAudioSeconds(0);
          captureLockRef.current = null;
          setLiveMarkers([]);
          void flushDraftToIdb({ liveAudioMarkers: [] });
          setSyncMessage(discard ? messages.audio.cancel : messages.permissions.status.denied);
          return;
        }
        const duration = Math.max(
          1,
          Math.round((Date.now() - audioStartedAtRef.current) / 1000),
        );
        void persistAndProcessAudioBlob(blob, duration);
      };
      for (const track of stream.getTracks()) {
        track.addEventListener("ended", () => {
          if (audioRecorderRef.current && audioRecorderRef.current.state === "recording") {
            setPermissionBanner({
              status: "permission-revoked",
              message: messages.permissions.status["permission-revoked"],
            });
            finishAudioRecorder({ discard: false, interrupted: true });
          }
        });
      }
      audioRecorderRef.current = recorder;
      audioStartedAtRef.current = Date.now();
      recorder.start(1000);
      setAudioSeconds(0);
      setAudioState("recording");
      setPreflightKind(null);
      setPermissionBanner(null);
      setSyncMessage(messages.audio.recording);
    } catch (error) {
      adapter.release(result.stream);
      captureLockRef.current = null;
      setPermissionBanner({
        status: "unsupported",
        message: error instanceof Error ? error.message : messages.permissions.status.unsupported,
      });
    }
  }

  async function openCapturePreflight(kind: CaptureKind) {
    if (audioState === "recording" || audioState === "processing") {
      setSyncMessage(messages.permissions.busyElsewhere);
      return;
    }
    if (captureLockRef.current) {
      setSyncMessage(messages.permissions.busyElsewhere);
      return;
    }
    const adapter = permissionAdapterRef.current;
    setPreflightKind(kind);
    setPreflightBusy(true);
    if (kind === "audio") {
      if (!adapter.isMediaDevicesSupported() || !adapter.isMediaRecorderSupported()) {
        setPreflightStatus("unsupported");
      } else {
        setPreflightStatus(await adapter.query("microphone"));
      }
    } else if (kind === "video") {
      if (!adapter.isMediaDevicesSupported()) {
        setPreflightStatus("unsupported");
      } else {
        setPreflightStatus(await adapter.query("camera"));
      }
    } else {
      setPreflightStatus(adapter.isMediaDevicesSupported() ? "prompt" : "unsupported");
    }
    setPreflightBusy(false);
  }

  async function onPreflightContinue() {
    if (!preflightKind) return;
    if (preflightKind === "audio") {
      await beginAudioRecording();
      return;
    }
    const kind = preflightKind;
    setPreflightKind(null);
    setPermissionBanner(null);
    if (kind === "video") {
      captureLockRef.current = "video";
      videoInput.current?.click();
      // Release lock shortly if user cancels the picker without a file.
      window.setTimeout(() => {
        if (captureLockRef.current === "video") captureLockRef.current = null;
      }, 1500);
      return;
    }
    captureLockRef.current = "photo";
    photoInput.current?.click();
    window.setTimeout(() => {
      if (captureLockRef.current === "photo") captureLockRef.current = null;
    }, 1500);
  }

  function onPreflightImport() {
    const kind = preflightKind;
    setPreflightKind(null);
    if (kind === "audio") {
      audioImportInput.current?.click();
      return;
    }
    if (kind === "video") {
      // Same file input without forcing capture path again — user can pick gallery file.
      videoInput.current?.click();
      return;
    }
    photoInput.current?.click();
  }

  function readAudioDuration(file: Blob): Promise<number> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const duration = Number.isFinite(audio.duration) ? Math.max(1, Math.round(audio.duration)) : 1;
        URL.revokeObjectURL(url);
        resolve(duration);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(1);
      };
      audio.src = url;
    });
  }

  async function onImportAudio(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (audioState === "recording" || audioState === "processing" || captureLockRef.current) {
      setSyncMessage(messages.permissions.busyElsewhere);
      return;
    }

    setSyncMessage(`已匯入「${file.name}」· 準備分析...`);
    const duration = await readAudioDuration(file);
    await processRecording(file, duration);
  }

  async function lookupAddress() {
    if (!address.trim()) return;

    setLookingUp(true);
    setIdentified(false);
    setLookupError(false);
    setSyncMessage("");

    try {
      const response = await fetch("/api/lookup-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });
      const payload = (await response.json()) as {
        error?: string;
        market?: "CA" | "TH" | "OTHER";
        displayAddress?: string;
        tags?: string[];
        source?: string;
        propertyId?: string;
        details?: Record<string, unknown>;
      };

      if (!response.ok) {
        throw new Error(payload.error || "地址查詢失敗");
      }

      const nextMarket = payload.market ?? "CA";
      const nextTags = payload.tags?.length ? payload.tags : ["已定位"];
      const nextQuestions = bankQuestions(locale, nextMarket).map((q) => ({
        ...q,
        checked: false,
      }));

      if (payload.displayAddress) {
        setAddress(payload.displayAddress);
      }
      setMarketCode(nextMarket);
      setTags(nextTags);
      setQuestions((current) => {
        const dynamic = current.filter((q) => q.isDynamic);
        const texts = new Set(dynamic.map((q) => q.text.toLowerCase()));
        return [...dynamic, ...nextQuestions.filter((q) => !texts.has(q.text.toLowerCase()))];
      });
      setIdentified(true);
      const openData = (payload.details?.openData || null) as Record<string, unknown> | null;
      const zoning = openData?.zoningCode ? String(openData.zoningCode) : "";
      const propertyId = String(
        payload.propertyId ?? payload.details?.propertyId ?? "",
      );
      const nextPropertyDraft = {
        source: payload.source,
        propertyId: payload.propertyId ?? payload.details?.propertyId,
        ...payload.details,
      };
      setPropertyDraft(nextPropertyDraft);
      await flushDraftToIdb({
        address: payload.displayAddress || address.trim(),
        tags: nextTags,
        marketCode: nextMarket,
        identified: true,
        questions: [
          ...questions.filter((q) => q.isDynamic),
          ...nextQuestions.filter(
            (q) =>
              !questions
                .filter((item) => item.isDynamic)
                .some((d) => d.text.toLowerCase() === q.text.toLowerCase()),
          ),
        ],
        propertyDraft: nextPropertyDraft,
      });
      setSyncMessage(
        `${payload.source ?? "地址查詢"}完成` +
          (zoning ? ` · Zoning ${zoning}` : "") +
          (propertyId ? ` · property ${propertyId.slice(0, 8)}` : "") +
          " · 已寫入本機草稿",
      );
    } catch (error) {
      setIdentified(false);
      setLookupError(true);
      setSyncMessage(error instanceof Error ? error.message : "查詢失敗");
    } finally {
      setLookingUp(false);
    }
  }

  async function syncAndOpenCard() {
    setSyncingCard(true);
    setSyncMessage("正在上傳看房資料...");
    try {
      // Build share snapshot before sync so cloud property jsonb carries decisionSummary.
      // On failure, source pros/risks/aiSummary and in-memory cardDraft remain intact.
      const next = rebuildCardDraft(cardDraft);
      setCardDraft(next);
      const publicSnap = toPublicDecisionSummary(next);
      const nextPropertyDraft = {
        ...propertyDraft,
        decisionSummary: publicSnap,
        decisionSummaryDraft: next,
        overallRating: next.overallRating,
      };
      setPropertyDraft(nextPropertyDraft);
      draftSnapshotRef.current = {
        ...draftSnapshotRef.current,
        propertyDraft: nextPropertyDraft,
      };
      const synced = await syncViaQueue({ openCard: true });
      const remoteId =
        (synced && "remoteViewingId" in synced && synced.remoteViewingId) ||
        viewingId ||
        draftSnapshotRef.current.viewingId;
      if (remoteId && user) {
        try {
          const res = await fetch("/api/share/links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ viewingId: remoteId }),
          });
          const payload = (await res.json()) as {
            link?: ShareLinkRecord;
            urlPath?: string;
          };
          if (res.ok && payload.link) {
            setShareLink(payload.link);
            if (payload.link.token) {
              setShareToken(payload.link.token);
              setShareUrl(`${window.location.origin}/s/${payload.link.token}`);
            }
          }
        } catch {
          // share access ensure is best-effort after sync
        }
      }
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "上傳失敗");
      // Still allow local preview — original field data is untouched.
      openDecisionCard();
      throw error;
    } finally {
      setSyncingCard(false);
    }
  }

  async function autosaveIfLoggedIn() {
    if (!user || !configured || !draftReady || !identified) return;
    if (!viewingId && freeCount >= FREE_VIEWING_LIMIT && !isPro) return;
    if (!notes.length && !photos.length && !clips.length) return;

    try {
      const beforeId = viewingId;
      const outcome = await syncViaQueue();
      if (!beforeId && outcome && "remoteViewingId" in outcome && outcome.remoteViewingId) {
        setFreeCount((n) => n + 1);
      }
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "自動同步失敗");
    }
  }

  async function handleGenerateCard() {
    const ready = canGenerateShareCard({
      address,
      viewingAt,
      notesCount: notes.length,
      photosCount: photos.length,
      clipsCount: clips.length,
      checkedQuestions: questions.filter((q) => q.checked).length,
      syncStatus: sessionUiStatus?.status ?? null,
    });
    if (!ready) {
      setWizardStep(3);
      setSyncMessage("請先完成下方條件清單");
      return;
    }
    if (!configured) {
      openDecisionCard();
      return;
    }
    if (!user) {
      setShowLoginGate(true);
      setLoginError("");
      return;
    }
    // New viewing only: free users capped at 3
    if (!viewingId && freeCount >= FREE_VIEWING_LIMIT && !isPro) {
      setShowPaywall(true);
      return;
    }
    const wasNew = !viewingId;
    try {
      await syncAndOpenCard();
      if (wasNew) setFreeCount((n) => n + 1);
    } catch {
      // message already set
    }
  }

  function goToStep(target: WizardStep) {
    const snap = {
      address,
      viewingAt,
      notesCount: notes.length,
      photosCount: photos.length,
      clipsCount: clips.length,
      checkedQuestions: questions.filter((q) => q.checked).length,
    };
    if (target > wizardStep && !canEnterStep(target, snap)) {
      setSyncMessage("請先填地址與看房日期時間");
      setWizardStep(1);
      return;
    }
    if (target === 2 && questions.length === 0) {
      setQuestions(bankQuestions(locale, marketCode).map((q) => ({ ...q, checked: false })));
    }
    if (target === 2 && fieldChecklist.length === 0) {
      const seeded = ensureFieldChecklist([], messages.fieldChecklist.labels);
      setFieldChecklist(seeded);
      void flushDraftToIdb({ wizardStep: target, fieldChecklist: seeded });
      setWizardStep(target);
      return;
    }
    setWizardStep(target);
    void flushDraftToIdb({ wizardStep: target });
  }

  function addTextNote() {
    const body = textNoteDraft.trim();
    if (!body) return;
    setNotes((current) => [
      ...current,
      {
        id: Date.now(),
        duration: 0,
        transcript: body,
        matched: [],
        kind: "text",
      },
    ]);
    setTextNoteDraft("");
    setCaptureError(false);
  }

  async function startCheckout() {
    setCheckoutLoading(true);
    setSyncMessage("");
    try {
      const response = await fetch("/api/create-checkout-session", { method: "POST" });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "無法開啟 Stripe Checkout");
      }
      window.location.href = payload.url;
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Checkout 失敗");
      setCheckoutLoading(false);
    }
  }

  async function handleLoginForCard(event: React.FormEvent) {
    event.preventDefault();
    setLoginError("");
    setSyncingCard(true);
    const supabase = getSupabase();
    if (!supabase) {
      setLoginError("尚未設定 Supabase");
      setSyncingCard(false);
      return;
    }

    try {
      if (loginMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: loginEmail.trim(),
          password: loginPassword,
        });
        if (error) throw error;
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: loginEmail.trim(),
            password: loginPassword,
          });
          if (signInError) {
            throw new Error("註冊成功，請先到信箱驗證後再登入上傳");
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: loginEmail.trim(),
          password: loginPassword,
        });
        if (error) throw error;
      }
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);

      if (currentUser) {
        const [{ count }, { data: sub }] = await Promise.all([
          supabase
            .from("viewings")
            .select("id", { count: "exact", head: true })
            .eq("user_id", currentUser.id),
          supabase
            .from("subscriptions")
            .select("status")
            .eq("user_id", currentUser.id)
            .maybeSingle(),
        ]);
        const nextCount = count ?? 0;
        const nextPro = sub?.status === "active" || sub?.status === "trialing";
        setFreeCount(nextCount);
        setIsPro(nextPro);
        if (!viewingId && nextCount >= FREE_VIEWING_LIMIT && !nextPro) {
          setShowLoginGate(false);
          setShowPaywall(true);
          setSyncingCard(false);
          return;
        }
      }

      const wasNew = !viewingId;
      await syncAndOpenCard();
      if (wasNew) setFreeCount((n) => n + 1);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登入失敗");
      setSyncingCard(false);
    }
  }

  function readVideoDuration(file: Blob): Promise<number | undefined> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : undefined;
        URL.revokeObjectURL(url);
        resolve(duration);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(undefined);
      };
      video.src = url;
    });
  }

  async function persistClip(blob: Blob, label: string) {
    const durationSec = await readVideoDuration(blob);
    const clientNumericId = Date.now();
    let mediaId: string | undefined;
    try {
      const saved = await saveBlobAsMedia({
        kind: "video",
        label,
        blob,
        clientNumericId,
      });
      mediaId = saved.id;
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "影片本機儲存失敗");
    }

    const clip: Clip = {
      id: clientNumericId,
      label,
      time: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }),
      durationSec,
      url: URL.createObjectURL(blob),
      file: blob,
      mediaId,
    };
    setClips((current) => [...current, clip]);
    await flushDraftToIdb();
    setSyncMessage(
      durationSec
        ? `影片已存本機（${durationSec}秒）· 登入後會自動同步`
        : "影片已存本機 IndexedDB，登入後會自動同步",
    );
  }

  function openNativeCamera() {
    if (clips.length >= 4) return;
    void openCapturePreflight("video");
  }

  async function onVideoFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    captureLockRef.current = null;
    if (!file) return;
    await persistClip(file, messages.clipLabels[clips.length % messages.clipLabels.length]);
  }

  async function onPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.target.value = "";
    captureLockRef.current = null;
    if (!files) return;

    const incomingFiles = Array.from(files).slice(0, 5 - photos.length);
    const incoming: Photo[] = [];
    const defaultTagId: PhotoTagId = "other";
    const defaultTag = messages.photoTagLabels[defaultTagId];

    for (let index = 0; index < incomingFiles.length; index += 1) {
      const file = incomingFiles[index];
      const clientNumericId = Date.now() + index;
      let mediaId: string | undefined;
      try {
        const saved = await saveBlobAsMedia({
          kind: "photo",
          label: defaultTag,
          tagId: defaultTagId,
          note: "",
          blob: file,
          clientNumericId,
        });
        mediaId = saved.id;
      } catch {
        // continue with memory-only fallback
      }
      incoming.push({
        id: clientNumericId,
        tag: defaultTag,
        tagId: defaultTagId,
        note: "",
        file,
        mediaId,
      });
    }
    setPhotos((current) => [...current, ...incoming]);
    await flushDraftToIdb();
    setSyncMessage("照片原圖已存本機 · 正在產生縮圖");

    const schedule =
      typeof requestIdleCallback === "function"
        ? (cb: () => void) => requestIdleCallback(() => cb(), { timeout: 1200 })
        : (cb: () => void) => window.setTimeout(cb, 0);
    for (const photo of incoming) {
      schedule(() => {
        void (async () => {
          if (!photo.file) return;
          const thumb = await createImageThumbnail(photo.file);
          if (!thumb) {
            const url = URL.createObjectURL(photo.file);
            setPhotos((current) =>
              current.map((item) =>
                item.id === photo.id ? { ...item, thumbUrl: url, url } : item,
              ),
            );
            return;
          }
          const thumbUrl = URL.createObjectURL(thumb.blob);
          setPhotos((current) =>
            current.map((item) => (item.id === photo.id ? { ...item, thumbUrl } : item)),
          );
          if (photo.mediaId) {
            await updateMediaFields(photo.mediaId, {
              thumbBlob: thumb.blob,
              thumbMimeType: thumb.mimeType,
            });
          }
        })();
      });
    }

    const first = incoming[0];
    if (first) {
      setAnnotatingPhotoId(first.id);
      setAnnotateTagId(first.tagId);
      setAnnotateNote(first.note);
    }

    const fileToDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("讀取照片失敗"));
        reader.readAsDataURL(file);
      });

    void (async () => {
      setSyncMessage("照片已存本機 · AI 分析風險中...");
      const results = await Promise.allSettled(
        incoming.map(async (photo) => {
          if (!photo.file) return null;
          const base64 = await fileToDataUrl(photo.file);
          const live = photosRef.current.find((p) => p.id === photo.id);
          const tag = live?.tag || photo.tag;
          const response = await fetch("/api/vision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64, tag, locale }),
          });
          const payload = (await response.json()) as { question?: string; error?: string };
          if (!response.ok || !payload.question) {
            throw new Error(payload.error || "Vision 失敗");
          }
          return { text: payload.question.trim(), tag };
        }),
      );

      const generated = results
        .filter(
          (r): r is PromiseFulfilledResult<{ text: string; tag: string } | null> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value)
        .filter((v): v is { text: string; tag: string } => Boolean(v?.text));

      if (generated.length > 0) {
        setQuestions((current) => {
          const base =
            current.length > 0
              ? current
              : bankQuestions(locale, marketCode).map((q) => ({
                  ...q,
                  checked: false,
                }));
          const existing = new Set(base.map((q) => q.text.trim().toLowerCase()));
          let nextId = base.reduce((max, q) => Math.max(max, q.id), 0) + 1;
          const extras: Question[] = [];
          for (const item of generated) {
            const text = item.text.trim();
            if (!text || existing.has(text.toLowerCase())) continue;
            existing.add(text.toLowerCase());
            extras.push({
              id: nextId,
              text,
              checked: false,
              isDynamic: true,
              source: "photo",
              basedOn: item.tag,
            });
            nextId += 1;
          }
          return [...extras, ...base];
        });
        setBankCollapsed(false);
        setSyncMessage(`照片 AI 已生成 ${generated.length} 題必問 · 已存本機`);
      } else {
        const firstError = results.find((r) => r.status === "rejected") as
          | PromiseRejectedResult
          | undefined;
        setSyncMessage(
          firstError
            ? `照片已存本機，AI 分析失敗：${firstError.reason instanceof Error ? firstError.reason.message : "請稍後再試"}`
            : "照片已存本機 IndexedDB，登入後會自動同步",
        );
      }
    })();
  }

  async function ensurePhotoFullUrl(photo: Photo): Promise<string | undefined> {
    if (photo.url) return photo.url;
    if (photo.file) {
      const url = URL.createObjectURL(photo.file);
      setPhotos((current) =>
        current.map((item) => (item.id === photo.id ? { ...item, url } : item)),
      );
      return url;
    }
    if (!photo.mediaId) return photo.thumbUrl;
    const row = await getMedia(photo.mediaId);
    if (!row?.blob) return photo.thumbUrl;
    const url = URL.createObjectURL(row.blob);
    setPhotos((current) =>
      current.map((item) => (item.id === photo.id ? { ...item, url } : item)),
    );
    return url;
  }

  function openPhotoAnnotator(photo: Photo) {
    setAnnotatingPhotoId(photo.id);
    setAnnotateTagId(photo.tagId);
    setAnnotateNote(photo.note);
  }

  async function savePhotoAnnotation() {
    if (annotatingPhotoId == null) return;
    const tag = messages.photoTagLabels[annotateTagId];
    const note = annotateNote.trim();
    let mediaId: string | undefined;
    setPhotos((current) =>
      current.map((photo) => {
        if (photo.id !== annotatingPhotoId) return photo;
        mediaId = photo.mediaId;
        return { ...photo, tagId: annotateTagId, tag, note };
      }),
    );
    if (mediaId) {
      await updateMediaFields(mediaId, { label: tag, tagId: annotateTagId, note });
    }
    await flushDraftToIdb();
    setAnnotatingPhotoId(null);
  }

  async function removePhoto(photoId: number) {
    const target = photos.find((photo) => photo.id === photoId);
    setPhotos((current) => current.filter((item) => item.id !== photoId));
    if (expandedPhotoId === photoId) setExpandedPhotoId(null);
    if (annotatingPhotoId === photoId) setAnnotatingPhotoId(null);
    if (target?.mediaId) {
      try {
        await deleteMedia(target.mediaId);
      } catch {
        // ignore
      }
    }
    await flushDraftToIdb();
  }

  function rebuildCardDraft(previous?: DecisionSummarySnapshot | null): DecisionSummarySnapshot {
    return buildCardFromViewing({
      address,
      viewingAt,
      unitLabel,
      priceLabel,
      layoutLabel,
      areaLabel,
      managementFeeLabel,
      listingUrl,
      setupNotes,
      overallRating:
        typeof propertyDraft.overallRating === "number"
          ? propertyDraft.overallRating
          : previous?.overallRating ?? null,
      pros,
      risks,
      aiSummary,
      pendingQuestions: questions,
      photos: photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        thumbUrl: photo.thumbUrl,
        remotePath: photo.remotePath ?? null,
        tag: photo.tag,
        note: photo.note,
      })),
      disclaimer: messages.card.disclaimer,
      previous: previous ?? cardDraft,
    });
  }

  /** Commit share snapshot into propertyDraft without mutating source pros/risks/aiSummary. */
  function commitCardToPropertyDraft(snapshot: DecisionSummarySnapshot) {
    const publicSnap = toPublicDecisionSummary(snapshot);
    setPropertyDraft((prev) => ({
      ...prev,
      decisionSummary: publicSnap,
      decisionSummaryDraft: snapshot,
      overallRating: snapshot.overallRating,
    }));
    return publicSnap;
  }

  function openDecisionCard() {
    const next = rebuildCardDraft(cardDraft);
    setCardDraft(next);
    commitCardToPropertyDraft(next);
    setEditingCard(false);
    setShowCard(true);
  }

  function requestShareAction(action: "copy" | "share") {
    if (!cardDraft) openDecisionCard();
    setPrivacyAction(action);
    setShowPrivacyCheck(true);
  }

  async function performShareAction(action: "copy" | "share") {
    const snapshot = cardDraft ?? rebuildCardDraft();
    setCardDraft(snapshot);
    commitCardToPropertyDraft(snapshot);
    // Persist draft first so a failed cloud sync cannot wipe the card edit buffer.
    try {
      await flushDraftToIdb({
        propertyDraft: {
          ...propertyDraft,
          decisionSummary: toPublicDecisionSummary(snapshot),
          decisionSummaryDraft: snapshot,
          overallRating: snapshot.overallRating,
        },
      });
    } catch {
      // Keep in-memory cardDraft even if IDB flush fails.
    }

    if (user && configured) {
      try {
        await syncViaQueue();
      } catch (error) {
        setSyncMessage(
          error instanceof Error
            ? error.message
            : "同步失敗，本機決策摘要仍保留，可重試",
        );
      }
    }

    const link = shareUrl || (shareToken ? `${window.location.origin}/s/${shareToken}` : "");
    if (action === "copy") {
      void navigator.clipboard?.writeText(
        link ||
          [
            snapshot.address,
            snapshot.viewingAt,
            selectedLines(snapshot.pros),
            selectedLines(snapshot.risks),
            snapshot.disclaimer,
          ]
            .filter(Boolean)
            .join("\n"),
      );
      alert(link ? messages.card.copyLink : messages.card.copy);
      return;
    }

    if (link && navigator.share) {
      void navigator.share({ title: messages.brand.name, text: snapshot.address, url: link });
      return;
    }
    if (link) {
      void navigator.clipboard?.writeText(link);
      alert(messages.card.copyLink);
      return;
    }
    alert(messages.card.needSync);
  }

  function selectedLines(items: DecisionSummarySnapshot["pros"]) {
    return items
      .filter((item) => item.selected && item.text.trim())
      .map((item) => item.text)
      .join(" / ");
  }

  function copyCard() {
    requestShareAction("copy");
  }

  function shareCard() {
    requestShareAction("share");
  }

  // Logged-in autosave (debounced). Guests stay IDB-only until generate card.
  useEffect(() => {
    if (!user || !configured || !draftReady || !identified) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      void autosaveIfLoggedIn();
    }, 2500);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user,
    configured,
    draftReady,
    identified,
    address,
    tags,
    questions,
    notes,
    pros,
    risks,
    photos,
    clips,
    propertyDraft,
    isPro,
    freeCount,
  ]);

  const wizardSnap = {
    address,
    viewingAt,
    notesCount: notes.length,
    photosCount: photos.length,
    clipsCount: clips.length,
    checkedQuestions: questions.filter((q) => q.checked).length,
    identified,
    cardOpened: showCard,
    syncStatus: sessionUiStatus?.status ?? null,
    lookupError,
    captureError,
  };
  const shareChecklist = getShareChecklist(wizardSnap);
  const canShare = canGenerateShareCard(wizardSnap);
  const stepStatuses = ([1, 2, 3] as WizardStep[]).map((step) => ({
    step,
    label:
      step === 1
        ? messages.wizard.step1
        : step === 2
          ? messages.wizard.step2
          : messages.wizard.step3,
    status: getStepStatus(step, wizardStep, wizardSnap),
  }));

  return (
    <div className="min-h-screen w-full flex justify-center bg-[#FDF6F0] text-[#1A1A1A]">
      <div className="w-full max-w-[420px] px-4 pt-6 pb-36">
        {preflightKind ? (
          <PermissionPreflight
            kind={preflightKind}
            copy={messages.permissions}
            status={preflightStatus}
            busy={preflightBusy}
            onContinue={() => void onPreflightContinue()}
            onCancel={() => {
              setPreflightKind(null);
              setPreflightBusy(false);
            }}
            onImport={onPreflightImport}
          />
        ) : null}
        <PhotoAnnotator
          open={annotatingPhotoId != null}
          title={messages.photos.annotateTitle}
          tagLabel={messages.photos.tagLabel}
          noteLabel={messages.photos.noteLabel}
          notePlaceholder={messages.photos.notePlaceholder}
          saveLabel={messages.photos.saveAnnotation}
          cancelLabel={messages.permissions.cancel}
          tagOptions={PHOTO_TAG_IDS.map((id) => ({
            id,
            label: messages.photoTagLabels[id],
          }))}
          tagId={annotateTagId}
          note={annotateNote}
          previewUrl={
            photos.find((photo) => photo.id === annotatingPhotoId)?.thumbUrl ||
            photos.find((photo) => photo.id === annotatingPhotoId)?.url
          }
          onTagChange={setAnnotateTagId}
          onNoteChange={setAnnotateNote}
          onSave={() => void savePhotoAnnotation()}
          onCancel={() => setAnnotatingPhotoId(null)}
        />
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-[20px] font-[800] tracking-tight leading-[1.1] flex flex-wrap items-center gap-2">
              <span>
                {messages.brand.name}
                <br />
                <span className="text-[11px] font-[700] tracking-[0.18em] opacity-60">
                  {messages.brand.subtitle}
                </span>
              </span>
              {isPro && (
                <span className="px-2 py-0.5 rounded-full bg-[#111] text-white text-[10px] font-bold tracking-wide align-middle">
                  PRO
                </span>
              )}
            </h1>
            {user && !isPro && (
              <p className="mt-1.5 text-[11px] text-[#6B7280]">
                {t(messages.status.freeQuota, {
                  used: Math.min(freeCount, FREE_VIEWING_LIMIT),
                  limit: FREE_VIEWING_LIMIT,
                })}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 mt-1.5 shrink-0">
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <Link
                href="/viewings"
                className="h-8 px-3 rounded-full bg-white border border-black/10 text-[11px] font-bold text-[#1A1A1A] inline-flex items-center gap-1.5"
              >
                <List className="w-3.5 h-3.5" /> {messages.nav.records}
              </Link>
              <ClientAuthBar />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
              <span className="text-[11px] font-medium text-[#6B7280] tracking-wide">
                {configured
                  ? user
                    ? messages.status.loggedIn
                    : messages.status.guest
                  : messages.status.noKeys}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-[18px] bg-[#F0FDF4] border border-[#BBF7D0] p-3 text-[12px] text-[#166534] leading-[1.45]">
          {messages.intro}
        </div>

        <SyncStatusBanner
          status={sessionUiStatus}
          messages={messages.sync}
          busy={syncingCard}
          onRetry={() => void retrySyncQueue()}
        />

        <WizardStepper steps={stepStatuses} onSelect={(step) => goToStep(step)} />

        {wizardStep === 1 && (
          <StepSetup
            messages={messages}
            address={address}
            onAddressChange={setAddress}
            lookingUp={lookingUp}
            onLookup={() => void lookupAddress()}
            identified={identified}
            tags={tags}
            propertyDraft={propertyDraft}
            syncMessage={syncMessage}
            lookupError={lookupError}
            viewingAtLocal={toDatetimeLocalValue(viewingAt)}
            onViewingAtChange={(value) => setViewingAt(fromDatetimeLocalValue(value))}
            unitLabel={unitLabel}
            onUnitLabelChange={setUnitLabel}
            priceLabel={priceLabel}
            onPriceLabelChange={setPriceLabel}
            layoutLabel={layoutLabel}
            onLayoutLabelChange={setLayoutLabel}
            areaLabel={areaLabel}
            onAreaLabelChange={setAreaLabel}
            managementFeeLabel={managementFeeLabel}
            onManagementFeeLabelChange={setManagementFeeLabel}
            listingUrl={listingUrl}
            onListingUrlChange={setListingUrl}
            setupNotes={setupNotes}
            onSetupNotesChange={setSetupNotes}
          />
        )}

                {wizardStep === 2 && (
          <>
        <div className="bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 mb-4">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setBankCollapsed((value) => !value)}
            >
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-[800] tracking-widest">
                  {messages.bank.title} - {market}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#DBEAFE] text-[10px] font-bold text-[#2563EB]">
                  {questions.length}題
                </span>
              </div>
              <button className="w-6 h-6 rounded-full bg-[#F5F3F0] flex items-center justify-center">
                {bankCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
            {!bankCollapsed && (
              <>
                <div className="mt-3 space-y-2">
                  {questions.some((q) => q.isDynamic && q.source === "photo") && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold tracking-wide text-[#047857]">
                        {messages.bank.photoAi}
                      </p>
                      {questions
                        .filter((q) => q.isDynamic && q.source === "photo")
                        .map((question) => (
                          <button
                            key={question.id}
                            onClick={() =>
                              setQuestions((current) =>
                                current.map((item) =>
                                  item.id === question.id
                                    ? { ...item, checked: !item.checked }
                                    : item,
                                ),
                              )
                            }
                            className={`w-full rounded-xl border p-3 text-left transition ${
                              question.checked
                                ? "bg-[#065F46] text-white border-[#065F46]"
                                : "bg-[#ECFDF5] border-[#A7F3D0] hover:bg-[#D1FAE5]"
                            }`}
                          >
                            <span className="flex items-start gap-1.5 text-[12px] font-bold">
                              {question.checked ? (
                                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              ) : (
                                <span className="mt-0.5 px-1.5 py-0.5 rounded-full bg-[#059669] text-white text-[9px] font-bold shrink-0">
                                  {messages.bank.photoBadge}
                                </span>
                              )}
                              {question.text}
                            </span>
                            {question.basedOn && (
                              <span
                                className={`block mt-1.5 text-[10px] leading-[1.4] ${
                                  question.checked ? "text-white/70" : "text-[#047857]/70"
                                }`}
                              >
                                {messages.bank.tagLabel}{question.basedOn}
                              </span>
                            )}
                          </button>
                        ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {questions
                      .filter(
                        (question) =>
                          !question.isFollowUp &&
                          !(question.isDynamic && question.source === "photo"),
                      )
                      .map((question) => (
                        <button
                          key={question.id}
                          onClick={() =>
                            setQuestions((current) =>
                              current.map((item) =>
                                item.id === question.id
                                  ? { ...item, checked: !item.checked }
                                  : item,
                              ),
                            )
                          }
                          className={`px-3 py-2 rounded-full text-[12px] font-medium border transition text-left ${
                            question.checked
                              ? "bg-black text-white border-black"
                              : "bg-[#FAF7F3] border-black/5 hover:bg-[#F3F0EB]"
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            {question.checked && <Check className="w-3 h-3" />}
                            {question.text}
                          </span>
                        </button>
                      ))}
                  </div>

                  {questions.some((q) => q.isFollowUp) && (
                    <div className="pt-1 space-y-2">
                      <p className="text-[11px] font-bold tracking-wide text-[#7C3AED]">
                        {messages.bank.followUp}
                      </p>
                      {questions
                        .filter((question) => question.isFollowUp)
                        .map((question) => (
                          <button
                            key={question.id}
                            onClick={() =>
                              setQuestions((current) =>
                                current.map((item) =>
                                  item.id === question.id
                                    ? { ...item, checked: !item.checked }
                                    : item,
                                ),
                              )
                            }
                            className={`w-full rounded-xl border p-3 text-left transition ${
                              question.checked
                                ? "bg-[#4C1D95] text-white border-[#4C1D95]"
                                : "bg-[#F5F3FF] border-[#DDD6FE] hover:bg-[#EDE9FE]"
                            }`}
                          >
                            <span className="flex items-start gap-1.5 text-[12px] font-bold">
                              {question.checked ? (
                                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              ) : (
                                <span className="mt-0.5 px-1.5 py-0.5 rounded-full bg-[#7C3AED] text-white text-[9px] font-bold shrink-0">
                                  {messages.bank.followBadge}
                                </span>
                              )}
                              {question.text}
                            </span>
                            {question.basedOn && (
                              <span
                                className={`block mt-1.5 text-[10px] leading-[1.4] ${
                                  question.checked ? "text-white/70" : "text-[#6D28D9]/70"
                                }`}
                              >
                                {messages.card.byDialogue}{question.basedOn}
                              </span>
                            )}
                            {question.answer && (
                              <span
                                className={`block mt-1 text-[11px] ${
                                  question.checked ? "text-white/80" : "text-[#6B7280]"
                                }`}
                              >
                                A: {question.answer}
                              </span>
                            )}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2 items-start bg-[#F8F7FF] border border-[#E9E5FF] rounded-xl p-2.5">
                  <div className="w-5 h-5 rounded-full bg-[#6366F1] text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    AI
                  </div>
                  <p className="text-[11px] text-[#6B7280] leading-[1.4]">
                    {messages.bank.tip}
                    {notes.length > 0
                      ? t(messages.bank.matched, {
                          matched: notes.reduce((sum, note) => sum + note.matched.length, 0),
                          followUps: questions.filter((q) => q.isFollowUp).length,
                        })
                      : messages.bank.tipExample}
                  </p>
                </div>
              </>
            )}
          </div>

        <div className="bg-white rounded-[24px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-5 mb-4">
          <span className="text-[12px] font-[800] tracking-widest">{messages.wizard.textNotesTitle}</span>
          <textarea
            value={textNoteDraft}
            onChange={(event) => setTextNoteDraft(event.target.value)}
            rows={3}
            placeholder={messages.wizard.textNotesPlaceholder}
            className="mt-3 w-full px-4 py-3 rounded-2xl bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/10 resize-none"
          />
          <button
            type="button"
            onClick={addTextNote}
            className="mt-3 h-12 w-full rounded-full bg-black text-white text-[14px] font-bold active:scale-[0.98]"
          >
            {messages.wizard.textNotesAdd}
          </button>
        </div>

<div className="bg-white rounded-[24px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-5 mb-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-[800] tracking-widest">{messages.audio.title}</span>
              <span className="px-2 py-0.5 rounded-full bg-[#DBEAFE] text-[10px] font-bold text-[#2563EB]">
                BLUE
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-[#9CA3AF]">
                {String(Math.floor(audioSeconds / 60)).padStart(2, "0")}:
                {String(audioSeconds % 60).padStart(2, "0")}
              </span>
              <div className="flex items-end gap-[2px] h-[14px]">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div
                    key={index}
                    className={`w-[2px] rounded-full ${audioState === "recording" ? "bg-[#3B82F6] animate-pulse" : "bg-[#E5E7EB]"}`}
                    style={{ height: audioState === "recording" ? `${4 + ((index * 7) % 10)}px` : "4px" }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-col items-center">
            <div className="flex items-center gap-3">
              {audioState === "recording" ? (
                <>
                  <button
                    type="button"
                    onClick={() => finishAudioRecorder({ discard: false })}
                    className="h-12 min-w-[120px] px-4 rounded-full bg-[#EF4444] text-white text-[13px] font-bold active:scale-95 touch-manipulation"
                  >
                    {messages.audio.stop}
                  </button>
                  <button
                    type="button"
                    onClick={() => finishAudioRecorder({ discard: true })}
                    className="h-12 min-w-[96px] px-4 rounded-full bg-white border border-black/10 text-[13px] font-bold active:scale-95 touch-manipulation"
                  >
                    {messages.audio.cancel}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void openCapturePreflight("audio")}
                    disabled={audioState === "processing"}
                    className={`w-[88px] h-[88px] rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(59,130,246,0.35)] active:scale-95 transition-all disabled:opacity-70 ${
                      audioState === "processing" ? "bg-[#6366F1]" : "bg-[#3B82F6]"
                    }`}
                  >
                    <Mic
                      className={`w-8 h-8 text-white ${
                        audioState === "processing" ? "animate-pulse" : ""
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => audioImportInput.current?.click()}
                    disabled={audioState === "processing"}
                    className="w-[64px] h-[64px] rounded-full bg-[#F8FAFF] border border-[#DBEAFE] text-[#2563EB] flex flex-col items-center justify-center gap-0.5 active:scale-95 transition disabled:opacity-50"
                    title={messages.audio.importHint}
                  >
                    <Upload className="w-5 h-5" />
                    <span className="text-[9px] font-bold tracking-wide">{messages.audio.import}</span>
                  </button>
                </>
              )}
            </div>
            <input
              ref={audioImportInput}
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.aac,.caf"
              className="hidden"
              onChange={(event) => void onImportAudio(event)}
            />
            <div className="mt-3 text-center">
              <p className="text-[15px] font-bold">
                {audioState === "recording"
                  ? `${messages.audio.recording} ${String(Math.floor(audioSeconds / 60)).padStart(2, "0")}:${String(audioSeconds % 60).padStart(2, "0")}`
                  : audioState === "processing"
                    ? messages.audio.processing
                    : messages.audio.idle}
              </p>
              <p className="text-[12px] text-[#8A8A8A] mt-1">
                {messages.audio.pipeline}
              </p>
            </div>
            {permissionBanner ? (
              <MediaPermissionBanner
                status={permissionBanner.status}
                message={permissionBanner.message}
                settingsHint={messages.permissions.settingsHint}
                importLabel={messages.permissions.importInstead}
                onImport={() => {
                  setPermissionBanner(null);
                  audioImportInput.current?.click();
                }}
                onDismiss={() => setPermissionBanner(null)}
              />
            ) : null}
            {audioState === "recording" ? (
              <RecordingMarkerBar
                title={messages.audio.markerTitle}
                hint={messages.audio.markerHint}
                labels={messages.audio.markerTags}
                onAdd={addLiveMarker}
              />
            ) : null}
            {liveMarkers.length > 0 && audioState === "recording" ? (
              <ul className="mt-3 w-full space-y-1.5" aria-label={messages.audio.markerListTitle}>
                {liveMarkers.map((marker) => (
                  <li
                    key={marker.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] px-3 py-2 text-[12px]"
                  >
                    <span className="font-mono font-bold text-[#1D4ED8]">
                      {String(Math.floor(marker.timeSec / 60)).padStart(2, "0")}:
                      {String(Math.floor(marker.timeSec) % 60).padStart(2, "0")}
                    </span>
                    <span className="flex-1 font-semibold text-[#1E3A8A]">
                      {messages.audio.markerTags[marker.tagId]}
                    </span>
                    <button
                      type="button"
                      className="min-h-11 px-3 rounded-full text-[#991B1B] font-bold"
                      onClick={() => {
                        setLiveMarkers((current) => {
                          const next = removeAudioMarker(current, marker.id);
                          liveMarkersRef.current = next;
                          void flushDraftToIdb({ liveAudioMarkers: next });
                          return next;
                        });
                      }}
                    >
                      {messages.audio.markerDelete}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {notes.length > 0 && (
            <div className="mt-5 space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-xl bg-[#F8FAFF] border border-[#DBEAFE] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#2563EB] flex items-center gap-1">
                      <FileText className="w-3 h-3" />{" "}
                      {note.kind === "text"
                        ? messages.wizard.textNotesTitle
                        : t(messages.audio.noteLabel, { seconds: note.duration })}
                    </span>
                    <span className="text-[10px] text-[#6B7280]">
                      {note.kind === "text"
                        ? "文字"
                        : `已轉文字 · 匹配 ${note.matched.length} 題`}
                    </span>
                  </div>
                  <p className="text-[12px] leading-[1.5] mt-1.5 text-[#374151]">「{note.transcript}」</p>
                  {note.kind !== "text" ? (
                    <div className="mt-2">
                      {!audioPlaybackUrls[note.id] && note.mediaId ? (
                        <button
                          type="button"
                          className="h-11 w-full rounded-full bg-white border border-[#DBEAFE] text-[12px] font-bold text-[#2563EB]"
                          onClick={() => void ensureAudioPlaybackUrl(note)}
                        >
                          {messages.audio.markerPlay}
                        </button>
                      ) : null}
                      <AudioNotePlayer
                        src={audioPlaybackUrls[note.id]}
                        durationSec={note.duration}
                        markers={note.markers ?? []}
                        labels={messages.audio.markerTags}
                        playLabel={messages.audio.markerPlay}
                        markersTitle={messages.audio.markerListTitle}
                        editLabel={messages.audio.markerEdit}
                        deleteLabel={messages.audio.markerDelete}
                        notePlaceholder={messages.audio.markerNotePlaceholder}
                        saveLabel={messages.audio.markerSave}
                        cancelLabel={messages.permissions.cancel}
                        emptyMarkers={messages.audio.markerEmpty}
                        onUpdateMarker={(id, patch) => {
                          const next = updateAudioMarker(note.markers ?? [], id, patch);
                          updateNoteMarkers(note.id, next);
                        }}
                        onDeleteMarker={(id) => {
                          updateNoteMarkers(note.id, removeAudioMarker(note.markers ?? [], id));
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {aiSummary ? (
            <AiSummaryPanel
              summary={aiSummary}
              labels={messages.aiSummary}
              onEdit={(section, id, text) => {
                setAiSummary((current) => {
                  if (!current) return current;
                  const next = updateClaimText(current, section, id, text);
                  const nextPros = claimsToLegacyStrings(next.pros, 5);
                  const nextRisks = claimsToLegacyStrings(next.risks, 5);
                  if (nextPros.length) setPros(nextPros);
                  if (nextRisks.length) setRisks(nextRisks);
                  void flushDraftToIdb({
                    aiSummary: next,
                    ...(nextPros.length ? { pros: nextPros } : {}),
                    ...(nextRisks.length ? { risks: nextRisks } : {}),
                  });
                  return next;
                });
              }}
              onDelete={(section, id) => {
                setAiSummary((current) => {
                  if (!current) return current;
                  const next = softDeleteClaim(current, section, id);
                  const nextPros = claimsToLegacyStrings(next.pros, 5);
                  const nextRisks = claimsToLegacyStrings(next.risks, 5);
                  setPros(nextPros.length ? nextPros : messages.defaults.pros);
                  setRisks(nextRisks.length ? nextRisks : messages.defaults.risks);
                  void flushDraftToIdb({
                    aiSummary: next,
                    pros: nextPros,
                    risks: nextRisks,
                  });
                  return next;
                });
              }}
            />
          ) : null}
        </div>

        <FieldChecklistPanel
          title={messages.fieldChecklist.title}
          addLabel={messages.fieldChecklist.add}
          addPlaceholder={messages.fieldChecklist.addPlaceholder}
          notePlaceholder={messages.fieldChecklist.notePlaceholder}
          items={fieldChecklist}
          onToggle={(id) => {
            setFieldChecklist((current) => {
              const next = current.map((item) =>
                item.id === id ? { ...item, checked: !item.checked } : item,
              );
              void flushDraftToIdb({ fieldChecklist: next });
              return next;
            });
          }}
          onNoteChange={(id, note) => {
            setFieldChecklist((current) => {
              const next = current.map((item) => (item.id === id ? { ...item, note } : item));
              void flushDraftToIdb({ fieldChecklist: next });
              return next;
            });
          }}
          onAddCustom={(text) => {
            setFieldChecklist((current) => {
              const next = [
                ...current,
                createCustomChecklistItem(
                  text,
                  current.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1,
                ),
              ];
              void flushDraftToIdb({ fieldChecklist: next });
              return next;
            });
          }}
        />

        <div className="bg-white rounded-[24px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-5 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-[800] tracking-widest">{messages.photos.title}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F5F3F0] border border-black/5 font-mono">
              {photos.length}/5
            </span>
          </div>
          <p className="mt-2 text-[11px] text-[#6B7280]">{messages.photos.thumbHint}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="relative aspect-[4/3] rounded-xl overflow-hidden bg-[#F5F3F0] border border-black/5"
              >
                <button
                  type="button"
                  className="absolute inset-0"
                  aria-label={`${photo.tag}${photo.note ? ` · ${photo.note}` : ""}`}
                  onClick={() => {
                    void (async () => {
                      await ensurePhotoFullUrl(photo);
                      setExpandedPhotoId((current) => (current === photo.id ? null : photo.id));
                    })();
                  }}
                >
                  {photo.thumbUrl || photo.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.thumbUrl || photo.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#EEEAE4] text-[10px] text-[#9CA3AF]">
                      …
                    </div>
                  )}
                </button>
                <span className="absolute bottom-1 left-1 max-w-[90%] truncate px-1.5 py-0.5 rounded-full bg-black/70 text-white text-[9px]">
                  {photo.tag}
                </span>
                <button
                  type="button"
                  aria-label={messages.photos.editAnnotation}
                  onClick={() => openPhotoAnnotator(photo)}
                  className="absolute top-1 left-1 h-7 max-w-[70%] truncate px-2 rounded-full bg-black/70 text-white text-[9px] font-bold"
                >
                  {messages.photos.editAnnotation}
                </button>
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => void removePhoto(photo.id)}
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center"
                >
                  <X className="w-3 h-3" aria-hidden />
                </button>
              </div>
            ))}
            {photos.length < 5 && (
              <button
                type="button"
                onClick={() => void openCapturePreflight("photo")}
                className="aspect-[4/3] rounded-xl border-2 border-dashed border-black/10 bg-[#FAF7F3] flex flex-col items-center justify-center gap-1 hover:bg-[#F5F3F0] transition"
              >
                <Camera className="w-6 h-6 text-[#9CA3AF]" />
                <span className="text-[11px] font-medium text-[#6B7280]">{messages.photos.add}</span>
                <span className="text-[10px] text-[#9CA3AF]">{messages.photos.addSub}</span>
              </button>
            )}
          </div>
          {expandedPhotoId != null &&
            photos.some((photo) => photo.id === expandedPhotoId) && (
              <div className="mt-3 rounded-2xl overflow-hidden border border-black/10 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    photos.find((photo) => photo.id === expandedPhotoId)?.url ||
                    photos.find((photo) => photo.id === expandedPhotoId)?.thumbUrl
                  }
                  alt=""
                  className="w-full max-h-[320px] object-contain bg-black"
                />
                {photos.find((photo) => photo.id === expandedPhotoId)?.note ? (
                  <p className="px-3 py-2 text-[12px] text-white/90 bg-black">
                    {photos.find((photo) => photo.id === expandedPhotoId)?.note}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="w-full h-11 bg-white/10 text-white text-[12px] font-bold"
                  onClick={() => {
                    const photo = photos.find((item) => item.id === expandedPhotoId);
                    if (photo) openPhotoAnnotator(photo);
                  }}
                >
                  {messages.photos.editAnnotation}
                </button>
              </div>
            )}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => void onPhotos(event)}
          />
          <div className="mt-3 flex gap-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-2.5">
            <span className="text-[12px]">💡</span>
            <p className="text-[11px] leading-[1.5] text-[#166534]">
              {messages.photos.tip}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-[24px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-5 mb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
              <span className="text-[12px] font-[800] tracking-widest">{messages.video.title}</span>
              <span className="px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[10px] font-bold text-[#DC2626]">
                NATIVE CAMERA
              </span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F5F3F0] border border-black/5 font-mono">
              {clips.length}/4
            </span>
          </div>
          <div className="mt-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
            <p className="text-[11px] leading-[1.5] text-[#92400E]">
              {messages.video.warn}
            </p>
          </div>
          <div className="mt-5 flex flex-col items-center">
            <button
              onClick={openNativeCamera}
              disabled={clips.length >= 4}
              className="w-[88px] h-[88px] rounded-full flex flex-col items-center justify-center bg-[#EF4444] shadow-[0_8px_24px_rgba(239,68,68,0.35)] active:scale-95 transition-all disabled:opacity-40"
            >
              <Video className="w-7 h-7 text-white" />
            </button>
            <div className="mt-3 text-center">
              <p className="text-[15px] font-bold">{messages.video.start}</p>
              <p className="text-[12px] text-[#8A8A8A] mt-1">{messages.video.startSub}</p>
            </div>
          </div>
          <input
            ref={videoInput}
            type="file"
            accept="video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void onVideoFiles(e)}
          />
          {clips.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {clips.map((clip) => (
                <div key={clip.id} className="rounded-xl bg-[#1A1A1A] text-white overflow-hidden">
                  {clip.url && activeClipId === clip.id ? (
                    <video
                      src={clip.url}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full aspect-video bg-black object-cover"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveClipId(clip.id)}
                      className="w-full aspect-video bg-[#111] flex items-center justify-center text-[12px] font-bold"
                    >
                      <Video className="w-6 h-6 mr-2" /> 播放
                    </button>
                  )}
                  <div className="p-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold truncate">{clip.label}</p>
                      <p className="text-[10px] opacity-60">
                        {clip.time}
                        {clip.durationSec ? ` · ${clip.durationSec}s` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 w-full rounded-full bg-[#F8F4EF] border border-dashed border-black/10 py-2.5 px-3 text-[11px] text-[#6B7280] text-left leading-[1.4]">
            {messages.video.tip}
          </p>
        </div>
          </>
        )}

        {wizardStep === 3 && (
          <StepShare
            checklist={shareChecklist}
            checklistLabels={{
              address: messages.wizard.checkAddress,
              viewingAt: messages.wizard.checkViewingAt,
              fieldContent: messages.wizard.checkFieldContent,
              syncOk: messages.wizard.checkSyncOk,
            }}
            checklistTitle={messages.wizard.checklistTitle}
            progressLabel={messages.wizard.progress}
            sessionUiStatus={sessionUiStatus}
            syncingCard={syncingCard}
            syncMessage={syncMessage}
            syncLabels={messages.sync}
            canGenerate={canShare}
            generateLabel={syncingCard ? messages.share.uploading : messages.share.button}
            generateHint={
              canShare
                ? user
                  ? messages.share.readyLoggedIn
                  : messages.share.readyGuest
                : messages.share.needMore
            }
            onGenerate={() => void handleGenerateCard()}
            shareAccessLabels={messages.shareAccess}
            shareUrl={shareUrl}
            hasShareToken={Boolean(shareToken)}
            shareLastUpdatedAt={
              typeof propertyDraft.decisionSummary === "object" &&
              propertyDraft.decisionSummary &&
              "generatedAt" in (propertyDraft.decisionSummary as object) &&
              typeof (propertyDraft.decisionSummary as { generatedAt?: unknown }).generatedAt ===
                "string"
                ? (propertyDraft.decisionSummary as { generatedAt: string }).generatedAt
                : clientUpdatedAtRef.current
            }
            viewingId={viewingId}
            shareLink={shareLink}
            onCopyShareLink={() => {
              if (!shareUrl) return;
              void navigator.clipboard?.writeText(shareUrl);
              alert(messages.card.copyLink);
            }}
            onShareLinkChanged={({ link, urlPath }) => {
              setShareLink(link);
              if (urlPath === "") {
                setShareToken(null);
                setShareUrl("");
                return;
              }
              if (link?.token) {
                setShareToken(link.token);
                setShareUrl(`${window.location.origin}/s/${link.token}`);
              } else if (urlPath) {
                setShareUrl(
                  urlPath.startsWith("http")
                    ? urlPath
                    : `${window.location.origin}${urlPath}`,
                );
                const token = urlPath.split("/").pop() || null;
                if (token) setShareToken(token);
              }
            }}
          />
        )}

        <WizardBottomNav
          backLabel={messages.wizard.back}
          nextLabel={
            wizardStep === 3
              ? syncingCard
                ? messages.share.uploading
                : messages.share.button
              : messages.wizard.next
          }
          onBack={wizardStep > 1 ? () => goToStep((wizardStep - 1) as WizardStep) : undefined}
          onNext={() => {
            if (wizardStep === 3) {
              void handleGenerateCard();
              return;
            }
            goToStep((wizardStep + 1) as WizardStep);
          }}
          nextDisabled={
            wizardStep === 3
              ? !canShare || syncingCard
              : wizardStep === 1
                ? !isStep1Complete({ address, viewingAt })
                : false
          }
        />

        {showLoginGate && (
          <div className="fixed inset-0 z-50 flex justify-center bg-black/40 backdrop-blur-[2px] p-4 overflow-auto">
            <div className="w-full max-w-[420px] my-auto bg-white rounded-[24px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[18px] font-bold">{messages.loginGate.title}</h3>
                  <p className="text-[12px] text-[#8A8A8A] mt-1 leading-[1.45]">
                    {messages.loginGate.body}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLoginGate(false)}
                  className="w-8 h-8 rounded-full bg-[#F5F3F0] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={(event) => void handleLoginForCard(event)} className="mt-4 space-y-3">
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder={messages.loginGate.email}
                  className="w-full h-[44px] px-4 rounded-full bg-[#F8F4EF] border border-black/5 text-[14px] outline-none"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder={messages.loginGate.password}
                  className="w-full h-[44px] px-4 rounded-full bg-[#F8F4EF] border border-black/5 text-[14px] outline-none"
                />
                <button
                  type="submit"
                  disabled={syncingCard}
                  className="w-full h-[46px] rounded-full bg-black text-white text-[14px] font-bold disabled:opacity-60"
                >
                  {syncingCard
                    ? messages.loginGate.processing
                    : loginMode === "signin"
                      ? messages.loginGate.submitSignIn
                      : messages.loginGate.submitSignUp}
                </button>
              </form>

              {loginError && (
                <p className="mt-3 text-[12px] text-[#991B1B] leading-[1.4]">{loginError}</p>
              )}

              <button
                type="button"
                onClick={() => {
                  setLoginMode((current) => (current === "signin" ? "signup" : "signin"));
                  setLoginError("");
                }}
                className="mt-4 text-[12px] font-medium text-[#6B7280]"
              >
                {loginMode === "signin"
                  ? messages.loginGate.switchToSignUp
                  : messages.loginGate.switchToSignIn}
              </button>
            </div>
          </div>
        )}

        {showPaywall && (
          <div className="fixed inset-0 z-50 flex justify-center bg-black/40 backdrop-blur-[2px] p-4 overflow-auto">
            <div className="w-full max-w-[420px] my-auto bg-white rounded-[24px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[18px] font-bold">{messages.paywall.title}</h3>
                  <p className="text-[12px] text-[#8A8A8A] mt-1 leading-[1.45]">
                    {messages.paywall.body}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPaywall(false)}
                  className="w-8 h-8 rounded-full bg-[#F5F3F0] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 rounded-[18px] bg-[#111] text-white p-4">
                <p className="text-[11px] tracking-[0.16em] opacity-60">KANFANGJI PRO</p>
                <p className="text-[28px] font-[800] mt-1">
                  $6.99
                  <span className="text-[13px] font-medium opacity-70"> {messages.paywall.perMonth}</span>
                </p>
                <ul className="mt-3 space-y-1.5 text-[12px] opacity-90">
                  <li>{messages.paywall.feature1}</li>
                  <li>{messages.paywall.feature2}</li>
                  <li>{messages.paywall.feature3}</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => void startCheckout()}
                disabled={checkoutLoading}
                className="mt-4 w-full h-[48px] rounded-full bg-black text-white text-[14px] font-bold disabled:opacity-60"
              >
                {checkoutLoading ? messages.paywall.loading : messages.paywall.cta}
              </button>
              <p className="mt-3 text-[11px] text-[#9CA3AF] text-center">
                {messages.paywall.footer}
              </p>
            </div>
          </div>
        )}

        {showCard && cardDraft && (
          <div
            className="fixed inset-0 z-[60] flex justify-center bg-black/40 backdrop-blur-[2px] p-3 sm:p-4 overflow-auto"
            role="dialog"
            aria-modal="true"
            onClick={() => setShowCard(false)}
          >
            <div
              className="w-full max-w-[720px] my-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="relative">
                <button
                  type="button"
                  aria-label={messages.card.close}
                  onClick={() => setShowCard(false)}
                  className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/70 text-white hover:bg-black/80 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
                <DecisionSummaryCard
                  snapshot={cardDraft}
                  mode="preview"
                  editing={editingCard}
                  onToggleEditing={() => setEditingCard((value) => !value)}
                  onToggleText={(section, id) =>
                    setCardDraft((current) =>
                      current ? toggleTextSelection(current, section, id) : current,
                    )
                  }
                  onTogglePhoto={(id) =>
                    setCardDraft((current) =>
                      current ? togglePhotoSelection(current, id) : current,
                    )
                  }
                  onUpdateText={(section, id, text) =>
                    setCardDraft((current) =>
                      current ? updateTextItem(current, section, id, text) : current,
                    )
                  }
                  onSetRating={(rating) =>
                    setCardDraft((current) =>
                      current ? setOverallRating(current, rating) : current,
                    )
                  }
                  labels={{
                    eyebrow: messages.card.eyebrow,
                    address: messages.card.address,
                    viewingAt: messages.card.viewingAt,
                    basics: messages.card.basics,
                    unit: messages.card.unit,
                    price: messages.card.price,
                    layout: messages.card.layout,
                    area: messages.card.area,
                    managementFee: messages.card.managementFee,
                    listingUrl: messages.card.listingUrl,
                    setupNotes: messages.card.setupNotes,
                    rating: messages.card.rating,
                    ratingEmpty: messages.card.ratingEmpty,
                    pros: messages.card.pros,
                    risks: messages.card.risks,
                    photos: messages.card.photos,
                    photoNote: messages.card.photoNote,
                    facts: messages.card.facts,
                    followUps: messages.card.followUps,
                    actionItems: messages.card.actionItems,
                    emptySection: messages.card.emptySection,
                    selectHint: messages.card.selectHint,
                    disclaimer: messages.card.disclaimer,
                    generatedAt: messages.card.generatedAt,
                    shareSelected: messages.card.share,
                    edit: messages.wizard.editCard,
                    doneEdit: messages.wizard.saveEdits,
                  }}
                  footer={
                    <div className="space-y-3 pt-1">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={copyCard}
                          className="flex-1 h-[44px] rounded-full bg-black text-white text-[13px] font-bold flex items-center justify-center gap-2"
                        >
                          <Copy className="w-4 h-4" />{" "}
                          {shareUrl ? messages.card.copyLink : messages.card.copy}
                        </button>
                        <button
                          type="button"
                          onClick={shareCard}
                          className="flex-1 h-[44px] rounded-full bg-[#F5F3F0] border border-black/10 text-[13px] font-bold flex items-center justify-center gap-2"
                        >
                          <Share2 className="w-4 h-4" /> {messages.card.shareLink}
                        </button>
                      </div>
                      <PdfExportButton
                        snapshot={cardDraft}
                        photoSources={photos.map((photo) => ({
                          id: String(photo.id),
                          url: photo.url || photo.thumbUrl,
                          mediaId: photo.mediaId,
                        }))}
                        locale={locale}
                        documentLabels={{
                          title: messages.card.eyebrow,
                          viewingAt: messages.card.viewingAt,
                          basics: messages.card.basics,
                          unit: messages.card.unit,
                          price: messages.card.price,
                          layout: messages.card.layout,
                          area: messages.card.area,
                          managementFee: messages.card.managementFee,
                          listingUrl: messages.card.listingUrl,
                          setupNotes: messages.card.setupNotes,
                          rating: messages.card.rating,
                          ratingEmpty: messages.card.ratingEmpty,
                          pros: messages.card.pros,
                          risks: messages.card.risks,
                          photos: messages.card.photos,
                          photoNote: messages.card.photoNote,
                          facts: messages.card.facts,
                          followUps: messages.card.followUps,
                          actionItems: messages.card.actionItems,
                          emptySection: messages.card.emptySection,
                          generatedAt: messages.card.generatedAt,
                          page: messages.pdfExport.page,
                        }}
                        uiLabels={messages.pdfExport}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCard(false)}
                        className="w-full h-[42px] rounded-full border border-black/10 text-[13px] font-bold text-[#6B7280]"
                      >
                        {messages.card.close}
                      </button>
                      {shareUrl ? (
                        <a
                          href={shareUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[11px] text-center text-[#2563EB] break-all underline-offset-2 hover:underline"
                        >
                          {shareUrl}
                        </a>
                      ) : null}
                      <p className="text-[10px] text-center text-[#9CA3AF]">
                        {viewingId ? messages.card.syncedHint : messages.card.localPreview}
                      </p>
                    </div>
                  }
                />
              </div>
            </div>
          </div>
        )}

        <SharePrivacyCheck
          open={showPrivacyCheck}
          labels={{
            title: messages.card.privacyTitle,
            body: messages.card.privacyBody,
            address: messages.card.privacyAddress,
            photos: messages.card.privacyPhotos,
            personal: messages.card.privacyPersonal,
            confirm: messages.card.privacyConfirm,
            cancel: messages.card.privacyCancel,
          }}
          onCancel={() => {
            setShowPrivacyCheck(false);
            setPrivacyAction(null);
          }}
          onConfirm={() => {
            const action = privacyAction;
            setShowPrivacyCheck(false);
            setPrivacyAction(null);
            if (action) void performShareAction(action);
          }}
        />
        <div className="h-4" />
      </div>
    </div>
  );
}
