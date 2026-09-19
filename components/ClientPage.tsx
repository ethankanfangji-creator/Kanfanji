"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
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
import { MediaPickerInputs } from "@/components/media/MediaPickerInputs";
import { AudioNotePlayer } from "@/components/media/AudioNotePlayer";
import {
  selectSupportedAudioMimeType,
  useMediaCapture,
} from "@/components/media/useMediaCapture";
import { PhotoAnnotator } from "@/components/viewing-wizard/PhotoAnnotator";
import { QuestionList } from "@/components/viewing-wizard/questions";
import { StepSetup } from "@/components/viewing-wizard/StepSetup";
import { StepShare } from "@/components/viewing-wizard/StepShare";
import { WizardBottomNav, WizardStepper } from "@/components/viewing-wizard/WizardStepper";
import { useViewingSyncController } from "@/components/viewing-wizard/useViewingSyncController";
import { DecisionSummaryCard } from "@/components/share-card/DecisionSummaryCard";
import { SharePrivacyCheck } from "@/components/share-card/SharePrivacyCheck";
import { CardImageExportButton } from "@/components/share-card/CardImageExportButton";
import { Dialog } from "@/components/ui/Dialog";
import { LoginGateDialog } from "@/components/auth/LoginGateDialog";
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
  removeAudioMarker,
  serializeMarkersForAi,
  updateAudioMarker,
  type AudioMarker,
} from "@/lib/audio-markers";
import {
  claimsToLegacyStrings,
  softDeleteClaim,
  updateClaimText,
  validateAndNormalizeSummary,
  type ViewingAiSummary,
} from "@/lib/ai-summary";
import {
  AI_CONSENT_VERSION,
  blobToDataUrl,
  mapWithConcurrency,
  normalizeImageForAi,
  runIfAiConsented,
} from "@/lib/ai-boundary/client";
import {
  applyCommittedAiJob,
  completeAiJobIfLeaseHeld,
  failAiJobIfLeaseHeld,
} from "@/lib/ai-boundary/job-commit";
import { AiSummaryPanel } from "@/components/media/AiSummaryPanel";
import {
  createImageThumbnail,
  ensureFieldChecklist,
  normalizePhotoTagId,
  PHOTO_TAG_IDS,
  type FieldChecklistItem,
  type PhotoTagId,
} from "@/lib/field-capture";
import {
  deleteMedia,
  claimLegacyUnscopedDraft,
  discoverLegacyUnscopedDraft,
  emptyDraft,
  getActiveDraft,
  getMedia,
  listMedia,
  putActiveDraft,
  putMedia,
  clearActiveDraft,
  requirePersistence,
  saveBlobAsMedia,
  setPersistenceAccountScope,
  updateMediaFields,
  type LegacyDraftClaimStatus,
} from "@/lib/idb/draft-store";
import {
  DraftDb,
  accountScopeForUser,
  createEntityId,
  type AiJob,
} from "@/lib/draft-db";
import { createSignedMediaUrl, extensionFor } from "@/lib/media";
import { takeInputFiles, validateImportedMedia } from "@/lib/media-import";
import {
  decideCaptureStart,
  hasCaptureExplained,
  markCaptureExplained,
  type CaptureKind,
  type MediaPermissionStatus,
} from "@/lib/media-permissions";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  auditViewingSessionBridge,
  resetSyncEngineSingleton,
  syncStatusToUi,
  type SessionUiStatus,
} from "@/lib/sync";
import { claimGuestViewingData } from "@/lib/auth/claim-guest-data";
import {
  canEnterStep,
  canGenerateShareCard,
  fromDatetimeLocalValue,
  getPublishReadiness,
  getShareChecklist,
  getStepStatus,
  isStep1Complete,
  mirrorSetupIntoPropertyDraft,
  toDatetimeLocalValue,
  type WizardStep,
} from "@/lib/viewing-wizard/readiness";
import type { GenerateStageId } from "@/lib/viewing-wizard/generate-stages";
import {
  mergeAddressLookupPropertyDraft,
  resolveLookupDisplayAddress,
} from "@/lib/viewing-wizard/address-autofill";
import {
  deriveWorkflowStatus,
  normalizeWorkflowStatus,
  shouldPromptAddressSwitch,
  type ViewingWorkflowStatus,
} from "@/lib/viewing-wizard/workflow";
import {
  initialViewingDraftFormState,
  viewingDraftFormReducer,
} from "@/lib/viewing-wizard/draft-state";
import {
  deriveFieldChecklistFromQuestions,
  ensureDefaultFieldQuestions,
  mergeChecklistIntoQuestions,
  presentWizardQuestions,
  type QuestionAnswerPreview,
  type WizardQuestion,
} from "@/lib/viewing-wizard/questions";
import type { User } from "@supabase/supabase-js";

type Question = WizardQuestion;

