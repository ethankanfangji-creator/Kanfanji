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
  MapPin,
  Mic,
  Search,
  Share2,
  Sparkles,
  Upload,
  Video,
  X,
  Zap,
} from "lucide-react";
import { ClientAuthBar } from "@/components/ClientAuthBar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { isActiveSubscriptionStatus } from "@/lib/billing-status";
import { bankQuestions } from "@/lib/i18n";
import { appendViewingUrl, uploadViewingFile } from "@/lib/media";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { FREE_VIEWING_LIMIT } from "@/lib/viewing-entitlement";
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
};

type Clip = {
  id: number;
  label: string;
  time: string;
  durationSec?: number;
  url?: string;
  file?: Blob;
};

type Photo = {
  id: number;
  url: string;
  tag: string;
  file?: File;
};

function extensionFor(file: Blob, fallback: string) {
  if (file.type.includes("webm")) return "webm";
  if (file.type.includes("mp4")) return "mp4";
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  if (file.type.includes("jpeg") || file.type.includes("jpg")) return "jpg";
  return fallback;
}

export function ClientPage() {
  const { locale, messages, t } = useI18n();
  const [address, setAddress] = useState("1200 Westwood St, Coquitlam");
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
  const [clips, setClips] = useState<Clip[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const photosRef = useRef<Photo[]>([]);
  const clipsRef = useRef<Clip[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const audioImportInput = useRef<HTMLInputElement>(null);
  const [showCard, setShowCard] = useState(false);
  const [showLoginGate, setShowLoginGate] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingSyncLoading, setBillingSyncLoading] = useState(false);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [checkoutTimedOut, setCheckoutTimedOut] = useState(false);
  const [syncingCard, setSyncingCard] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [propertyDraft, setPropertyDraft] = useState<Record<string, unknown>>({});
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMode, setLoginMode] = useState<"signin" | "signup">("signin");
  const [loginError, setLoginError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [freeCount, setFreeCount] = useState(0);
  const [isPro, setIsPro] = useState(false);

  const configured = isSupabaseConfigured();
  const canShare = identified && (notes.length > 0 || photos.length > 0 || clips.length > 0);
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

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;
    let timer: number | null = null;

    if (!supabase || !user) {
      queueMicrotask(() => {
        if (cancelled) return;
        setFreeCount(0);
        setIsPro(false);
        setHasStripeCustomer(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const awaitingCheckout =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("checkout") === "success";
    if (awaitingCheckout) {
      queueMicrotask(() => {
        if (cancelled) return;
        setShowPaywall(false);
        setCheckoutTimedOut(false);
        setSyncMessage(messages.paywall.processing);
      });
    }

    const loadEntitlement = async () => {
      const [{ count }, { data: sub }] = await Promise.all([
        supabase
          .from("viewings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("subscriptions")
          .select("status, plan, stripe_customer_id")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return false;
      setFreeCount(count ?? 0);
      setHasStripeCustomer(Boolean(sub?.stripe_customer_id));
      const pro = isActiveSubscriptionStatus(sub?.status);
      setIsPro(pro);
      if (awaitingCheckout && pro) {
        setSyncMessage(messages.paywall.syncSuccess);
        setCheckoutTimedOut(false);
      }
      return pro;
    };

    void (async () => {
      const pro = await loadEntitlement();
      if (cancelled || pro || !awaitingCheckout) return;
      let attempts = 0;
      const tick = async () => {
        const nextPro = await loadEntitlement();
        if (cancelled || nextPro) return;
        attempts += 1;
        if (attempts < 7) {
          timer = window.setTimeout(() => void tick(), 1500);
        } else {
          setCheckoutTimedOut(true);
          setSyncMessage(messages.paywall.processingTimeout);
        }
      };
      timer = window.setTimeout(() => void tick(), 1500);
    })();

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [user, messages.paywall.processing, messages.paywall.processingTimeout, messages.paywall.syncSuccess]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

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

  async function processRecording(blob: Blob, duration: number) {
    setAudioState("processing");
    setSyncMessage("Whisper 轉文字中...");

    const bank = activeQuestionBank();
    if (questions.length === 0) {
      setQuestions(bank);
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

      const response = await fetch("/api/process-recording", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        error?: string;
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
      };

      if (!response.ok) {
        throw new Error(payload.error || "錄音處理失敗");
      }

      const transcript = payload.transcript || "";
      const matched =
        payload.answers
          ?.filter((item) => item.status === "answered")
          .map((item) => item.id) ?? [];
      const generated = payload.new_questions ?? [];

      setNotes((current) => [
        ...current,
        {
          id: Date.now(),
          duration,
          transcript,
          matched,
        },
      ]);

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
          });
          nextId += 1;
        }

        return [...updated, ...extras];
      });

      if (payload.pros?.length) setPros(payload.pros.slice(0, 3));
      if (payload.risks?.length) setRisks(payload.risks.slice(0, 3));

      const followUpCount = generated.length;
      const pendingCount =
        (payload.answers?.filter((item) => item.status === "pending").length ?? 0) +
        generated.filter((item) => item.status !== "answered").length;
      setSyncMessage(
        `AI 已整理：答到 ${matched.length} 題，新增 ${followUpCount} 個追問，${pendingCount} 題待確認`,
      );
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "錄音處理失敗");
    } finally {
      setAudioState("idle");
      setAudioSeconds(0);
    }
  }

  async function toggleAudio() {
    if (audioState === "processing") return;

    if (audioState === "idle") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;
        audioChunksRef.current = [];
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "audio/mp4";
        const recorder = new MediaRecorder(stream, { mimeType: mime });
        recorder.ondataavailable = (event) => {
          if (event.data.size) audioChunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
          audioRecorderRef.current = null;
          const blob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || mime,
          });
          const duration = Math.max(
            1,
            Math.round((Date.now() - audioStartedAtRef.current) / 1000),
          );
          void processRecording(blob, duration);
        };
        audioRecorderRef.current = recorder;
        audioStartedAtRef.current = Date.now();
        recorder.start();
        setAudioSeconds(0);
        setAudioState("recording");
        setSyncMessage("正在錄音...");
      } catch {
        setSyncMessage("無法開啟麥克風，請檢查權限");
      }
      return;
    }

    if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
      audioRecorderRef.current.stop();
    } else {
      setAudioState("idle");
    }
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
    if (audioState === "recording" || audioState === "processing") {
      setSyncMessage("請先結束目前錄音再匯入");
      return;
    }

    setSyncMessage(`已匯入「${file.name}」· 準備分析...`);
    const duration = await readAudioDuration(file);
    await processRecording(file, duration);
  }

  async function saveViewing(
    nextTags: string[],
    nextQuestions: Question[],
    nextMarket: "CA" | "TH" | "OTHER",
    property?: Record<string, unknown>,
  ) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("尚未設定 Supabase");
    }

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (!currentUser) {
      throw new Error("請先登入後再上傳");
    }

    const payload = {
      address: address.trim(),
      tags: nextTags,
      market: nextMarket === "OTHER" ? "CA" : nextMarket,
      questions: nextQuestions,
      property: property ?? propertyDraft ?? {},
      user_id: currentUser.id,
      is_pro: isPro,
      property_id:
        typeof (property ?? propertyDraft)?.propertyId === "string"
          ? ((property ?? propertyDraft).propertyId as string)
          : null,
      updated_at: new Date().toISOString(),
    };

    if (viewingId) {
      let { error } = await supabase.from("viewings").update(payload).eq("id", viewingId);
      if (error?.message?.includes("property_id")) {
        const { property_id: _propertyId, ...withoutPropertyId } = payload;
        ({ error } = await supabase.from("viewings").update(withoutPropertyId).eq("id", viewingId));
      }
      if (error?.message?.includes("property")) {
        const { property: _property, ...withoutProperty } = payload;
        ({ error } = await supabase.from("viewings").update(withoutProperty).eq("id", viewingId));
      }
      if (error) throw error;
      return viewingId;
    }

    // New rows must go through POST /api/viewings (server free-tier / Pro gate).
    // Client INSERT is revoked by RLS — do not insert from the browser.
    const response = await fetch("/api/viewings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: payload.address,
        tags: payload.tags,
        market: payload.market,
        questions: payload.questions,
        property: payload.property,
        property_id: payload.property_id,
      }),
    });
    const result = (await response.json()) as {
      id?: string;
      error?: string;
      code?: string;
      isPro?: boolean;
      freeCount?: number;
    };
    if (!response.ok || !result.id) {
      if (result.code === "FREE_LIMIT_REACHED") {
        setShowPaywall(true);
      }
      throw new Error(result.error || "存檔失敗");
    }
    if (typeof result.isPro === "boolean") setIsPro(result.isPro);
    if (typeof result.freeCount === "number") setFreeCount(result.freeCount);
    setViewingId(result.id);
    return result.id;
  }

  async function lookupAddress() {
    if (!address.trim()) return;

    setLookingUp(true);
    setIdentified(false);
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
      setPropertyDraft({
        source: payload.source,
        propertyId: payload.propertyId ?? payload.details?.propertyId,
        ...payload.details,
      });
      setIdentified(true);
      const openData = (payload.details?.openData || null) as Record<string, unknown> | null;
      const zoning = openData?.zoningCode ? String(openData.zoningCode) : "";
      const propertyId = String(
        payload.propertyId ?? payload.details?.propertyId ?? "",
      );
      setSyncMessage(
        `${payload.source ?? "地址查詢"}完成` +
          (zoning ? ` · Zoning ${zoning}` : "") +
          (propertyId ? ` · property ${propertyId.slice(0, 8)}` : "") +
          " · 資料暫存本機",
      );
    } catch (error) {
      setIdentified(false);
      setSyncMessage(error instanceof Error ? error.message : "查詢失敗");
    } finally {
      setLookingUp(false);
    }
  }

  async function flushPendingMedia(id: string) {
    const pendingPhotos = photosRef.current.filter((photo) => photo.file);
    const pendingClips = clipsRef.current.filter((clip) => clip.file);
    if (pendingPhotos.length === 0 && pendingClips.length === 0) return;

    for (const photo of pendingPhotos) {
      if (!photo.file) continue;
      const url = await uploadViewingFile(
        id,
        "photos",
        photo.file,
        `${photo.id}.${extensionFor(photo.file, "jpg")}`,
      );
      await appendViewingUrl(id, "photo_urls", url);
      setPhotos((current) =>
        current.map((item) => (item.id === photo.id ? { ...item, url, file: undefined } : item)),
      );
    }
    for (const clip of pendingClips) {
      if (!clip.file) continue;
      const url = await uploadViewingFile(
        id,
        "videos",
        clip.file,
        `${clip.id}.${extensionFor(clip.file, "webm")}`,
      );
      await appendViewingUrl(id, "video_urls", url);
      setClips((current) =>
        current.map((item) => (item.id === clip.id ? { ...item, url, file: undefined } : item)),
      );
    }
  }

  async function syncAndOpenCard() {
    setSyncingCard(true);
    setSyncMessage("正在上傳看房資料...");
    try {
      const id = await saveViewing(tags, questions, marketCode, propertyDraft);
      if (!id) throw new Error("上傳失敗");
      await flushPendingMedia(id);
      setSyncMessage("已上傳雲端 · 卡片已就緒");
      setShowLoginGate(false);
      setShowCard(true);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "上傳失敗");
      throw error;
    } finally {
      setSyncingCard(false);
    }
  }

  async function handleGenerateCard() {
    if (!canShare) return;
    if (!configured) {
      setShowCard(true);
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
    try {
      await syncAndOpenCard();
      setFreeCount((n) => (viewingId ? n : n + 1));
    } catch {
      // message already set
    }
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

  async function openBillingPortal() {
    setPortalLoading(true);
    setSyncMessage("");
    try {
      const response = await fetch("/api/create-portal-session", { method: "POST" });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "無法開啟訂閱管理");
      }
      window.location.href = payload.url;
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Portal 失敗");
      setPortalLoading(false);
    }
  }

  async function resyncBilling() {
    setBillingSyncLoading(true);
    setSyncMessage("");
    try {
      const response = await fetch("/api/billing/sync", { method: "POST" });
      const payload = (await response.json()) as {
        status?: string;
        isPro?: boolean;
        plan?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "同步失敗");
      }
      const nextPro = Boolean(payload.isPro);
      setIsPro(nextPro);
      setHasStripeCustomer(true);
      setCheckoutTimedOut(false);
      setSyncMessage(
        nextPro ? messages.paywall.syncSuccess : `訂閱狀態：${payload.status ?? "inactive"}`,
      );
      if (nextPro) setShowPaywall(false);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "同步失敗");
    } finally {
      setBillingSyncLoading(false);
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
            .select("status, stripe_customer_id")
            .eq("user_id", currentUser.id)
            .maybeSingle(),
        ]);
        const nextCount = count ?? 0;
        const nextPro = isActiveSubscriptionStatus(sub?.status);
        setFreeCount(nextCount);
        setIsPro(nextPro);
        setHasStripeCustomer(Boolean(sub?.stripe_customer_id));
        if (!viewingId && nextCount >= FREE_VIEWING_LIMIT && !nextPro) {
          setShowLoginGate(false);
          setShowPaywall(true);
          setSyncingCard(false);
          return;
        }
      }

      await syncAndOpenCard();
      setFreeCount((n) => (viewingId ? n : n + 1));
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
    const clip: Clip = {
      id: Date.now(),
      label,
      time: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }),
      durationSec,
      url: URL.createObjectURL(blob),
      file: blob,
    };
    setClips((current) => [...current, clip]);
    setSyncMessage(
      durationSec
        ? `影片已加入（${durationSec}秒）· 生成卡片時會上傳`
        : "影片已暫存在此裝置，生成卡片時會上傳",
    );
  }

  function openNativeCamera() {
    if (clips.length >= 4) return;
    videoInput.current?.click();
  }

  async function onVideoFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await persistClip(file, messages.clipLabels[clips.length % messages.clipLabels.length]);
  }

  async function onPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.target.value = "";
    if (!files) return;

    const incoming = Array.from(files)
      .slice(0, 5 - photos.length)
      .map((file, index) => ({
        id: Date.now() + index,
        url: URL.createObjectURL(file),
        tag: messages.photoTags[photos.length + index] || "現場",
        file,
      }));
    setPhotos((current) => [...current, ...incoming]);
    setSyncMessage("照片已暫存 · AI 分析風險中...");

    const fileToDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("讀取照片失敗"));
        reader.readAsDataURL(file);
      });

    const results = await Promise.allSettled(
      incoming.map(async (photo) => {
        if (!photo.file) return null;
        const base64 = await fileToDataUrl(photo.file);
        const response = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64, tag: photo.tag, locale }),
        });
        const payload = (await response.json()) as { question?: string; error?: string };
        if (!response.ok || !payload.question) {
          throw new Error(payload.error || "Vision 失敗");
        }
        return { text: payload.question.trim(), tag: photo.tag };
      }),
    );

    const generated = results
      .filter((r): r is PromiseFulfilledResult<{ text: string; tag: string } | null> => r.status === "fulfilled")
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
      setSyncMessage(`照片 AI 已生成 ${generated.length} 題必問 · 暫存本機`);
    } else {
      const firstError = results.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      setSyncMessage(
        firstError
          ? `照片已暫存，AI 分析失敗：${firstError.reason instanceof Error ? firstError.reason.message : "請稍後再試"}`
          : "照片已暫存在此裝置，生成卡片時會上傳",
      );
    }
  }

  function copyCard() {
    void navigator.clipboard?.writeText(
      `${address}\n${messages.card.pros}:${pros.join(" / ")}\n${messages.card.risks}:${risks.join(" / ")}\n${notes[0]?.transcript || ""}`,
    );
    alert(messages.card.copy);
  }

  function shareCard() {
    if (navigator.share) {
      void navigator.share({ title: "看房記", text: address });
    } else {
      alert("可截圖分享此卡片");
    }
  }

  return (
    <div className="min-h-screen w-full flex justify-center bg-[#FDF6F0] text-[#1A1A1A]">
      <div className="w-full max-w-[420px] px-4 pt-6 pb-28">
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
            {user && (hasStripeCustomer || checkoutTimedOut) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {hasStripeCustomer && (
                  <button
                    type="button"
                    onClick={() => void openBillingPortal()}
                    disabled={portalLoading}
                    className="h-7 px-2.5 rounded-full bg-white border border-black/10 text-[10px] font-bold disabled:opacity-60"
                  >
                    {portalLoading ? messages.paywall.manageLoading : messages.paywall.manage}
                  </button>
                )}
                {(checkoutTimedOut || hasStripeCustomer) && !isPro && (
                  <button
                    type="button"
                    onClick={() => void resyncBilling()}
                    disabled={billingSyncLoading}
                    className="h-7 px-2.5 rounded-full bg-white border border-black/10 text-[10px] font-bold disabled:opacity-60"
                  >
                    {billingSyncLoading ? messages.paywall.syncLoading : messages.paywall.sync}
                  </button>
                )}
              </div>
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

        <div className="bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-[700] tracking-widest">ADDRESS</span>
            <span className="text-[10px] text-[#9CA3AF]">{messages.address.hint}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder={messages.address.placeholder}
                className="w-full h-[44px] pl-9 pr-3 rounded-full bg-[#F8F4EF] border border-black/5 text-[14px] font-medium outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>
            <button
              onClick={() => void lookupAddress()}
              disabled={lookingUp}
              className="w-[44px] h-[44px] rounded-full bg-black text-white flex items-center justify-center shrink-0 active:scale-95 transition disabled:opacity-60"
            >
              {lookingUp ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
            </button>
          </div>
          {lookingUp && (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-[#6B7280] animate-pulse">
              <Zap className="w-4 h-4" /> {messages.address.lookingUp}
            </div>
          )}
          {identified && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1.5 rounded-full bg-[#F3F0EB] text-[12px] font-medium border border-black/5"
                >
                  {tag}
                </span>
              ))}
              <span className="px-3 py-1.5 rounded-full bg-[#E8F5E9] text-[12px] font-medium text-[#2E7D32] flex items-center gap-1">
                <Check className="w-3 h-3" /> {messages.address.identified}
              </span>
            </div>
          )}
          {identified &&
            Boolean(
              (propertyDraft.openData as { zoningCode?: string } | undefined)?.zoningCode,
            ) && (
              <div className="mt-3 rounded-xl bg-[#EEF2FF] border border-[#C7D2FE] p-3 text-[11px] text-[#3730A3] leading-[1.45]">
                {messages.address.openDataPrefix}
                {String((propertyDraft.openData as { city?: string }).city || "")}
                {" · "}
                Zoning {(propertyDraft.openData as { zoningCode?: string }).zoningCode}
                {(propertyDraft.openData as { zoningLabel?: string }).zoningLabel
                  ? `（${(propertyDraft.openData as { zoningLabel?: string }).zoningLabel}）`
                  : ""}
                {(propertyDraft.openData as { pid?: string }).pid
                  ? ` · PID ${(propertyDraft.openData as { pid?: string }).pid}`
                  : ""}
              </div>
            )}
          {syncMessage && (
            <p className="mt-3 text-[11px] text-[#6B7280]">{syncMessage}</p>
          )}
        </div>

        {(identified || questions.some((q) => q.isDynamic && q.source === "photo")) && (
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
        )}

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
              <button
                onClick={() => void toggleAudio()}
                disabled={audioState === "processing"}
                className={`w-[88px] h-[88px] rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(59,130,246,0.35)] active:scale-95 transition-all disabled:opacity-70 ${
                  audioState === "recording"
                    ? "bg-[#EF4444] shadow-[0_8px_24px_rgba(239,68,68,0.35)]"
                    : audioState === "processing"
                      ? "bg-[#6366F1]"
                      : "bg-[#3B82F6]"
                }`}
              >
                <Mic
                  className={`w-8 h-8 text-white ${
                    audioState === "recording" || audioState === "processing" ? "animate-pulse" : ""
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => audioImportInput.current?.click()}
                disabled={audioState === "recording" || audioState === "processing"}
                className="w-[64px] h-[64px] rounded-full bg-[#F8FAFF] border border-[#DBEAFE] text-[#2563EB] flex flex-col items-center justify-center gap-0.5 active:scale-95 transition disabled:opacity-50"
                title={messages.audio.importHint}
              >
                <Upload className="w-5 h-5" />
                <span className="text-[9px] font-bold tracking-wide">{messages.audio.import}</span>
              </button>
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
                  ? messages.audio.recording
                  : audioState === "processing"
                    ? messages.audio.processing
                    : messages.audio.idle}
              </p>
              <p className="text-[12px] text-[#8A8A8A] mt-1">
                {messages.audio.pipeline}
              </p>
            </div>
          </div>
          {notes.length > 0 && (
            <div className="mt-5 space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-xl bg-[#F8FAFF] border border-[#DBEAFE] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#2563EB] flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {t(messages.audio.noteLabel, { seconds: note.duration })}
                    </span>
                    <span className="text-[10px] text-[#6B7280]">
                      已轉文字 · 匹配 {note.matched.length} 題
                    </span>
                  </div>
                  <p className="text-[12px] leading-[1.5] mt-1.5 text-[#374151]">「{note.transcript}」</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[24px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-5 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-[800] tracking-widest">{messages.photos.title}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F5F3F0] border border-black/5 font-mono">
              {photos.length}/5
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="relative aspect-[4/3] rounded-xl overflow-hidden bg-[#F5F3F0] border border-black/5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.tag} className="w-full h-full object-cover" />
                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-full bg-black/70 text-white text-[9px]">
                  {photo.tag}
                </span>
                <button
                  onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {photos.length < 5 && (
              <button
                onClick={() => photoInput.current?.click()}
                className="aspect-[4/3] rounded-xl border-2 border-dashed border-black/10 bg-[#FAF7F3] flex flex-col items-center justify-center gap-1 hover:bg-[#F5F3F0] transition"
              >
                <Camera className="w-6 h-6 text-[#9CA3AF]" />
                <span className="text-[11px] font-medium text-[#6B7280]">{messages.photos.add}</span>
                <span className="text-[10px] text-[#9CA3AF]">{messages.photos.addSub}</span>
              </button>
            )}
          </div>
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
                  {clip.url ? (
                    <video
                      src={clip.url}
                      controls
                      playsInline
                      className="w-full aspect-video bg-black object-cover"
                    />
                  ) : null}
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

        <button
          onClick={() => void handleGenerateCard()}
          disabled={!canShare || syncingCard}
          className={`w-full rounded-[18px] py-4 px-5 flex flex-col items-center justify-center transition-all active:scale-[0.99] ${
            canShare
              ? "bg-black text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
              : "bg-[#E5E2DE] text-[#9CA3AF] cursor-not-allowed"
          }`}
        >
          <span className="text-[14px] font-[800] tracking-wide flex items-center gap-2">
            {canShare && <Sparkles className="w-4 h-4" />}
            {syncingCard ? messages.share.uploading : messages.share.button}
          </span>
          <span className="text-[11px] mt-1 opacity-70">
            {canShare
              ? user
                ? messages.share.readyLoggedIn
                : messages.share.readyGuest
              : messages.share.needMore}
          </span>
        </button>

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
              {hasStripeCustomer && (
                <button
                  type="button"
                  onClick={() => void openBillingPortal()}
                  disabled={portalLoading}
                  className="mt-2 w-full h-[44px] rounded-full bg-white border border-black/10 text-[13px] font-bold disabled:opacity-60"
                >
                  {portalLoading ? messages.paywall.manageLoading : messages.paywall.manage}
                </button>
              )}
              {(checkoutTimedOut || hasStripeCustomer) && (
                <button
                  type="button"
                  onClick={() => void resyncBilling()}
                  disabled={billingSyncLoading}
                  className="mt-2 w-full h-[44px] rounded-full bg-white border border-black/10 text-[13px] font-bold disabled:opacity-60"
                >
                  {billingSyncLoading ? messages.paywall.syncLoading : messages.paywall.sync}
                </button>
              )}
              <p className="mt-3 text-[11px] text-[#9CA3AF] text-center">
                {messages.paywall.footer}
              </p>
            </div>
          </div>
        )}

        {showCard && (
          <div className="fixed inset-0 z-50 flex justify-center bg-black/40 backdrop-blur-[2px] p-4 overflow-auto">
            <div className="w-full max-w-[420px] my-auto">
              <div className="bg-white rounded-[28px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
                <div className="bg-[#111] text-white p-5 relative">
                  <button
                    onClick={() => setShowCard(false)}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <p className="text-[10px] tracking-[0.2em] opacity-60">{messages.brand.cardEyebrow}</p>
                  <h3 className="text-[18px] font-bold mt-2 leading-[1.2]">{address}</h3>
                  <div className="mt-3 flex gap-2">
                    {tags.map((tag) => (
                      <span key={tag} className="px-2.5 py-1 rounded-full bg-white/10 text-[11px]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] p-3">
                      <p className="text-[11px] font-bold text-[#166534] mb-2">✓ {messages.card.pros}</p>
                      <ul className="space-y-1.5 text-[12px] text-[#14532D] leading-[1.4]">
                        {pros.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-3">
                      <p className="text-[11px] font-bold text-[#991B1B] mb-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {messages.card.risks}
                      </p>
                      <ul className="space-y-1.5 text-[12px] text-[#7F1D1D] leading-[1.4]">
                        {risks.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div>
                    <p className="text-[12px] font-bold tracking-widest mb-2">{messages.card.qa}</p>
                    <div className="space-y-2">
                      {questions.length === 0 ? (
                        <p className="text-[12px] text-[#9CA3AF]">{messages.card.qaEmpty}</p>
                      ) : (
                        questions.map((q) => (
                          <div key={q.id} className="rounded-xl bg-[#FAF7F3] border border-black/5 p-3">
                            <p className="text-[12px] font-bold flex items-center gap-1.5 flex-wrap">
                              {q.isDynamic && q.source === "photo" && (
                                <span className="px-1.5 py-0.5 rounded-full bg-[#059669] text-white text-[9px]">
                                  {messages.bank.photoBadge}
                                </span>
                              )}
                              {q.isFollowUp && (
                                <span className="px-1.5 py-0.5 rounded-full bg-[#7C3AED] text-white text-[9px]">
                                  {messages.bank.followBadge}
                                </span>
                              )}
                              Q: {q.text}
                            </p>
                            {q.basedOn && (
                              <p
                                className={`text-[10px] mt-1 ${
                                  q.source === "photo" ? "text-[#047857]/80" : "text-[#7C3AED]/80"
                                }`}
                              >
                                {q.source === "photo"
                                  ? `${messages.card.byTag}${q.basedOn}`
                                  : `${messages.card.byDialogue}${q.basedOn}`}
                              </p>
                            )}
                            <p className="text-[11px] text-[#6B7280] mt-1">
                              A: {q.answer || (q.checked ? messages.card.answered : messages.card.pending)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  {(clips.length > 0 || photos.length > 0) && (
                    <div>
                      <p className="text-[12px] font-bold tracking-widest mb-2">{messages.card.evidence}</p>
                      <div className="flex gap-2 overflow-auto pb-1">
                        {photos.map((photo) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={photo.id}
                            src={photo.url}
                            alt={photo.tag}
                            className="w-[88px] h-[66px] rounded-xl object-cover border border-black/5 shrink-0"
                          />
                        ))}
                        {clips.map((clip) => (
                          <div
                            key={clip.id}
                            className="w-[88px] h-[66px] rounded-xl bg-black text-white flex flex-col items-center justify-center shrink-0"
                          >
                            <Video className="w-4 h-4 mb-1" />
                            <span className="text-[9px]">{clip.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={copyCard}
                      className="flex-1 h-[44px] rounded-full bg-black text-white text-[13px] font-bold flex items-center justify-center gap-2"
                    >
                      <Copy className="w-4 h-4" /> 複製文字
                    </button>
                    <button
                      onClick={shareCard}
                      className="flex-1 h-[44px] rounded-full bg-[#F5F3F0] border border-black/10 text-[13px] font-bold flex items-center justify-center gap-2"
                    >
                      <Share2 className="w-4 h-4" /> 分享卡片
                    </button>
                  </div>
                  <p className="text-[10px] text-center text-[#9CA3AF]">
                    {viewingId ? "已同步雲端 · 家人一看就懂" : "本機預覽 · 登入上傳後可雲端保存"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="h-4" />
      </div>
    </div>
  );
}
