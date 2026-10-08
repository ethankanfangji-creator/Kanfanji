"use client";

import {
  FileUp,
  ImagePlus,
  Mic,
  Plus,
  Send,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  MediaPermissionBanner,
} from "@/components/media/MediaPermissionBanner";
import type { PermissionCopy } from "@/components/media/PermissionPreflight";
import { selectSupportedAudioMimeType } from "@/components/media/useMediaCapture";
import { AI_LIMITS } from "@/lib/ai-boundary/config";
import { MEDIA_IMPORT_LIMITS } from "@/lib/media-import";

import {
  createBrowserMediaPermissionAdapter,
  markCaptureExplained,
  type MediaPermissionAdapter,
  type MediaPermissionStatus,
} from "@/lib/media-permissions";
import type { AiUiAction } from "@/lib/ai-boundary/map-ai-error-ui";
import { AiErrorActionBar } from "@/components/ai/AiErrorActionBar";
import {
  attachMicDataCollector,
  armMicStopCollector,
  stopMicRecorder,
} from "@/lib/viewing-chat/mic-recording";
import type { ChatReplyRef } from "@/lib/viewing-chat/types";

export type ChatComposerLabels = {
  placeholder: string;
  send: string;
  recording: string;
  stop: string;
  attach: string;
  camera: string;
  uploadImage: string;
  uploadFile: string;
  uploadVideo?: string;
  empty: string;
  micDenied: string;
  importAudio: string;
  audioTooLarge: string;
  imageTooLarge: string;
  imageBadType?: string;
  emptyFile?: string;
  videoTooLarge?: string;
  fileTooLarge?: string;
  replyCancel?: string;
  replyingTo?: string;
  processing?: string;
  /** Idle voice-to-text control (replaces a bare mic affordance). */
  voiceToText?: string;
  uploading?: string;
  retry?: string;
};

type PermissionBannerState = {
  status: MediaPermissionStatus;
  message: string;
  /** Which fallback picker to open from the banner. */
  fallback: "audio" | "photo";
};