type AudioNote = {
  id: number;
  duration: number;
  transcript: string;
  matched: number[];
  mediaId?: string;
  kind?: "transcript" | "text";
  markers?: AudioMarker[];
  aiJobId?: string;
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

type AiConsentDecision = {
  version: string;
  sessionId: string;
  decision: "accepted" | "declined";
  decidedAt: string;
};

const FREE_VIEWING_LIMIT = 3;

export function ClientPage() {
  const router = useRouter();
  const { locale, messages, t } = useI18n();
  const { adapter: mediaPermissionAdapter } = useMediaCapture();
  const [draftForm, dispatchDraftForm] = useReducer(
    viewingDraftFormReducer,
    initialViewingDraftFormState,
  );
  const draftFormTouchedRef = useRef(new Set<keyof typeof initialViewingDraftFormState>());
  const {
    wizardStep,
    address,
    viewingAt,
    unitLabel,
    priceLabel,
    layoutLabel,
    areaLabel,
    managementFeeLabel,
    listingUrl,
    setupNotes,
  } = draftForm;
  const setWizardStep = (value: WizardStep) =>
    dispatchDraftForm({ type: "setStep", value });
  const setDraftField = (
    field: Exclude<keyof typeof draftForm, "wizardStep">,
    value: string,
  ) => {
    draftFormTouchedRef.current.add(field);
    dispatchDraftForm({ type: "setField", field, value });
  };
  const hydrateDraftForm = useCallback((value: Partial<typeof draftForm>) => {
    const untouched = { ...value };
    for (const field of draftFormTouchedRef.current) delete untouched[field];
    dispatchDraftForm({ type: "hydrate", value: untouched });
  }, []);
  const setAddress = (value: string) => setDraftField("address", value);
  const setViewingAt = (value: string) => setDraftField("viewingAt", value);
  const setUnitLabel = (value: string) => setDraftField("unitLabel", value);
  const setPriceLabel = (value: string) => setDraftField("priceLabel", value);
  const setLayoutLabel = (value: string) => setDraftField("layoutLabel", value);
  const setAreaLabel = (value: string) => setDraftField("areaLabel", value);
  const setManagementFeeLabel = (value: string) =>
    setDraftField("managementFeeLabel", value);
  const setListingUrl = (value: string) => setDraftField("listingUrl", value);
  const setSetupNotes = (value: string) => setDraftField("setupNotes", value);
  const [textNoteDraft, setTextNoteDraft] = useState("");
  const [lookupError, setLookupError] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const [activeClipId, setActiveClipId] = useState<number | null>(null);
  const [expandedPhotoId, setExpandedPhotoId] = useState<number | null>(null);
  const [editingCard, setEditingCard] = useState(false);
  const [fieldChecklist, setFieldChecklist] = useState<FieldChecklistItem[]>([]);
  const [liveMarkers, setLiveMarkers] = useState<AudioMarker[]>([]);
  const [aiSummary, setAiSummary] = useState<ViewingAiSummary | null>(null);
  const [aiConsent, setAiConsent] = useState<AiConsentDecision | null>(null);
  const [showAiConsent, setShowAiConsent] = useState(false);
  const aiConsentResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const [audioPlaybackUrls, setAudioPlaybackUrls] = useState<Record<number, string>>({});
  const [annotatingPhotoId, setAnnotatingPhotoId] = useState<number | null>(null);
  const [annotateTagId, setAnnotateTagId] = useState<PhotoTagId>("other");
  const [annotateNote, setAnnotateNote] = useState("");
  const [preflightKind, setPreflightKind] = useState<CaptureKind | null>(null);
  const [preflightStatus, setPreflightStatus] = useState<MediaPermissionStatus | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [pendingAnswerQuestionId, setPendingAnswerQuestionId] = useState<number | null>(null);
  const pendingAnswerQuestionIdRef = useRef<number | null>(null);
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
  const audioInterruptedRef = useRef(false);
  const liveMarkersRef = useRef<AudioMarker[]>([]);
  const captureLockRef = useRef<CaptureKind | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const photosRef = useRef<Photo[]>([]);
  const clipsRef = useRef<Clip[]>([]);
  const photoCaptureInput = useRef<HTMLInputElement>(null);
  const photoGalleryInput = useRef<HTMLInputElement>(null);
  const videoCaptureInput = useRef<HTMLInputElement>(null);
  const videoGalleryInput = useRef<HTMLInputElement>(null);
  const audioImportInput = useRef<HTMLInputElement>(null);
  const [showCard, setShowCard] = useState(false);
  const [cardDraft, setCardDraft] = useState<DecisionSummarySnapshot | null>(null);
  const [showPrivacyCheck, setShowPrivacyCheck] = useState(false);
  const [privacyAction, setPrivacyAction] = useState<"copy" | "share" | "exportImage" | null>(
    null,
  );
  const [exportImageArmed, setExportImageArmed] = useState(false);
  const [showLoginGate, setShowLoginGate] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [syncingCard, setSyncingCard] = useState(false);
  const [generateStage, setGenerateStage] = useState<GenerateStageId | null>(null);
  const [generateFailed, setGenerateFailed] = useState(false);
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
  const [authReady, setAuthReady] = useState(() => !isSupabaseConfigured());
  const [legacyDraftClaim, setLegacyDraftClaim] = useState<LegacyDraftClaimStatus>({
    status: "none",
  });
  const [claimingLegacyDraft, setClaimingLegacyDraft] = useState(false);
  const [draftReloadGeneration, setDraftReloadGeneration] = useState(0);
  const legacyClaimBlockedRef = useRef(false);
  const [freeCount, setFreeCount] = useState(0);
  const [isPro, setIsPro] = useState(false);
  const { getEngine: getViewingSyncEngine } = useViewingSyncController({
    userId: user?.id ?? null,
    isPro,
  });
  const clientUpdatedAtRef = useRef(new Date().toISOString());
  const autosaveTimer = useRef<number | null>(null);
  const draftHydratedRef = useRef(false);
  const persistGenerationRef = useRef(0);
  const notesRef = useRef<AudioNote[]>([]);
  const draftSessionIdRef = useRef<string | null>(null);
  const committedAddressRef = useRef("");
  const [workflowStatus, setWorkflowStatus] = useState<ViewingWorkflowStatus>("draft");
  const [pendingAddressSwitch, setPendingAddressSwitch] = useState<{
    nextAddress: string;
    payload: {
      market?: "CA" | "TH" | "OTHER";
      displayAddress?: string;
      tags?: string[];
      source?: string;
      propertyId?: string;
      details?: Record<string, unknown>;
    };
  } | null>(null);
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
    aiConsent: null as AiConsentDecision | null,
  });

  const configured = isSupabaseConfigured();
  const userIdForLegacyClaim = user?.id;

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setPersistenceAccountScope(null);
      return;
    }

    void supabase.auth.getUser()
      .then(({ data }) => {
        setPersistenceAccountScope(data.user?.id ?? null);
        if (!data.user) setLegacyDraftClaim({ status: "none" });
        setUser(data.user);
      })
      .catch(() => {
        setPersistenceAccountScope(null);
        setLegacyDraftClaim({ status: "none" });
        setUser(null);
      })
      .finally(() => setAuthReady(true));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        resetSyncEngineSingleton();
        router.replace("/login");
      }
      setPersistenceAccountScope(session?.user?.id ?? null);
      if (!session?.user) setLegacyDraftClaim({ status: "none" });
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!authReady || !userIdForLegacyClaim) {
      legacyClaimBlockedRef.current = false;
      return;
    }
    let cancelled = false;
    void discoverLegacyUnscopedDraft(userIdForLegacyClaim).then((status) => {
      if (!cancelled) {
        legacyClaimBlockedRef.current =
          status.status === "available" || status.status === "copied";
        setLegacyDraftClaim(status);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, userIdForLegacyClaim]);

  async function claimLegacyDraft() {
    if (
      !user ||
      (legacyDraftClaim.status !== "available" && legacyDraftClaim.status !== "copied")
    ) return;
    setClaimingLegacyDraft(true);
    try {
      const result = await claimLegacyUnscopedDraft(user.id);
      setLegacyDraftClaim(result);
      if (result.status === "verified") {
        legacyClaimBlockedRef.current = false;
        setLegacyDraftClaim({ status: "none" });
        setDraftReloadGeneration((value) => value + 1);
      }
    } finally {
      setClaimingLegacyDraft(false);
    }
  }

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
        const engine = await getViewingSyncEngine(user.id);
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
      if (!draftReady) return;
      void recoverAiJobs();
      if (!user) return;
      void (async () => {
        try {
          const engine = await getViewingSyncEngine(user.id);
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
    if (!draftReady || aiConsent?.decision !== "accepted") return;
    void recoverAiJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, aiConsent?.decision, aiConsent?.version, user?.id]);

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
      aiConsent,
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
    aiConsent,
  ]);

  async function resolveExistingLocalSessionId(): Promise<string | null> {
    if (draftSessionIdRef.current) return draftSessionIdRef.current;
    const existing = await getActiveDraft();
    if (existing?.localSessionId) {
      draftSessionIdRef.current = existing.localSessionId;
      return existing.localSessionId;
    }
    return null;
  }

  /** Mint a stable local viewing id only after address confirm / explicit new record. */
  async function createStableLocalSessionId(): Promise<string> {
    const existing = await resolveExistingLocalSessionId();
    if (existing) return existing;
    const id = createEntityId();
    draftSessionIdRef.current = id;
    return id;
  }

  async function ensureLocalSessionId(): Promise<string> {
    // Sync / AI paths: reuse the confirmed session; create only if field work already began.
    return createStableLocalSessionId();
  }

  async function ensureAiConsent(): Promise<{ accepted: boolean; sessionId: string }> {
    const sessionId = await ensureLocalSessionId();
    const current = aiConsent;
    if (
      current?.decision === "accepted" &&
      current.version === AI_CONSENT_VERSION &&
      current.sessionId === sessionId
    ) {
      return { accepted: true, sessionId };
    }
    const accepted = await new Promise<boolean>((resolve) => {
      aiConsentResolverRef.current = resolve;
      setShowAiConsent(true);
    });
    const decision: AiConsentDecision = {
      version: AI_CONSENT_VERSION,
      sessionId,
      decision: accepted ? "accepted" : "declined",
      decidedAt: new Date().toISOString(),
    };
    setAiConsent(decision);
    await flushDraftToIdb({ localSessionId: sessionId, aiConsent: decision });
    if (!accepted) setSyncMessage(messages.aiBoundary.declined);
    return { accepted, sessionId };
  }

  function decideAiConsent(accepted: boolean) {
    setShowAiConsent(false);
    const resolve = aiConsentResolverRef.current;
    aiConsentResolverRef.current = null;
    resolve?.(accepted);
  }

  function applyPhotoAiQuestion(jobId: string, text: string, tag: string) {
    setQuestions((current) => {
      if (current.some((question) => question.aiJobId === jobId)) return current;
      const base =
        current.length > 0
          ? current
          : bankQuestions(locale, marketCode).map((question) => ({
              ...question,
              checked: false,
            }));
      return [
        {
          id: base.reduce((max, question) => Math.max(max, question.id), 0) + 1,
          text,
          checked: false,
          isDynamic: true,
          source: "photo",
          basedOn: tag,
          aiJobId: jobId,
        },
        ...base,
      ];
    });
  }

  async function applyRecoveredAudioResult(
    result: Record<string, unknown>,
    job: AiJob,
  ): Promise<void> {
    const summary = result.summary as ViewingAiSummary | undefined;
    const transcript = typeof result.transcript === "string" ? result.transcript : "";
    const noteId = typeof result.noteId === "number" ? result.noteId : Date.now();
    if (!summary || !transcript) return;
    const nextNote: AudioNote = {
      id: noteId,
      duration: Number(result.durationSec) || 1,
      transcript,
      matched: Array.isArray(result.matched) ? (result.matched as number[]) : [],
      mediaId: typeof result.mediaId === "string" ? result.mediaId : job.mediaId,
      kind: "transcript",
      markers: Array.isArray(result.markers) ? (result.markers as AudioMarker[]) : [],
      aiJobId: job.id,
    };
    const nextNotes = notesRef.current.some((note) => note.aiJobId === job.id)
      ? notesRef.current
      : [...notesRef.current, nextNote];
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    setAiSummary(summary);
    const nextPros = claimsToLegacyStrings(summary.pros, 5);
    const nextRisks = claimsToLegacyStrings(summary.risks, 5);
    if (nextPros.length) setPros(nextPros);
    if (nextRisks.length) setRisks(nextRisks);
    await flushDraftToIdb({
      notes: nextNotes,
      pros: nextPros.length ? nextPros : pros,
      risks: nextRisks.length ? nextRisks : risks,
      aiSummary: summary,
    });
  }

  async function recoverAiJobs() {
    if (
      !draftReady ||
      !navigator.onLine ||
      aiConsent?.decision !== "accepted" ||
      aiConsent.version !== AI_CONSENT_VERSION
    ) {
      return;
    }
    const scope = accountScopeForUser(user?.id ?? null);
    const db = await DraftDb.open({ accountScope: scope });
    let job: AiJob | null = null;
    try {
      const completed = (await db.aiJobs.list()).filter(
        (item) => item.syncStatus === "synced" && !item.appliedAt,
      );
      for (const item of completed) {
        await applyCommittedAiJob(db.aiJobs, item, async (result) => {
          if (item.kind === "photo") {
            const text = typeof result.text === "string" ? result.text : "";
            const tag = typeof result.tag === "string" ? result.tag : "";
            if (text) applyPhotoAiQuestion(item.id, text, tag);
          } else {
            await applyRecoveredAudioResult(result, item);
          }
        });
      }
      job = await db.aiJobs.claimNext(`browser-${crypto.randomUUID()}`);
    } finally {
      db.close();
    }
    if (!job || job.consentVersion !== AI_CONSENT_VERSION) return;
    const media = await getMedia(job.mediaId);
    if (!media?.blob) {
      const failed = await DraftDb.open({ accountScope: scope });
      try {
        await failAiJobIfLeaseHeld(failed.aiJobs, job, "media_missing");
      } finally {
        failed.close();
      }
      return;
    }
    if (job.kind === "audio") {
      await processRecording(
        media.blob,
        Number(job.payload.durationSec) || 1,
        media.id,
        Array.isArray(job.payload.markers) ? (job.payload.markers as AudioMarker[]) : undefined,
        job,
      );
      return;
    }
    try {
      const derivative = await normalizeImageForAi(media.blob);
      const response = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64: await blobToDataUrl(derivative),
          tag: typeof job.payload.tag === "string" ? job.payload.tag : "on-site",
          locale,
          market: marketCode,
          mediaId: job.mediaId,
          consentVersion: AI_CONSENT_VERSION,
          consentSessionId: job.sessionId,
          identityKind: user ? "user" : "guest",
        }),
      });
      const payload = (await response.json()) as { question?: string; code?: string };
      if (!response.ok || !payload.question) throw new Error(payload.code || "ai_failed");
      const complete = await DraftDb.open({ accountScope: scope });
      try {
        const completed = await completeAiJobIfLeaseHeld(complete.aiJobs, job, {
          text: payload.question,
          tag: typeof job.payload.tag === "string" ? job.payload.tag : "on-site",
          mediaId: job.mediaId,
        });
        if (!completed) return;
        await applyCommittedAiJob(complete.aiJobs, completed, (result) => {
          const text = typeof result.text === "string" ? result.text : "";
          const tag = typeof result.tag === "string" ? result.tag : "";
          if (text) applyPhotoAiQuestion(completed.id, text, tag);
        });
      } finally {
        complete.close();
      }
    } catch (error) {
      const failed = await DraftDb.open({ accountScope: scope });
      try {
        await failAiJobIfLeaseHeld(
          failed.aiJobs,
          job,
          error instanceof Error ? error.message : "ai_failed",
        );
      } finally {
        failed.close();
      }
    }
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
      const engine = await getViewingSyncEngine();
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
      aiConsent: AiConsentDecision | null;
      workflowStatus: ViewingWorkflowStatus;
    }>,
  ) {
    if (!draftHydratedRef.current) return false;
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
        committedAddress: committedAddressRef.current || snap.address,
        workflowStatus: patch?.workflowStatus ?? workflowStatus,
      };
      const persisted = await putActiveDraft({
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
        workflowStatus: patch?.workflowStatus ?? workflowStatus,
        viewingAt: snap.viewingAt,
        unitLabel: snap.unitLabel,
        priceLabel: snap.priceLabel,
        layoutLabel: snap.layoutLabel,
        listingUrl: snap.listingUrl,
        setupNotes: snap.setupNotes,
        fieldChecklist: snap.fieldChecklist,
        liveAudioMarkers: snap.liveAudioMarkers,
        aiSummary: snap.aiSummary,
        aiConsent: snap.aiConsent,
      });
      requirePersistence(persisted);
      if (!sessionUiStatus || sessionUiStatus.status === "local_only" || !user) {
        setSessionUiStatus(syncStatusToUi(snap.viewingId && user ? "pending" : "local_only"));
      }
      return true;
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "本機草稿儲存失敗");
      return false;
    }
  }

  /**
   * Bridge UI/lib/idb draft → DraftDb, enqueue syncQueue, process per-item uploads.
   * Uses existing Supabase helpers via ViewingSyncAdapter (no new HTTP routes).
   */
  async function syncViaQueue(
    options?: { openCard?: boolean },
    authenticatedUser: User | null = user,
  ) {
    const engine = await getViewingSyncEngine(authenticatedUser?.id ?? null);
    const sessionId = await ensureLocalSessionId();
    const mediaRows = await listMedia();
    const snap = draftSnapshotRef.current;

    await engine.importActiveDraft({
      sessionId,
      userId: authenticatedUser?.id ?? null,
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
      workflowStatus,
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
    const bridgeAudit = auditViewingSessionBridge({
      expectedSessionId: sessionId,
      expectedAddress: snap.address.trim(),
      expectedMediaIds: mediaRows.map((row) => row.id),
      session: await engine.getSession(sessionId),
      media: await engine.listSessionMedia(sessionId),
    });
    if (!bridgeAudit.ok) {
      throw new Error(`本機草稿鏡像驗證失敗：${bridgeAudit.issues.join(", ")}`);
    }

    if (!authenticatedUser) {
      await flushDraftToIdb({ localSessionId: sessionId, syncStatus: "local_only" });
      await refreshSessionUi(sessionId);
      return { sessionId, skippedOffline: true as const, remoteViewingId: null };
    }

    setSessionUiStatus(syncStatusToUi("syncing"));
    await engine.enqueueSession(sessionId, { userId: authenticatedUser.id });
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
        requirePersistence(await putMedia({
          ...local,
          remotePath: row.storagePath,
          uploadStatus: "uploaded",
        }));
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
      const engine = await getViewingSyncEngine(user.id);
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
    if (!authReady) return;
    let cancelled = false;
    draftHydratedRef.current = false;
    mediaUrlsReadyRef.current = false;

    void (async () => {
      setDraftReady(false);
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
          const committed =
            typeof draft.propertyDraft?.committedAddress === "string"
              ? draft.propertyDraft.committedAddress
              : draft.identified
                ? draft.address || ""
                : "";
          committedAddressRef.current = committed;
          setWorkflowStatus(
            normalizeWorkflowStatus(draft.workflowStatus ?? draft.propertyDraft?.workflowStatus),
          );
          hydrateDraftForm({
            address: draft.address || "",
            viewingAt:
              draft.viewingAt ||
              (typeof draft.propertyDraft?.viewingAt === "string"
                ? draft.propertyDraft.viewingAt
                : ""),
            unitLabel:
              draft.unitLabel ||
              (typeof draft.propertyDraft?.unitLabel === "string"
                ? draft.propertyDraft.unitLabel
                : ""),
            priceLabel:
              draft.priceLabel ||
              (typeof draft.propertyDraft?.priceLabel === "string"
                ? draft.propertyDraft.priceLabel
                : ""),
            layoutLabel:
              draft.layoutLabel ||
              (typeof draft.propertyDraft?.layoutLabel === "string"
                ? draft.propertyDraft.layoutLabel
                : ""),
            areaLabel:
              typeof draft.propertyDraft?.areaLabel === "string"
                ? draft.propertyDraft.areaLabel
                : "",
            managementFeeLabel:
              typeof draft.propertyDraft?.managementFeeLabel === "string"
                ? draft.propertyDraft.managementFeeLabel
                : "",
            listingUrl:
              draft.listingUrl ||
              (typeof draft.propertyDraft?.listingUrl === "string"
                ? draft.propertyDraft.listingUrl
                : ""),
            setupNotes:
              draft.setupNotes ||
              (typeof draft.propertyDraft?.setupNotes === "string"
                ? draft.propertyDraft.setupNotes
                : ""),
          });
          setTags(draft.tags ?? []);
          setMarketCode(draft.market ?? "CA");
          setIdentified(Boolean(draft.identified));
          const hydratedChecklist = ensureFieldChecklist(
            draft.fieldChecklist,
            messages.fieldChecklist.labels,
          );
          const mergedQuestions = mergeChecklistIntoQuestions(
            draft.questions ?? [],
            hydratedChecklist,
          );
          const nextQuestions = ensureDefaultFieldQuestions(
            mergedQuestions,
            messages.fieldChecklist.labels,
          );
          const derivedChecklist = deriveFieldChecklistFromQuestions(
            nextQuestions,
            messages.fieldChecklist.labels,
          );
          setQuestions(nextQuestions);
          setFieldChecklist(derivedChecklist);
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
          if (draft.liveAudioMarkers?.length) {
            setLiveMarkers(draft.liveAudioMarkers);
          }
          if (draft.aiSummary) {
            setAiSummary(draft.aiSummary);
          }
          if (draft.aiConsent) {
            setAiConsent(draft.aiConsent);
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
  }, [
    authReady,
    user?.id,
    draftReloadGeneration,
    messages.fieldChecklist.labels,
    messages.photoTagLabels,
    hydrateDraftForm,
  ]);

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
    if (!draftReady || !draftHydratedRef.current || legacyClaimBlockedRef.current) return;
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
    return ensureDefaultFieldQuestions([], messages.fieldChecklist.labels);
  }

  function scrollToQuestionCard(questionId: number) {
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-question-id="${questionId}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function clearPendingAnswerQuestion() {
    pendingAnswerQuestionIdRef.current = null;
    setPendingAnswerQuestionId(null);
  }

  function beginAnswerCapture(questionId: number, kind: CaptureKind) {
    pendingAnswerQuestionIdRef.current = questionId;
    setPendingAnswerQuestionId(questionId);
    void openCaptureFlow(kind);
  }

  function focusTextNoteFallback() {
    setPermissionBanner(null);
    requestAnimationFrame(() => {
      document.getElementById("step2-text-notes")?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      const field = document.querySelector<HTMLTextAreaElement>(
        "#step2-text-notes textarea",
      );
      field?.focus();
    });
  }

  function openNativePicker(kind: "photo" | "video") {
    captureLockRef.current = kind;
    const releaseAfterPickerCloses = () => {
      window.setTimeout(() => {
        if (captureLockRef.current === kind) captureLockRef.current = null;
      }, 0);
    };
    window.addEventListener("focus", releaseAfterPickerCloses, { once: true });
    if (kind === "video") {
      videoCaptureInput.current?.click();
      return;
    }
    photoCaptureInput.current?.click();
  }

  function applyQuestionAnswer(
    questionId: number,
    answer: string,
    preview?: QuestionAnswerPreview,
  ) {
    const labels = messages.fieldChecklist.labels;
    setQuestions((current) => {
      const next = current.map((item) =>
        item.id === questionId
          ? {
              ...item,
              answer: answer || undefined,
              checked: Boolean(answer),
              analysisStatus: undefined,
              answerPreview: preview
                ? {
                    ...item.answerPreview,
                    ...preview,
                    noteSummary: preview.noteSummary ?? answer,
                  }
                : {
                    ...item.answerPreview,
                    noteSummary: answer || item.answerPreview?.noteSummary,
                  },
            }
          : item,
      );
      const derived = deriveFieldChecklistFromQuestions(next, labels);
      setFieldChecklist(derived);
      void flushDraftToIdb({ questions: next, fieldChecklist: derived });
      return next;
    });
    scrollToQuestionCard(questionId);
  }

  function attachMediaThumbToQuestion(questionId: number, thumbUrl: string) {
    setQuestions((current) => {
      const next = current.map((item) => {
        if (item.id !== questionId) return item;
        const existing = item.answerPreview?.mediaThumbs ?? [];
        if (existing.includes(thumbUrl)) return item;
        return {
          ...item,
          answerPreview: {
            ...item.answerPreview,
            mediaThumbs: [...existing, thumbUrl].slice(0, 3),
          },
        };
      });
      void flushDraftToIdb({ questions: next });
      return next;
    });
  }

  async function processRecording(
    blob: Blob,
    duration: number,
    existingMediaId?: string,
    markersInput?: AudioMarker[],
    claimedJob?: AiJob,
  ) {
    const consent = await ensureAiConsent();
    const gate = await runIfAiConsented(consent.accepted, async () => true);
    if (!gate.started) {
      setAudioState("idle");
      setAudioSeconds(0);
      captureLockRef.current = null;
      clearPendingAnswerQuestion();
      return;
    }
    setAudioState("processing");
    setSyncMessage(messages.aiBoundary.processing);

    const pendingId = pendingAnswerQuestionIdRef.current;
    if (pendingId != null) {
      setQuestions((current) =>
        current.map((item) =>
          item.id === pendingId ? { ...item, analysisStatus: "analyzing" as const } : item,
        ),
      );
    }

    const bank = activeQuestionBank();
    if (questions.length === 0) {
      setQuestions(bank);
    }

    let mediaId = existingMediaId;
    let durableJob: AiJob | null = claimedJob ?? null;
    let jobCommitted = false;
    let leaseLost = false;
    if (!mediaId) {
      try {
        const saved = requirePersistence(await saveBlobAsMedia({
          kind: "audio",
          label: `recording-${Date.now()}`,
          blob,
          clientNumericId: Date.now(),
        }));
        mediaId = saved.id;
        const draft = await getActiveDraft();
        if (draft) {
          await putActiveDraft({
            ...draft,
            pendingAudioProcess: null,
          });
        }
      } catch {
        // Prefer continuing Whisper even if IDB write fails.
      }
    }

    try {
      if (mediaId && !durableJob) {
        const db = await DraftDb.open({ accountScope: accountScopeForUser(user?.id ?? null) });
        try {
          let job = await db.aiJobs.enqueue({
            sessionId: consent.sessionId,
            mediaId,
            kind: "audio",
            consentVersion: AI_CONSENT_VERSION,
            userId: user?.id ?? null,
            payload: { durationSec: duration, markers: markersInput ?? liveMarkersRef.current },
          });
          job = await db.aiJobs.update(job.id, {
            syncStatus: "syncing",
            leaseOwner: `inline-${crypto.randomUUID()}`,
            leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
          durableJob = job;
        } finally {
          db.close();
        }
      }
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
      form.append("durationSec", String(duration));
      form.append("consentVersion", AI_CONSENT_VERSION);
      form.append("consentSessionId", consent.sessionId);
      form.append("identityKind", user ? "user" : "guest");
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
          payload.code === "ai_quota_exceeded"
            ? messages.aiBoundary.quota
            : payload.code === "ai_quota_unavailable" || payload.code === "ai_unavailable"
              ? messages.aiBoundary.unavailable
              : messages.aiBoundary.failed;
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
      const transcript = summary.transcript || payload.transcript || "";
      const matched =
        payload.answers
          ?.filter((item) => item.status === "answered")
          .map((item) => item.id) ?? [];
      const generated = payload.new_questions ?? [];
      if (durableJob) {
        const db = await DraftDb.open({ accountScope: accountScopeForUser(user?.id ?? null) });
        try {
          const completed = await completeAiJobIfLeaseHeld(db.aiJobs, durableJob, {
            mediaId,
            noteId,
            summary,
            transcript,
            durationSec: duration,
            matched,
            markers: markersForAi,
            answers: payload.answers ?? [],
            newQuestions: generated,
          });
          if (!completed) {
            leaseLost = true;
            return;
          }
          jobCommitted = true;
        } finally {
          db.close();
        }
      }
      setAiSummary(summary);

      const nextNote: AudioNote = {
        id: noteId,
        duration,
        transcript,
        matched,
        mediaId,
        kind: "transcript",
        markers: markersForAi,
        aiJobId: durableJob?.id,
      };
      const nextNotes = [...notesRef.current, nextNote];
      notesRef.current = nextNotes;
      setNotes(nextNotes);

      let nextQuestions: Question[] = [];
      setQuestions((current) => {
        const base = current.length > 0 ? current : bank;
        const updated = base.map((q) => {
          const hit = payload.answers?.find((item) => item.id === q.id);
          if (!hit) {
            if (pendingId != null && q.id === pendingId && !q.checked && !q.answer?.trim()) {
              return {
                ...q,
                checked: true,
                answer: messages.bank.captureAudioSummary,
                analysisStatus: undefined,
                answerPreview: {
                  ...q.answerPreview,
                  noteSummary: messages.bank.captureAudioSummary,
                },
              };
            }
            if (pendingId != null && q.id === pendingId) {
              return { ...q, analysisStatus: undefined };
            }
            return q;
          }
          return {
            ...q,
            checked: hit.status === "answered",
            answer: hit.answer,
            analysisStatus: undefined,
            answerPreview: {
              ...q.answerPreview,
              noteSummary: hit.answer || q.answerPreview?.noteSummary,
            },
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

      if (pendingId != null) {
        clearPendingAnswerQuestion();
        scrollToQuestionCard(pendingId);
      }

      if (nextQuestions.length) {
        const derived = deriveFieldChecklistFromQuestions(
          nextQuestions,
          messages.fieldChecklist.labels,
        );
        setFieldChecklist(derived);
      }

      const nextPros = claimsToLegacyStrings(summary.pros, 5);
      const nextRisks = claimsToLegacyStrings(summary.risks, 5);
      if (nextPros.length) setPros(nextPros);
      if (nextRisks.length) setRisks(nextRisks);

      const draft = await getActiveDraft();
      if (draft?.pendingAudioProcess) {
        await putActiveDraft({ ...draft, pendingAudioProcess: null, aiSummary: summary });
      }

      const persisted = await flushDraftToIdb({
        notes: nextNotes,
        questions: nextQuestions.length ? nextQuestions : questions,
        ...(nextQuestions.length
          ? {
              fieldChecklist: deriveFieldChecklistFromQuestions(
                nextQuestions,
                messages.fieldChecklist.labels,
              ),
            }
          : {}),
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
      if (!persisted) return;
      if (durableJob && jobCommitted) {
        const db = await DraftDb.open({ accountScope: accountScopeForUser(user?.id ?? null) });
        try {
          const completed = await db.aiJobs.get(durableJob.id);
          if (completed) await db.aiJobs.markApplied(completed.id);
        } finally {
          db.close();
        }
      }
      setSyncMessage(
        `AI 已整理：答到 ${matched.length} 題，新增 ${followUpCount} 個追問，${pendingCount} 題待確認 · 已存本機${warn}`,
      );
      setCaptureError(false);
    } catch (error) {
      if (durableJob && !jobCommitted) {
        const db = await DraftDb.open({ accountScope: accountScopeForUser(user?.id ?? null) });
        try {
          await failAiJobIfLeaseHeld(
            db.aiJobs,
            durableJob,
            error instanceof Error ? error.message : messages.aiBoundary.failed,
          );
        } finally {
          db.close();
        }
      }
      if (!leaseLost) {
        setCaptureError(true);
        setSyncMessage(error instanceof Error ? error.message : messages.aiBoundary.failed);
      }
    } finally {
      setAudioState("idle");
      setAudioSeconds(0);
      captureLockRef.current = null;
      setLiveMarkers([]);
      if (pendingId != null) {
        setQuestions((current) =>
          current.map((item) =>
            item.id === pendingId && item.analysisStatus === "analyzing"
              ? { ...item, analysisStatus: undefined }
              : item,
          ),
        );
        clearPendingAnswerQuestion();
        scrollToQuestionCard(pendingId);
      }
      if (!leaseLost) void flushDraftToIdb({ liveAudioMarkers: [] });
    }
  }

  function finishAudioRecorder(options: { discard: boolean; interrupted?: boolean }) {
    audioDiscardRef.current = options.discard;
    audioInterruptedRef.current = Boolean(options.interrupted);
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
    mediaPermissionAdapter.release(audioStreamRef.current);
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
      const saved = requirePersistence(await saveBlobAsMedia({
        kind: "audio",
        label: `recording-${clientNumericId}`,
        blob,
        clientNumericId,
      }));
      mediaId = saved.id;
      const withMedia = attachMediaToMarkers(markers, saved.id, draftSessionIdRef.current);
      await updateMediaFields(saved.id, { markers: withMedia });
      const draft = await getActiveDraft();
      if (draft) {
        await putActiveDraft({
          ...draft,
          pendingAudioProcess: null,
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
    const adapter = mediaPermissionAdapter;
    if (!adapter.isMediaDevicesSupported() || !adapter.isMediaRecorderSupported()) {
      setPermissionBanner({
        status: "unsupported",
        message: messages.permissions.status.unsupported,
      });
      setPreflightStatus("unsupported");
      return;
    }
    if (audioState === "recording" || audioState === "processing") {
      setSyncMessage(messages.permissions.busyElsewhere);
      return;
    }
    if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
      setSyncMessage(messages.permissions.busyElsewhere);
      return;
    }
    if (captureLockRef.current && captureLockRef.current !== "audio") {
      setSyncMessage(messages.permissions.busyElsewhere);
      return;
    }

    // Claim the lock before awaiting getUserMedia so a second tap cannot start
    // another MediaRecorder while the first request is in flight.
    captureLockRef.current = "audio";
    setPreflightBusy(true);
    const prior = await adapter.query("microphone");
    setPreflightStatus(prior);
    const result = await adapter.request("microphone", { audio: true });
    setPreflightBusy(false);

    if (!result.ok) {
      captureLockRef.current = null;
      setPreflightStatus(result.status);
      setPermissionBanner({
        status: result.status,
        message: messages.permissions.status[result.status],
      });
      return;
    }

    try {
      audioDiscardRef.current = false;
      audioInterruptedRef.current = false;
      setLiveMarkers([]);
      liveMarkersRef.current = [];
      void flushDraftToIdb({ liveAudioMarkers: [] });
      const stream = result.stream;
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const mime = selectSupportedAudioMimeType(MediaRecorder.isTypeSupported);
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
        const interrupted = audioInterruptedRef.current;
        audioInterruptedRef.current = false;
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
        void persistAndProcessAudioBlob(blob, duration, interrupted);
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
      markCaptureExplained("audio");
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

  async function openCaptureFlow(kind: CaptureKind) {
    if (audioState === "recording" || audioState === "processing") {
      setSyncMessage(messages.permissions.busyElsewhere);
      return;
    }
    if (captureLockRef.current) {
      setSyncMessage(messages.permissions.busyElsewhere);
      return;
    }

    // Photos: native file picker only — never show an in-app permission dialog.
    if (kind === "photo") {
      openNativePicker("photo");
      return;
    }

    const adapter = mediaPermissionAdapter;
    setPreflightBusy(true);

    let status: MediaPermissionStatus = "prompt";
    if (kind === "audio") {
      if (!adapter.isMediaDevicesSupported() || !adapter.isMediaRecorderSupported()) {
        status = "unsupported";
      } else {
        status = await adapter.query("microphone");
      }
    } else if (!adapter.isMediaDevicesSupported()) {
      // Video still uses the OS camera via <input capture>; lack of
      // mediaDevices only blocks query, not the picker itself.
      status = "prompt";
    } else {
      status = await adapter.query("camera");
    }
    setPreflightBusy(false);

    const decision = decideCaptureStart({
      kind,
      status,
      explained: hasCaptureExplained(kind),
    });

    if (decision.action === "show-reauth") {
      setPreflightKind(null);
      setPreflightStatus(decision.status);
      setPermissionBanner({
        status: decision.status,
        message: messages.permissions.status[decision.status],
      });
      return;
    }

    if (decision.action === "show-preflight") {
      setPreflightKind(kind);
      setPreflightStatus(decision.status);
      return;
    }

    // start-direct
    setPreflightKind(null);
    setPermissionBanner(null);
    if (kind === "audio") {
      await beginAudioRecording();
      return;
    }
    markCaptureExplained("video");
    openNativePicker("video");
  }

  async function onPreflightContinue() {
    if (!preflightKind) return;
    const kind = preflightKind;
    if (kind === "audio" || kind === "video") {
      markCaptureExplained(kind);
    }
    if (kind === "audio") {
      await beginAudioRecording();
      return;
    }
    setPreflightKind(null);
    setPermissionBanner(null);
    if (kind === "video") {
      openNativePicker("video");
      return;
    }
    openNativePicker("photo");
  }

  function onPreflightImport() {
    const kind = preflightKind;
    setPreflightKind(null);
    if (kind === "audio") {
      audioImportInput.current?.click();
      return;
    }
    if (kind === "video") {
      videoGalleryInput.current?.click();
      return;
    }
    photoGalleryInput.current?.click();
  }

  function releaseCaptureLock() {
    captureLockRef.current = null;
  }

  function mediaImportError(code: string): string {
    if (code === "invalid-photo-type") return messages.mediaImport.invalidPhoto;
    if (code === "invalid-video-type") return messages.mediaImport.invalidVideo;
    if (code === "empty-file") return messages.mediaImport.emptyFile;
    if (code === "photo-too-large") return messages.mediaImport.photoTooLarge;
    return messages.mediaImport.videoTooLarge;
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

  type AddressLookupPayload = {
    error?: string;
    market?: "CA" | "TH" | "OTHER";
    displayAddress?: string;
    tags?: string[];
    source?: string;
    propertyId?: string;
    details?: Record<string, unknown>;
  };

  async function persistActiveSessionSnapshot(options: {
    sessionId: string;
    address: string;
    workflowStatus: ViewingWorkflowStatus;
  }) {
    const engine = await getViewingSyncEngine(user?.id ?? null);
    const mediaRows = await listMedia();
    const snap = draftSnapshotRef.current;
    await engine.importActiveDraft({
      sessionId: options.sessionId,
      userId: user?.id ?? null,
      remoteViewingId: snap.viewingId,
      shareToken: snap.shareToken,
      address: options.address,
      tags: snap.tags,
      market: snap.marketCode,
      identified: snap.identified,
      questions: snap.questions,
      notes: snap.notes,
      pros: snap.pros,
      risks: snap.risks,
      propertyDraft: {
        ...snap.propertyDraft,
        committedAddress: options.address,
        workflowStatus: options.workflowStatus,
      },
      clientUpdatedAt: clientUpdatedAtRef.current,
      isPro,
      workflowStatus: options.workflowStatus,
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
  }

  function resetWizardRuntimeState() {
    setNotes([]);
    setPhotos([]);
    setClips([]);
    setQuestions([]);
    setPros([]);
    setRisks([]);
    setCardDraft(null);
    setAiSummary(null);
    setFieldChecklist([]);
    setLiveMarkers([]);
    setShareToken(null);
    setShareUrl("");
    setViewingId(null);
    setShareLink(null);
    setIdentified(false);
    setLookupError(false);
    setTags([]);
    setPropertyDraft({});
    hydrateDraftForm({
      viewingAt: "",
      unitLabel: "",
      priceLabel: "",
      layoutLabel: "",
      areaLabel: "",
      managementFeeLabel: "",
      listingUrl: "",
      setupNotes: "",
    });
    setWizardStep(1);
    pendingMediaRef.current = [];
    mediaUrlsReadyRef.current = false;
  }

  async function beginNewViewingFromAddress(options: {
    payload: AddressLookupPayload;
    nextAddress: string;
    fromExifGps?: boolean;
    abandonPrevious: boolean;
  }) {
    const previousId = draftSessionIdRef.current;
    if (previousId) {
      if (options.abandonPrevious) {
        await persistActiveSessionSnapshot({
          sessionId: previousId,
          address: committedAddressRef.current || draftSnapshotRef.current.address,
          workflowStatus: "abandoned",
        });
        const engine = await getViewingSyncEngine(user?.id ?? null);
        await engine.setWorkflowStatus(previousId, "abandoned");
      } else {
        const savedStatus = deriveWorkflowStatus({
          current: workflowStatus === "abandoned" ? "draft" : workflowStatus,
          hasFieldContent:
            notes.length > 0 ||
            photos.length > 0 ||
            clips.length > 0 ||
            questions.some((q) => q.checked || Boolean(q.answer?.trim())),
          canGenerate: canGenerateShareCard({
            address: committedAddressRef.current || address,
            viewingAt,
            notesCount: notes.length,
            photosCount: photos.length,
            clipsCount: clips.length,
            checkedQuestions: questions.filter((q) => q.checked).length,
            syncStatus: sessionUiStatus?.status ?? null,
          }),
        });
        await persistActiveSessionSnapshot({
          sessionId: previousId,
          address: committedAddressRef.current || draftSnapshotRef.current.address,
          workflowStatus: savedStatus === "abandoned" ? "collecting" : savedStatus,
        });
      }
    }

    draftHydratedRef.current = false;
    await clearActiveDraft();
    resetWizardRuntimeState();
    setAddress(options.nextAddress);

    const newId = createEntityId();
    draftSessionIdRef.current = newId;
    setWorkflowStatus("draft");
    draftHydratedRef.current = true;

    await applyAddressLookupPayload(options.payload, {
      preferExistingAddress: true,
      fromExifGps: options.fromExifGps,
      forceNewSession: true,
      sessionId: newId,
      skipSwitchPrompt: true,
      addressOverride: options.nextAddress,
    });
  }

  async function confirmAddressSwitchSaveAndNew() {
    if (!pendingAddressSwitch) return;
    const pending = pendingAddressSwitch;
    setPendingAddressSwitch(null);
    await beginNewViewingFromAddress({
      payload: pending.payload,
      nextAddress: pending.nextAddress,
      abandonPrevious: false,
    });
  }

  async function confirmAddressSwitchDiscardAndNew() {
    if (!pendingAddressSwitch) return;
    const pending = pendingAddressSwitch;
    setPendingAddressSwitch(null);
    await beginNewViewingFromAddress({
      payload: pending.payload,
      nextAddress: pending.nextAddress,
      abandonPrevious: true,
    });
  }

  async function applyAddressLookupPayload(
    payload: AddressLookupPayload,
    options: {
      preferExistingAddress: boolean;
      fromExifGps?: boolean;
      forceNewSession?: boolean;
      sessionId?: string;
      skipSwitchPrompt?: boolean;
      addressOverride?: string;
    },
  ) {
    const nextMarket = payload.market ?? "CA";
    const nextTags = payload.tags?.length ? payload.tags : ["已定位"];
    const nextQuestions = bankQuestions(locale, nextMarket).map((q) => ({
      ...q,
      checked: false,
    }));

    const addressForResolve = options.addressOverride ?? address;
    const nextAddress = options.preferExistingAddress
      ? resolveLookupDisplayAddress(addressForResolve, payload.displayAddress)
      : resolveLookupDisplayAddress(
          addressForResolve.trim() ? addressForResolve : (payload.displayAddress ?? ""),
          payload.displayAddress,
        );

    const localSessionId =
      options.sessionId ??
      draftSessionIdRef.current ??
      (await resolveExistingLocalSessionId());

    if (
      !options.skipSwitchPrompt &&
      !options.forceNewSession &&
      shouldPromptAddressSwitch({
        localSessionId,
        workflowStatus,
        committedAddress: committedAddressRef.current,
        nextAddress,
      })
    ) {
      setPendingAddressSwitch({ nextAddress, payload });
      setIdentified(false);
      setSyncMessage("");
      return;
    }

    const sessionId =
      options.sessionId ??
      (localSessionId && !options.forceNewSession
        ? localSessionId
        : await createStableLocalSessionId());
    draftSessionIdRef.current = sessionId;
    committedAddressRef.current = nextAddress;
    setAddress(nextAddress);
    setMarketCode(nextMarket);
    setTags(nextTags);
    setQuestions((current) => {
      if (options.forceNewSession) {
        return nextQuestions;
      }
      const dynamic = current.filter((q) => q.isDynamic);
      const texts = new Set(dynamic.map((q) => q.text.toLowerCase()));
      return [...dynamic, ...nextQuestions.filter((q) => !texts.has(q.text.toLowerCase()))];
    });
    setIdentified(true);
    const nextWorkflow: ViewingWorkflowStatus = "draft";
    setWorkflowStatus(nextWorkflow);
    const openData = (payload.details?.openData || null) as Record<string, unknown> | null;
    const zoning = openData?.zoningCode ? String(openData.zoningCode) : "";
    const propertyId = String(payload.propertyId ?? payload.details?.propertyId ?? "");
    const nextPropertyDraft = mergeAddressLookupPropertyDraft(
      options.forceNewSession ? {} : propertyDraft,
      {
        source: payload.source,
        propertyId: payload.propertyId ?? (payload.details?.propertyId as string | undefined),
        details: {
          ...(payload.details ?? {}),
          committedAddress: nextAddress,
          workflowStatus: nextWorkflow,
          ...(options.fromExifGps
            ? {
                gpsConsent: true,
                gpsSource: "exif",
              }
            : {}),
        },
      },
    );
    setPropertyDraft(nextPropertyDraft);
    const persisted = await flushDraftToIdb({
      address: nextAddress,
      tags: nextTags,
      marketCode: nextMarket,
      identified: true,
      localSessionId: sessionId,
      workflowStatus: nextWorkflow,
      questions: options.forceNewSession
        ? nextQuestions
        : [
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
    if (!persisted) return;
    setSyncMessage(
      `${payload.source ?? "地址查詢"}完成` +
        (zoning ? ` · Zoning ${zoning}` : "") +
        (propertyId ? ` · property ${propertyId.slice(0, 8)}` : "") +
        " · 已寫入本機草稿",
    );
  }

  function cancelAddressSwitch() {
    setPendingAddressSwitch(null);
    setAddress(committedAddressRef.current);
    setIdentified(Boolean(committedAddressRef.current));
    setLookupError(false);
    setSyncMessage("");
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
      const payload = (await response.json()) as AddressLookupPayload;

      if (!response.ok) {
        throw new Error(payload.error || "地址查詢失敗");
      }

      await applyAddressLookupPayload(payload, { preferExistingAddress: true });
    } catch (error) {
      setIdentified(false);
      setLookupError(true);
      setSyncMessage(error instanceof Error ? error.message : "查詢失敗");
    } finally {
      setLookingUp(false);
    }
  }

  async function applyExifGpsLookup(gps: { lat: number; lng: number }) {
    setLookingUp(true);
    setIdentified(false);
    setLookupError(false);
    setSyncMessage("");

    try {
      const response = await fetch("/api/lookup-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: gps.lat, lng: gps.lng }),
      });
      const payload = (await response.json()) as AddressLookupPayload;

      if (!response.ok) {
        throw new Error(payload.error || "GPS 查詢失敗");
      }

      await applyAddressLookupPayload(payload, {
        preferExistingAddress: true,
        fromExifGps: true,
      });
    } catch (error) {
      setIdentified(false);
      setLookupError(true);
      setSyncMessage(error instanceof Error ? error.message : "查詢失敗");
      throw error;
    } finally {
      setLookingUp(false);
    }
  }

  async function syncAndOpenCard(authenticatedUser: User | null = user) {
    setSyncingCard(true);
    setGenerateFailed(false);
    setGenerateStage("organize");
    setSyncMessage(messages.share.stageOrganize);
    try {
      // Build share snapshot before sync so cloud property jsonb carries decisionSummary.
      // On failure, source pros/risks/aiSummary and in-memory cardDraft remain intact.
      const next = rebuildCardDraft(cardDraft);
      setCardDraft(next);
      setGenerateStage("analyze");
      setSyncMessage(messages.share.stageAnalyze);
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
      setGenerateStage("summary");
      setSyncMessage(messages.share.stageSummary);
      const synced = await syncViaQueue({ openCard: true }, authenticatedUser);
      setGenerateStage("build");
      setSyncMessage(messages.share.stageBuild);
      const remoteId =
        (synced && "remoteViewingId" in synced && synced.remoteViewingId) ||
        viewingId ||
        draftSnapshotRef.current.viewingId;
      const selectedMediaIds = next.photos
        .filter((photo) => photo.selected)
        .map((photo) => photosRef.current.find((item) => String(item.id) === photo.id)?.mediaId)
        .filter((id): id is string => Boolean(id));
      const selectedWithoutDurableMedia =
        next.photos.filter((photo) => photo.selected).length !== selectedMediaIds.length;
      const publishMedia = await listMedia();
      const publishReadiness = getPublishReadiness(selectedMediaIds, publishMedia);
      const cloudReady =
        !selectedWithoutDurableMedia &&
        publishReadiness.ready &&
        synced &&
        "ui" in synced &&
        synced.ui?.status === "synced";
      if (!cloudReady) {
        openDecisionCard();
        setSyncMessage("分享預覽僅保留在本機；選取的媒體全部上傳完成後才能建立公開連結");
        return;
      }
      if (remoteId && authenticatedUser) {
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
      openDecisionCard();
    } catch (error) {
      setGenerateFailed(true);
      setSyncMessage(
        error instanceof Error ? error.message : messages.share.generateFailed,
      );
      // Keep original field/media data; allow local preview of last card draft.
      openDecisionCard();
      throw error;
    } finally {
      setSyncingCard(false);
      setGenerateStage(null);
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
      authenticated: Boolean(user),
    });
    if (!ready) {
      setWizardStep(3);
      setSyncMessage(messages.share.needMore);
      return;
    }
    if (!configured) {
      openDecisionCard();
      return;
    }
    if (!user) {
      // Local long-image / card preview does not require login; cloud link sync still needs auth.
      openDecisionCard();
      return;
    }
    // New viewing only: free users capped at 3
    if (!viewingId && freeCount >= FREE_VIEWING_LIMIT && !isPro) {
      setShowPaywall(true);
      return;
    }
    const wasNew = !viewingId;
    try {
      setGenerateFailed(false);
      setWorkflowStatus("generating");
      await flushDraftToIdb({ workflowStatus: "generating" });
      await syncAndOpenCard();
      setWorkflowStatus("generated");
      await flushDraftToIdb({ workflowStatus: "generated" });
      if (wasNew) setFreeCount((n) => n + 1);
    } catch {
      setGenerateFailed(true);
      setWorkflowStatus("ready_to_generate");
      await flushDraftToIdb({ workflowStatus: "ready_to_generate" });
      // Field notes/media remain in IDB and React state — do not clear them.
    }
  }

  async function saveDraftExplicit() {
    const ok = await flushDraftToIdb({ wizardStep });
    setSyncMessage(ok === false ? messages.sync.failed : messages.wizard.draftSaved);
  }

  async function goToStep(target: WizardStep) {
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
    if (target >= 2) {
      void createStableLocalSessionId().then((sessionId) => {
        if (!committedAddressRef.current && address.trim()) {
          committedAddressRef.current = address.trim();
        }
        const nextStatus = deriveWorkflowStatus({
          current: workflowStatus,
          hasFieldContent:
            notes.length > 0 ||
            photos.length > 0 ||
            clips.length > 0 ||
            questions.some((q) => q.checked),
          canGenerate: false,
        });
        setWorkflowStatus(nextStatus === "draft" && target >= 2 ? "collecting" : nextStatus);
        void flushDraftToIdb({
          localSessionId: sessionId,
          workflowStatus: nextStatus === "draft" && target >= 2 ? "collecting" : nextStatus,
        });
      });
    }
    if (target === 2) {
      const labels = messages.fieldChecklist.labels;
      const nextQuestions = ensureDefaultFieldQuestions(questions, labels);
      const derived = deriveFieldChecklistFromQuestions(nextQuestions, labels);
      setQuestions(nextQuestions);
      setFieldChecklist(derived);
      await flushDraftToIdb({
        wizardStep: target,
        questions: nextQuestions,
        fieldChecklist: derived,
      });
      setWizardStep(target);
      return;
    }
    await flushDraftToIdb({ wizardStep: target });
    setWizardStep(target);
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
        await claimGuestViewingData(currentUser.id);
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
      await syncAndOpenCard(currentUser);
      if (wasNew) setFreeCount((n) => n + 1);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登入失敗");
      setSyncingCard(false);
    }
  }

  const closeLoginGate = useCallback(() => {
    setShowLoginGate(false);
  }, []);

  const handleLoginModeChange = useCallback((mode: "signin" | "signup") => {
    setLoginMode(mode);
    setLoginError("");
  }, []);

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
      const saved = requirePersistence(await saveBlobAsMedia({
        kind: "video",
        label,
        blob,
        clientNumericId,
      }));
      mediaId = saved.id;
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "影片本機儲存失敗");
      return;
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
    const pendingId = pendingAnswerQuestionIdRef.current;
    if (pendingId != null) {
      clearPendingAnswerQuestion();
      applyQuestionAnswer(pendingId, messages.bank.captureVideoSummary, {
        noteSummary: messages.bank.captureVideoSummary,
      });
    }
    setSyncMessage(
      durationSec
        ? `影片已存本機（${durationSec}秒）· 登入後會自動同步`
        : "影片已存本機 IndexedDB，登入後會自動同步",
    );
  }

  function openNativeCamera() {
    if (clips.length >= 4) return;
    void openCaptureFlow("video");
  }

  async function onVideoFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    captureLockRef.current = null;
    if (!file) return;
    const validationError = validateImportedMedia(file, "video");
    if (validationError) {
      setSyncMessage(mediaImportError(validationError));
      return;
    }
    await persistClip(file, messages.clipLabels[clips.length % messages.clipLabels.length]);
  }

  async function onPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    // Safari exposes a live FileList that is emptied when the input is reset.
    const files = takeInputFiles(event.currentTarget);
    captureLockRef.current = null;
    if (files.length === 0) return;

    const incomingFiles = files
      .filter((file) => {
        const validationError = validateImportedMedia(file, "photo");
        if (validationError) setSyncMessage(mediaImportError(validationError));
        return !validationError;
      })
      .slice(0, 5 - photos.length);
    if (incomingFiles.length === 0) return;
    const incoming: Photo[] = [];
    let persistenceFailed = false;
    const defaultTagId: PhotoTagId = "other";
    const defaultTag = messages.photoTagLabels[defaultTagId];

    for (let index = 0; index < incomingFiles.length; index += 1) {
      const file = incomingFiles[index];
      const clientNumericId = Date.now() + index;
      let mediaId: string | undefined;
      try {
        const saved = requirePersistence(await saveBlobAsMedia({
          kind: "photo",
          label: defaultTag,
          tagId: defaultTagId,
          note: "",
          blob: file,
          clientNumericId,
        }));
        mediaId = saved.id;
      } catch {
        // continue with memory-only fallback
        persistenceFailed = true;
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
    setSyncMessage(
      persistenceFailed
        ? "部分照片只保留在目前頁面，裝置儲存失敗"
        : "照片原圖已存本機 · 正在產生縮圖",
    );

    const pendingId = pendingAnswerQuestionIdRef.current;
    if (pendingId != null) {
      clearPendingAnswerQuestion();
      applyQuestionAnswer(pendingId, messages.bank.capturePhotoSummary, {
        noteSummary: messages.bank.capturePhotoSummary,
      });
    }

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
            if (pendingId != null) attachMediaThumbToQuestion(pendingId, url);
            return;
          }
          const thumbUrl = URL.createObjectURL(thumb.blob);
          setPhotos((current) =>
            current.map((item) => (item.id === photo.id ? { ...item, thumbUrl } : item)),
          );
          if (pendingId != null) attachMediaThumbToQuestion(pendingId, thumbUrl);
          if (photo.mediaId) {
            await updateMediaFields(photo.mediaId, {
              thumbBlob: thumb.blob,
              thumbMimeType: thumb.mimeType,
            });
          }
        })();
      });
    }

    if (pendingId == null) {
      const first = incoming[0];
      if (first) {
        setAnnotatingPhotoId(first.id);
        setAnnotateTagId(first.tagId);
        setAnnotateNote(first.note);
      }
    }

    void (async () => {
      const consent = await ensureAiConsent();
      if (!consent.accepted) return;
      setSyncMessage(
        messages.aiBoundary.processing,
      );
      const results = await mapWithConcurrency(incoming, 2, async (photo) => {
          if (!photo.file || !photo.mediaId) return null;
          const db = await DraftDb.open({ accountScope: accountScopeForUser(user?.id ?? null) });
          let job: AiJob;
          try {
            job = await db.aiJobs.enqueue({
              sessionId: consent.sessionId,
              mediaId: photo.mediaId,
              kind: "photo",
              consentVersion: AI_CONSENT_VERSION,
              userId: user?.id ?? null,
              payload: { tag: photo.tag, locale, market: marketCode },
            });
            job = await db.aiJobs.update(job.id, {
              syncStatus: "syncing",
              leaseOwner: `inline-${crypto.randomUUID()}`,
              leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            });
          } finally {
            db.close();
          }
          try {
          const derivative = await normalizeImageForAi(photo.file);
          const base64 = await blobToDataUrl(derivative);
          const live = photosRef.current.find((p) => p.id === photo.id);
          const tag = live?.tag || photo.tag;
          const response = await fetch("/api/vision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              base64,
              tag,
              locale,
              market: marketCode,
              mediaId: photo.mediaId,
              consentVersion: AI_CONSENT_VERSION,
              consentSessionId: consent.sessionId,
              identityKind: user ? "user" : "guest",
            }),
          });
          const payload = (await response.json()) as {
            question?: string;
            error?: string;
            code?: string;
          };
          if (!response.ok || !payload.question) {
            throw new Error(
              payload.code === "ai_quota_exceeded"
                ? messages.aiBoundary.quota
                : payload.code === "ai_quota_unavailable" || payload.code === "ai_unavailable"
                  ? messages.aiBoundary.unavailable
                  : messages.aiBoundary.failed,
            );
          }
          const result = {
            text: payload.question.trim(),
            tag,
            mediaId: photo.mediaId,
            aiJobId: job.id,
          };
          const completeDb = await DraftDb.open({
            accountScope: accountScopeForUser(user?.id ?? null),
          });
          try {
            const completed = await completeAiJobIfLeaseHeld(completeDb.aiJobs, job, result);
            if (!completed) return null;
          } finally {
            completeDb.close();
          }
          return result;
          } catch (error) {
            const failedDb = await DraftDb.open({
              accountScope: accountScopeForUser(user?.id ?? null),
            });
            try {
              await failAiJobIfLeaseHeld(
                failedDb.aiJobs,
                job,
                error instanceof Error ? error.message : messages.aiBoundary.failed,
              );
            } finally {
              failedDb.close();
            }
            throw error;
          }
        });

      const generated = results
        .filter(
          (r): r is PromiseFulfilledResult<{
            text: string;
            tag: string;
            mediaId: string;
            aiJobId: string;
          } | null> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value)
        .filter(
          (v): v is { text: string; tag: string; mediaId: string; aiJobId: string } =>
            Boolean(v?.text),
        );

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
              aiJobId: item.aiJobId,
            });
            nextId += 1;
          }
          return [...extras, ...base];
        });
        const appliedDb = await DraftDb.open({
          accountScope: accountScopeForUser(user?.id ?? null),
        });
        try {
          await Promise.all(generated.map((item) => appliedDb.aiJobs.markApplied(item.aiJobId)));
        } finally {
          appliedDb.close();
        }
        setSyncMessage(
          persistenceFailed
            ? `照片 AI 已生成 ${generated.length} 題必問 · 部分照片仍只在目前頁面`
            : `照片 AI 已生成 ${generated.length} 題必問 · 已存本機`,
        );
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

  function requestShareAction(action: "copy" | "share" | "exportImage") {
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
      setSyncMessage(link ? messages.card.copyLink : messages.card.copy);
      return;
    }

    if (link && navigator.share) {
      void navigator.share({ title: messages.brand.name, text: snapshot.address, url: link });
      return;
    }
    if (link) {
      void navigator.clipboard?.writeText(link);
      setSyncMessage(messages.card.copyLink);
      return;
    }
    setSyncMessage(messages.card.needSync);
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
    authenticated: Boolean(user),
  };
  const shareChecklist = getShareChecklist(wizardSnap);
  const canShare = canGenerateShareCard(wizardSnap);
  const previewSummary = cardDraft
    ? [
        cardDraft.address || address,
        cardDraft.pros?.filter((item) => item.selected && item.text.trim()).length
          ? `${cardDraft.pros.filter((item) => item.selected && item.text.trim()).length} pros`
          : null,
        cardDraft.risks?.filter((item) => item.selected && item.text.trim()).length
          ? `${cardDraft.risks.filter((item) => item.selected && item.text.trim()).length} risks`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
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
    <div className="min-h-screen w-full flex justify-center bg-[var(--color-canvas,#FDF6F0)] text-[var(--color-text,#1A1A1A)]">
      <div className="page-container pt-[max(24px,env(safe-area-inset-top))] pb-36">
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
              clearPendingAnswerQuestion();
            }}
            onImport={onPreflightImport}
            onTextNote={() => {
              setPreflightKind(null);
              setPreflightBusy(false);
              focusTextNoteFallback();
            }}
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
        <div className="flex flex-col gap-4 mb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
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
          <div className="flex flex-col items-start gap-2 sm:items-end sm:mt-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <LanguageSwitcher />
              <Link
                href="/viewings"
                className="min-h-11 px-3 rounded-full bg-white border border-black/10 text-[12px] font-bold text-[#1A1A1A] inline-flex items-center gap-1.5"
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

        {legacyDraftClaim.status !== "none" && legacyDraftClaim.status !== "verified" && (
            <div
              className="mb-4 rounded-[18px] border border-[#F59E0B]/40 bg-[#FFFBEB] p-3 text-[12px] text-[#78350F]"
              role="status"
            >
              <p className="font-bold">找到舊版未歸屬草稿</p>
              <p className="mt-1">
                {legacyDraftClaim.draft.address || "未命名看房"}
                {legacyDraftClaim.mediaCount > 0
                  ? ` · ${legacyDraftClaim.mediaCount} 個媒體檔案`
                  : ""}
              </p>
              {legacyDraftClaim.status === "available" ||
              legacyDraftClaim.status === "copied" ? (
                <>
                  <button
                    type="button"
                    disabled={claimingLegacyDraft}
                    onClick={() => void claimLegacyDraft()}
                    className="mt-2 rounded-full bg-[#78350F] px-3 py-1.5 font-bold text-white disabled:opacity-60"
                  >
                    {claimingLegacyDraft
                      ? "正在驗證…"
                      : legacyDraftClaim.status === "copied"
                        ? "繼續驗證還原"
                        : "還原到我的帳戶"}
                  </button>
                  {legacyDraftClaim.status === "available" && (
                    <button
                      type="button"
                      onClick={() => {
                        legacyClaimBlockedRef.current = false;
                        setLegacyDraftClaim({ status: "none" });
                      }}
                      className="mt-2 ml-2 rounded-full border border-[#78350F]/30 px-3 py-1.5 font-bold"
                    >
                      暫不還原
                    </button>
                  )}
                </>
              ) : (
                <p className="mt-2">
                  目前帳戶已有草稿，因此未自動覆蓋。舊版資料仍保留在此裝置。
                </p>
              )}
            </div>
          )}

        <SyncStatusBanner
          status={sessionUiStatus}
          messages={messages.sync}
          busy={syncingCard}
          onRetry={() => void retrySyncQueue()}
        />

        {draftReady ? (
          <WizardStepper steps={stepStatuses} onSelect={(step) => void goToStep(step)} />
        ) : (
          <p role="status" aria-live="polite" className="py-8 text-center text-sm text-[#6B7280]">
            {messages.loginGate.processing}
          </p>
        )}

        {draftReady && wizardStep === 1 && (
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
            onApplyExifGps={applyExifGpsLookup}
            applyingExifGps={lookingUp}
          />
        )}

                {draftReady && wizardStep === 2 && (
          <>
        <QuestionList
          messages={{
            fieldTitle: messages.bank.fieldTitle,
            progressLabel: messages.bank.progressLabel,
            sectionUnanswered: messages.bank.sectionUnanswered,
            sectionAnswered: messages.bank.sectionAnswered,
            emptyUnanswered: messages.bank.emptyUnanswered,
            emptyAnswered: messages.bank.emptyAnswered,
            tip: messages.bank.tip,
            tipExample: messages.bank.tipExample,
            card: {
              answerCta: messages.bank.answerCta,
              editCta: messages.bank.editCta,
              statusUnanswered: messages.bank.statusUnanswered,
              statusProcessing: messages.bank.statusProcessing,
              statusAnswered: messages.bank.statusAnswered,
              statusAnalyzing: messages.bank.statusAnalyzing,
              statusAnalysisFailed: messages.bank.statusAnalysisFailed,
              noteSummaryLabel: messages.bank.noteSummaryLabel,
              aiSummaryLabel: messages.bank.aiSummaryLabel,
            },
            methodSheet: {
              title: messages.bank.methodTitle,
              description: messages.bank.methodDescription,
              audio: messages.bank.methodAudio,
              photo: messages.bank.methodPhoto,
              video: messages.bank.methodVideo,
              note: messages.bank.methodNote,
              close: messages.bank.methodClose,
              noteTitle: messages.bank.methodNoteTitle,
              notePlaceholder: messages.bank.methodNotePlaceholder,
              noteSave: messages.bank.methodNoteSave,
              noteCancel: messages.bank.methodNoteCancel,
            },
          }}
          questions={presentWizardQuestions(questions, {
            notes,
            photos: photos.map((photo) => ({
              tag: photo.tag,
              tagId: photo.tagId,
              thumbUrl: photo.thumbUrl,
              url: photo.url,
            })),
            labels: {
              tagLabel: messages.bank.tagLabel,
              byDialogue: messages.card.byDialogue,
              checklistHint: messages.bank.checklistHint,
            },
          })}
          tipDetail={
            notes.length > 0
              ? t(messages.bank.matched, {
                  matched: notes.reduce((sum, note) => sum + note.matched.length, 0),
                  followUps: questions.filter((q) => q.isFollowUp).length,
                })
              : undefined
          }
          processingQuestionId={pendingAnswerQuestionId}
          onSelectMethod={(id, method) => {
            beginAnswerCapture(id, method);
          }}
          onSaveAnswer={(id, answer) => {
            applyQuestionAnswer(id, answer, {
              noteSummary: answer || undefined,
            });
          }}
        />

        <div
          id="step2-text-notes"
          className="bg-white rounded-[24px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-5 mb-4"
        >
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
                    onClick={() => void openCaptureFlow("audio")}
                    disabled={audioState === "processing"}
                    aria-label={
                      audioState === "processing"
                        ? messages.audio.processing
                        : messages.audio.idle
                    }
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
                textNoteLabel={messages.permissions.textNoteInstead}
                onTextNote={focusTextNoteFallback}
                onDismiss={() => setPermissionBanner(null)}
              />
            ) : null}
            {/* Live recording markers remain in data model / playback; standalone capture UI is hidden. */}
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

        {/* Field checklist rows stay in draft/IDB; UI is folded into QuestionList. */}

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
                  className="absolute top-1 left-1 min-h-11 max-w-[70%] truncate px-3 rounded-full bg-black/75 text-white text-[11px] font-bold"
                >
                  {messages.photos.editAnnotation}
                </button>
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => void removePhoto(photo.id)}
                  className="absolute top-1 right-1 w-11 h-11 rounded-full bg-black/75 text-white flex items-center justify-center"
                >
                  <X className="w-3 h-3" aria-hidden />
                </button>
              </div>
            ))}
            {photos.length < 5 && (
              <button
                type="button"
                onClick={() => void openCaptureFlow("photo")}
                className="aspect-[4/3] min-h-11 rounded-xl border-2 border-dashed border-black/10 bg-[#FAF7F3] flex flex-col items-center justify-center gap-1 hover:bg-[#F5F3F0] transition"
              >
                <Camera className="w-6 h-6 text-[#9CA3AF]" />
                <span className="text-[11px] font-medium text-[#6B7280]">{messages.photos.add}</span>
                <span className="text-[10px] text-[#9CA3AF]">{messages.photos.addSub}</span>
              </button>
            )}
          </div>
          {photos.length < 5 ? (
            <button
              type="button"
              onClick={() => photoGalleryInput.current?.click()}
              className="mt-3 min-h-11 w-full rounded-full border border-[#DBEAFE] bg-[#F8FAFF] px-4 text-[12px] font-bold text-[#2563EB] inline-flex items-center justify-center gap-2"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {messages.mediaImport.photoGallery}
            </button>
          ) : null}
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
          <MediaPickerInputs
            photoCaptureRef={photoCaptureInput}
            photoGalleryRef={photoGalleryInput}
            videoCaptureRef={videoCaptureInput}
            videoGalleryRef={videoGalleryInput}
            onPhotos={(event) => void onPhotos(event)}
            onVideo={(event) => void onVideoFiles(event)}
            onCaptureCancel={() => {
              releaseCaptureLock();
              clearPendingAnswerQuestion();
            }}
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
              type="button"
              onClick={openNativeCamera}
              disabled={clips.length >= 4}
              aria-label={messages.video.start}
              className="w-[88px] h-[88px] rounded-full flex flex-col items-center justify-center bg-[#EF4444] shadow-[0_8px_24px_rgba(239,68,68,0.35)] active:scale-95 transition-all disabled:opacity-40"
            >
              <Video className="w-7 h-7 text-white" />
            </button>
            <div className="mt-3 text-center">
              <p className="text-[15px] font-bold">{messages.video.start}</p>
              <p className="text-[12px] text-[#8A8A8A] mt-1">{messages.video.startSub}</p>
            </div>
            <button
              type="button"
              disabled={clips.length >= 4}
              onClick={() => videoGalleryInput.current?.click()}
              className="mt-3 min-h-11 rounded-full border border-[#DBEAFE] bg-[#F8FAFF] px-4 text-[12px] font-bold text-[#2563EB] inline-flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {messages.mediaImport.videoGallery}
            </button>
          </div>
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

        {draftReady && wizardStep === 3 && (
          <StepShare
            checklist={shareChecklist}
            checklistLabels={{
              address: messages.wizard.checkAddress,
              fieldContent: messages.wizard.checkFieldContent,
              authSync: messages.wizard.checkAuthSync,
              syncOk: messages.wizard.checkSyncOk,
            }}
            checklistTitle={messages.wizard.checklistTitle}
            progressLabel={messages.wizard.progress}
            sessionUiStatus={sessionUiStatus}
            syncingCard={syncingCard}
            syncMessage={syncMessage}
            syncLabels={messages.sync}
            canGenerate={canShare}
            generateTitle={messages.share.button}
            generateLabel={
              generateFailed
                ? messages.share.retry
                : syncingCard
                  ? messages.share.uploading
                  : messages.share.button
            }
            generateHint={
              canShare
                ? user
                  ? messages.share.readyLoggedIn
                  : messages.share.readyGuest
                : messages.share.needMore
            }
            generateFailed={generateFailed}
            generateFailedLabel={messages.share.generateFailed}
            generateStage={generateStage}
            stageLabels={{
              organize: messages.share.stageOrganize,
              analyze: messages.share.stageAnalyze,
              summary: messages.share.stageSummary,
              build: messages.share.stageBuild,
            }}
            previewTitle={messages.share.previewTitle}
            previewEmpty={messages.share.previewEmpty}
            previewOpenLabel={messages.share.previewOpen}
            previewSummary={previewSummary}
            onOpenPreview={cardDraft ? () => openDecisionCard() : undefined}
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
              setSyncMessage(messages.card.copyLink);
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

        {draftReady ? (
          wizardStep === 3 ? (
            <WizardBottomNav
              backLabel={messages.wizard.backToEdit}
              nextLabel={messages.wizard.saveDraft}
              nextPrimary={false}
              onBack={() => void goToStep(2)}
              onNext={() => void saveDraftExplicit()}
              nextDisabled={syncingCard}
            />
          ) : (
            <WizardBottomNav
              backLabel={messages.wizard.back}
              nextLabel={messages.wizard.next}
              onBack={wizardStep > 1 ? () => void goToStep((wizardStep - 1) as WizardStep) : undefined}
              onNext={() => void goToStep((wizardStep + 1) as WizardStep)}
              nextDisabled={
                wizardStep === 1 ? !isStep1Complete({ address, viewingAt }) : false
              }
            />
          )
        ) : null}

        {showAiConsent && (
          <Dialog
            open
            onClose={() => decideAiConsent(false)}
            title={messages.aiBoundary.consentTitle}
            description={messages.aiBoundary.consentBody}
          >
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => decideAiConsent(false)}
                  className="min-h-11 rounded-full border border-black/10 px-5 text-[13px] font-bold"
                >
                  {messages.aiBoundary.consentDecline}
                </button>
                <button
                  type="button"
                  onClick={() => decideAiConsent(true)}
                  className="min-h-11 rounded-full bg-[#111] px-5 text-[13px] font-bold text-white"
                >
                  {messages.aiBoundary.consentAccept}
                </button>
              </div>
          </Dialog>
        )}

        <Dialog
          open={pendingAddressSwitch != null}
          onClose={cancelAddressSwitch}
          title={messages.wizard.addressSwitchTitle}
          description={messages.wizard.addressSwitchBody}
        >
          <div className="mt-[var(--space-4)] flex flex-col gap-[var(--space-2)]">
            <button
              type="button"
              className="ui-button ui-button--primary w-full"
              onClick={() => void confirmAddressSwitchSaveAndNew()}
            >
              {messages.wizard.addressSwitchSaveAndNew}
            </button>
            <button
              type="button"
              className="ui-button ui-button--secondary w-full"
              onClick={() => void confirmAddressSwitchDiscardAndNew()}
            >
              {messages.wizard.addressSwitchDiscardAndNew}
            </button>
            <button
              type="button"
              className="ui-button ui-button--secondary w-full"
              onClick={cancelAddressSwitch}
            >
              {messages.wizard.addressSwitchCancel}
            </button>
          </div>
        </Dialog>

        <LoginGateDialog
          open={showLoginGate}
          copy={{ ...messages.loginGate, close: messages.card.close }}
          email={loginEmail}
          password={loginPassword}
          mode={loginMode}
          error={loginError}
          busy={syncingCard}
          onEmailChange={setLoginEmail}
          onPasswordChange={setLoginPassword}
          onModeChange={handleLoginModeChange}
          onSubmit={handleLoginForCard}
          onClose={closeLoginGate}
        />

        {showPaywall && (
          <Dialog
            open
            onClose={() => setShowPaywall(false)}
            title={messages.paywall.title}
            description={messages.paywall.body}
            backdropClassName="z-50 backdrop-blur-[2px] overflow-auto"
            className="relative"
          >
                <button
                  type="button"
                  aria-label={messages.card.close}
                  onClick={() => setShowPaywall(false)}
                  className="absolute right-4 top-4 min-w-11 min-h-11 rounded-full bg-[#F5F3F0] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>

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
          </Dialog>
        )}

        {showCard && cardDraft && (
          <Dialog
            open
            onClose={() => setShowCard(false)}
            title={<span className="sr-only">{messages.card.eyebrow}</span>}
            backdropClassName="z-[60] backdrop-blur-[2px] overflow-auto p-3 sm:p-4"
            className="max-w-[720px] p-0 bg-transparent shadow-none"
          >
              <div className="relative">
                <button
                  type="button"
                  aria-label={messages.card.close}
                  onClick={() => setShowCard(false)}
                  className="absolute top-3 right-3 z-20 min-w-11 min-h-11 rounded-full bg-black/70 text-white hover:bg-black/80 flex items-center justify-center"
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
                      <CardImageExportButton
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
                        }}
                        uiLabels={messages.cardImageExport}
                        privacyArmed={exportImageArmed}
                        onRequestPrivacy={() => requestShareAction("exportImage")}
                        onPrivacyConsumed={() => setExportImageArmed(false)}
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
          </Dialog>
        )}

        <SharePrivacyCheck
          open={showPrivacyCheck}
          labels={{
            title: messages.card.privacyTitle,
            body:
              privacyAction === "exportImage"
                ? messages.card.privacyBodyFile
                : messages.card.privacyBody,
            address: messages.card.privacyAddress,
            photos: messages.card.privacyPhotos,
            personal: messages.card.privacyPersonal,
            confirm:
              privacyAction === "exportImage"
                ? messages.card.privacyConfirmFile
                : messages.card.privacyConfirm,
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
            if (action === "exportImage") {
              setExportImageArmed(true);
              return;
            }
            if (action) void performShareAction(action);
          }}
        />
        <div className="h-4" />
      </div>
    </div>
  );
}