export function ViewingChatComposer({
  labels,
  permissionCopy,
  busy,
  processing,
  processingHint,
  externalError,
  errorActions,
  errorActionLabels,
  onErrorAction,
  onRetry,
  replyTo,
  onClearReply,
  onSubmit,
  mediaAdapter,
  /** When bottom nav is hidden (chat focus), pad for the home indicator. */
  edgeToBottom,
}: {
  labels: ChatComposerLabels;
  permissionCopy: PermissionCopy;
  busy?: boolean;
  /** True while turn / upload is in flight */
  processing?: boolean;
  processingHint?: string | null;
  externalError?: string | null;
  errorActions?: AiUiAction[];
  errorActionLabels?: { retry: string; signIn: string; upgrade: string };
  onErrorAction?: (action: AiUiAction) => void;
  onRetry?: () => void;
  replyTo?: ChatReplyRef | null;
  onClearReply?: () => void;
  onSubmit: (payload: {
    text: string;
    audio: Blob | null;
    image: File | null;
    file: File | null;
  }) => void | Promise<void>;
  /** Injectable for tests; defaults to browser MediaPermissionAdapter. */
  mediaAdapter?: MediaPermissionAdapter;
  edgeToBottom?: boolean;
}) {
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioImportRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachWrapRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef(mediaAdapter ?? createBrowserMediaPermissionAdapter());
  if (mediaAdapter) mediaRef.current = mediaAdapter;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  /** Skip auto-submit when MediaRecorder.stop runs during unmount. */
  const unmountingRef = useRef(false);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const clearComposerDraftRef = useRef<() => void>(() => undefined);
  const submitMicRecordingRef = useRef<(audio: Blob) => Promise<void>>(
    async () => undefined,
  );

  const TEXTAREA_MAX_PX = 168;
  const SINGLE_LINE_PX = 36;

  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [multiline, setMultiline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localMicProcessing, setLocalMicProcessing] = useState(false);
  const [permissionBanner, setPermissionBanner] =
    useState<PermissionBannerState | null>(null);

  // Mic onstop must not close over stale render state.
  const draftRef = useRef({ text, image, file, busy });
  draftRef.current = { text, image, file, busy };

  function resizeTextarea(nextText = text) {
    const el = textareaRef.current;
    if (!el) return;

    // Empty composer: lock single-line height. Measuring placeholder wrap on a
    // narrow phone otherwise toggles multiline layout forever (visible zooming).
    if (!nextText.trim() && !nextText.includes("\n")) {
      el.style.height = `${SINGLE_LINE_PX}px`;
      setMultiline((prev) => (prev ? false : prev));
      return;
    }

    el.style.height = "auto";
    const raw = el.scrollHeight;
    el.style.height = `${Math.min(Math.max(raw, SINGLE_LINE_PX), TEXTAREA_MAX_PX)}px`;
    setMultiline((prev) => {
      if (prev) return raw > SINGLE_LINE_PX + 1 || nextText.includes("\n");
      return raw > SINGLE_LINE_PX + 10 || nextText.includes("\n");
    });
  }

  useEffect(() => {
    resizeTextarea(text);
  }, [text]);

  useEffect(() => {
    if (!replyTo) return;
    textareaRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    // React Strict Mode remounts in dev — reset so a prior cleanup does not
    // permanently suppress mic auto-submit on the live instance.
    unmountingRef.current = false;
    return () => {
      unmountingRef.current = true;
      mediaRef.current.release(streamRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!attachOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!attachWrapRef.current?.contains(event.target as Node)) {
        setAttachOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setAttachOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [attachOpen]);

  async function beginRecording() {
    setPermissionBanner(null);
    setError(null);
    if (busy || recording || localMicProcessing) return;

    const media = mediaRef.current;
    if (!media.isMediaDevicesSupported() || !media.isMediaRecorderSupported()) {
      return;
    }

    const requested = await media.request("microphone", {
      audio: true,
      video: false,
    });
    if (!requested.ok) {
      setRecording(false);
      setPermissionBanner({
        status: requested.status,
        fallback: "audio",
        message: permissionCopy.status[requested.status] || labels.micDenied,
      });
      return;
    }

    streamRef.current = requested.stream;
    chunksRef.current = [];
    const mime = selectSupportedAudioMimeType(MediaRecorder.isTypeSupported);
    const recorder = mime
      ? new MediaRecorder(requested.stream, { mimeType: mime })
      : new MediaRecorder(requested.stream);
    recorderRef.current = recorder;
    attachMicDataCollector(recorder, chunksRef.current);
    markCaptureExplained("audio");
    setRecording(true);
    setAudioBlob(null);
    // timeslice keeps chunks flowing; stop() still emits a final chunk.
    recorder.start(250);
  }

  async function openMicFlow() {
    setError(null);
    setAttachOpen(false);
    setPermissionBanner(null);
    if (busy || recording || localMicProcessing) return;
    await beginRecording();
  }

  function openPhotoPicker() {
    setError(null);
    setAttachOpen(false);
    setPermissionBanner(null);
    if (busy || recording) return;
    // No capture= attribute — OS sheet offers camera or album.
    imageRef.current?.click();
  }

  function focusTextFallback() {
    setPermissionBanner(null);
    textareaRef.current?.focus();
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    const mimeType = recorder.mimeType || "audio/webm";
    setError(null);
    setLocalMicProcessing(true);
    setRecording(false);

    const blobPromise = armMicStopCollector(recorder, {
      chunks: chunksRef.current,
      mimeType,
    });

    try {
      stopMicRecorder(recorder);
    } catch {
      setLocalMicProcessing(false);
      mediaRef.current.release(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;
      return;
    }

    void blobPromise
      .then(async (blob) => {
        // Release only after the blob is collected — early release empties Chrome recordings.
        mediaRef.current.release(streamRef.current);
        streamRef.current = null;
        if (recorderRef.current === recorder) recorderRef.current = null;
        chunksRef.current = [];

        // Only skip submit on a true unmount mid-flight — not Strict Mode remount
        // (effect re-entry clears unmountingRef before the user can stop).
        if (unmountingRef.current) return;
        if (blob.size > AI_LIMITS.audioBytes) {
          setError(labelsRef.current.audioTooLarge);
          return;
        }
        if (blob.size === 0) {
          setError(labelsRef.current.empty);
          return;
        }
        await submitMicRecordingRef.current(blob);
      })
      .catch(() => {
        setError(labelsRef.current.empty);
      })
      .finally(() => {
        setLocalMicProcessing(false);
      });
  }

  function applyPickedFile(picked: File | null | undefined) {
    if (!picked) return;
    if (picked.size === 0) {
      setError(labels.emptyFile || labels.empty);
      return;
    }
    if (picked.type.startsWith("image/")) {
      if (picked.size > AI_LIMITS.imageBytes) {
        setError(labels.imageTooLarge);
        return;
      }
      setImage(picked);
      setFile(null);
      setPermissionBanner(null);
      setError(null);
      return;
    }
    if (picked.type.startsWith("audio/")) {
      if (picked.size > AI_LIMITS.audioBytes) {
        setError(labels.audioTooLarge);
        return;
      }
      setAudioBlob(picked);
      setFile(null);
      setPermissionBanner(null);
      setError(null);
      return;
    }
    if (picked.type.startsWith("video/")) {
      if (picked.size > MEDIA_IMPORT_LIMITS.videoBytes) {
        setError(labels.videoTooLarge || labels.empty);
        return;
      }
    } else if (picked.size > MEDIA_IMPORT_LIMITS.fileBytes) {
      setError(labels.fileTooLarge || labels.empty);
      return;
    }
    // Any other type is attach-only; session promotes video/* to a video note.
    setFile(picked);
    setImage(null);
    setPermissionBanner(null);
    setError(null);
  }

  function clearComposerDraft() {
    setText("");
    setAudioBlob(null);
    setImage(null);
    setFile(null);
    setMultiline(false);
    requestAnimationFrame(() => resizeTextarea(""));
  }
  clearComposerDraftRef.current = clearComposerDraft;

  async function submitMicRecording(audio: Blob) {
    const draft = draftRef.current;
    setError(null);
    setAttachOpen(false);
    setPermissionBanner(null);
    // Clear any staged chip immediately so stop never looks like "press Send".
    setAudioBlob(null);
    try {
      await onSubmitRef.current({
        text: draft.text.trim(),
        audio,
        image: draft.image,
        file: draft.file,
      });
      clearComposerDraftRef.current();
    } catch {
      // Keep the clip recoverable if upload/transcribe throws.
      setAudioBlob(audio);
      setError(labelsRef.current.empty);
    }
  }
  submitMicRecordingRef.current = submitMicRecording;

  async function handleSend() {
    if (busy || recording) return;
    if (!text.trim() && !audioBlob && !image && !file) {
      setError(labels.empty);
      return;
    }
    setError(null);
    setAttachOpen(false);
    setPermissionBanner(null);
    await onSubmit({
      text: text.trim(),
      audio: audioBlob,
      image,
      file,
    });
    clearComposerDraft();
  }

  const canSend = Boolean(text.trim() || audioBlob || image || file);

  const attachButton = (
    <div ref={attachWrapRef} className="relative shrink-0">
      <button
        type="button"
        disabled={busy || recording}
        aria-label={labels.attach}
        aria-expanded={attachOpen}
        onClick={() => setAttachOpen((open) => !open)}
        className={`flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full text-[#6B7280] transition active:bg-black/5 disabled:opacity-40 ${
          attachOpen ? "bg-black/8 text-[#111]" : ""
        }`}
      >
        <Plus
          className={`h-5 w-5 transition-transform ${attachOpen ? "rotate-45" : ""}`}
        />
      </button>
      {attachOpen ? (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+8px)] left-0 z-20 flex min-w-[9.5rem] flex-col overflow-hidden rounded-2xl border border-black/8 bg-white py-1 shadow-[0_8px_28px_rgba(0,0,0,0.12)]"
        >
          <AttachItem
            label={labels.uploadImage || labels.camera}
            onClick={openPhotoPicker}
            icon={<ImagePlus className="h-4 w-4" />}
          />
          <AttachItem
            label={labels.uploadFile}
            onClick={() => {
              setAttachOpen(false);
              fileRef.current?.click();
            }}
            icon={<FileUp className="h-4 w-4" />}
          />
        </div>
      ) : null}
    </div>
  );

  // Transcription status lives in the mic slot — not a separate banner.
  const voiceSlotBusy = localMicProcessing || Boolean(processingHint);

  const actionButtons = (
    <div className="flex shrink-0 items-center gap-0.5">
      {recording ? (
        <button
          type="button"
          aria-label={labels.stop}
          onClick={stopRecording}
          className="flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full bg-[#EF4444] text-white"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      ) : voiceSlotBusy ? (
        <span
          role="status"
          aria-label={
            processingHint || labels.processing || labels.uploading || "…"
          }
          className="flex min-h-[var(--touch-target)] max-w-[7.5rem] items-center gap-1.5 px-1.5 text-[10px] font-semibold leading-tight text-[#4B5563]"
        >
          <span
            className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-black/15 border-t-[#1A1A1A]"
            aria-hidden
          />
          <span className="min-w-0 truncate animate-pulse">
            {processingHint || labels.processing || labels.uploading || "…"}
          </span>
        </span>
      ) : (
        <button
          type="button"
          disabled={busy || localMicProcessing}
          aria-label={labels.recording}
          onClick={() => void openMicFlow()}
          className="flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full text-[#4B5563] active:bg-black/5 disabled:opacity-40"
        >
          <Mic className="h-5 w-5" />
        </button>
      )}
      <button
        type="button"
        disabled={busy || recording || voiceSlotBusy || !canSend}
        aria-label={labels.send}
        onClick={() => void handleSend()}
        className="flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full bg-[#111] text-white disabled:bg-transparent disabled:text-[#D1D5DB]"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div
      className={`bg-transparent px-2.5 pt-1.5 ${
        edgeToBottom
          ? "pb-[max(0.45rem,env(safe-area-inset-bottom))]"
          : "pb-1.5 md:pb-[max(0.65rem,env(safe-area-inset-bottom))]"
      }`}
    >
      {replyTo ? (
        <div className="mb-1.5 flex items-start gap-2 rounded-2xl bg-[#EFF6FF] px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-[#1D4ED8]">
              {labels.replyingTo || "Replying"}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-[#1E3A8A]">
              {replyTo.preview}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClearReply?.()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#1D4ED8] active:bg-white/70"
            aria-label={labels.replyCancel || "Cancel reply"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      {(audioBlob || image || file || recording) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1 text-[11px] font-medium text-[#6B7280]">
          {recording ? <span className="text-[#DC2626]">{labels.recording}…</span> : null}
          {audioBlob ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F4F6] px-2 py-0.5">
              ♪
              <button
                type="button"
                className="opacity-70"
                onClick={() => setAudioBlob(null)}
                aria-label="remove audio"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : null}
          {image ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F4F6] px-2 py-0.5">
              {image.name.slice(0, 16)}
              <button
                type="button"
                className="opacity-70"
                onClick={() => setImage(null)}
                aria-label="remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : null}
          {file ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F4F6] px-2 py-0.5">
              📎 {file.name.slice(0, 18)}
              <button
                type="button"
                className="opacity-70"
                onClick={() => setFile(null)}
                aria-label="remove file"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : null}
        </div>
      )}

      <input
        ref={imageRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        className="hidden"
        data-testid="photo-gallery-input"
        onChange={(event) => {
          applyPickedFile(event.target.files?.[0]);
          event.target.value = "";
          setAttachOpen(false);
        }}
      />
      <input
        ref={audioImportRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.aac,.caf"
        className="hidden"
        data-testid="audio-import-input"
        onChange={(event) => {
          applyPickedFile(event.target.files?.[0]);
          event.target.value = "";
          setAttachOpen(false);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="*/*"
        className="hidden"
        data-testid="file-attach-input"
        onChange={(event) => {
          applyPickedFile(event.target.files?.[0]);
          event.target.value = "";
          setAttachOpen(false);
        }}
      />

      {permissionBanner ? (
        <MediaPermissionBanner
          status={permissionBanner.status}
          message={permissionBanner.message}
          settingsHint={permissionCopy.settingsHint}
          importLabel={permissionCopy.importInstead}
          onImport={() => {
            const fallback = permissionBanner.fallback;
            setPermissionBanner(null);
            if (fallback === "audio") {
              audioImportRef.current?.click();
              return;
            }
            imageRef.current?.click();
          }}
          textNoteLabel={permissionCopy.textNoteInstead}
          onTextNote={focusTextFallback}
          onDismiss={() => setPermissionBanner(null)}
        />
      ) : null}

      {processing && !processingHint && !localMicProcessing ? (
        <p
          className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-[#4B5563]"
          role="status"
        >
          <span
            className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-black/15 border-t-[#1A1A1A]"
            aria-hidden
          />
          <span className="animate-pulse">
            {labels.processing || labels.uploading || "…"}
          </span>
        </p>
      ) : null}

      {error || externalError ? (
        <div className="mb-1.5 flex flex-col gap-1.5 px-1" role="alert">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[11px] font-medium text-[#991B1B]">
              {externalError || error}
            </p>
            {onRetry && externalError && !(errorActions && errorActions.length > 0) ? (
              <button
                type="button"
                onClick={onRetry}
                className="shrink-0 rounded-full bg-[#FEE2E2] px-2.5 py-1 text-[11px] font-bold text-[#991B1B]"
              >
                {labels.retry || "Retry"}
              </button>
            ) : null}
          </div>
          {errorActions && errorActions.length > 0 && errorActionLabels && onErrorAction ? (
            <AiErrorActionBar
              actions={errorActions}
              labels={errorActionLabels}
              disabled={busy || processing}
              onAction={(action) => {
                if (action === "retry" && onRetry) {
                  onRetry();
                  return;
                }
                onErrorAction(action);
              }}
            />
          ) : null}
        </div>
      ) : null}

      <div
        className={
          multiline
            ? "flex flex-col gap-1 rounded-[22px] bg-[#F3F4F6] px-2 pb-1 pt-2"
            : "flex items-center gap-0.5 rounded-[24px] bg-[#F3F4F6] px-1 py-1"
        }
      >
        <label htmlFor="viewing-chat-composer" className="sr-only">
          {labels.placeholder}
        </label>
        {!multiline ? attachButton : null}
        <textarea
          ref={textareaRef}
          id="viewing-chat-composer"
          rows={1}
          value={text}
          disabled={busy}
          placeholder={labels.placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
          className={
            multiline
              ? "max-h-[168px] min-h-9 w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-0.5 text-[15px] leading-[22px] text-[#111] outline-none placeholder:text-[#9CA3AF] disabled:opacity-60"
              : "max-h-[168px] min-h-9 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-[7px] text-[15px] leading-[22px] text-[#111] outline-none placeholder:text-[#9CA3AF] disabled:opacity-60"
          }
        />
        {multiline ? (
          <div className="flex w-full items-center justify-between">
            {attachButton}
            {actionButtons}
          </div>
        ) : (
          actionButtons
        )}
      </div>
    </div>
  );
}

function AttachItem({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[#1A1A1A] active:bg-black/5"
    >
      <span className="text-[#6B7280]">{icon}</span>
      {label}
    </button>
  );
}
