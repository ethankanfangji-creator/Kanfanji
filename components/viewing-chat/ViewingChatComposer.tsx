"use client";

import {
  Camera,
  FileUp,
  ImagePlus,
  Mic,
  Plus,
  Send,
  Square,
  Video,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  MediaPermissionBanner,
} from "@/components/media/MediaPermissionBanner";
import {
  PermissionPreflight,
  type PermissionCopy,
} from "@/components/media/PermissionPreflight";
import { selectSupportedAudioMimeType } from "@/components/media/useMediaCapture";
import { AI_LIMITS } from "@/lib/ai-boundary/config";
import { MEDIA_IMPORT_LIMITS } from "@/lib/media-import";
import {
  createBrowserMediaPermissionAdapter,
  decideCaptureStart,
  hasCaptureExplained,
  isBlockingPermissionStatus,
  markCaptureExplained,
  type CaptureKind,
  type MediaPermissionAdapter,
  type MediaPermissionStatus,
} from "@/lib/media-permissions";
import type { AiUiAction } from "@/lib/ai-boundary/map-ai-error-ui";
import { AiErrorActionBar } from "@/components/ai/AiErrorActionBar";
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
  replyCancel?: string;
  replyingTo?: string;
  processing?: string;
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
  keyboardOpen = false,
  externalError,
  errorActions,
  errorActionLabels,
  onErrorAction,
  onRetry,
  replyTo,
  onClearReply,
  onSubmit,
  mediaAdapter,
}: {
  labels: ChatComposerLabels;
  permissionCopy: PermissionCopy;
  busy?: boolean;
  /** True while turn / upload is in flight */
  processing?: boolean;
  processingHint?: string | null;
  /** Soft keyboard open — parent hides bottom tabs; keep composer flush above keyboard. */
  keyboardOpen?: boolean;
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
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioImportRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachWrapRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef(mediaAdapter ?? createBrowserMediaPermissionAdapter());
  if (mediaAdapter) mediaRef.current = mediaAdapter;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

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
  const [preflightKind, setPreflightKind] = useState<CaptureKind | null>(null);
  const [preflightStatus, setPreflightStatus] =
    useState<MediaPermissionStatus | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [permissionBanner, setPermissionBanner] =
    useState<PermissionBannerState | null>(null);

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
    return () => {
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

  function showPermissionBanner(
    status: MediaPermissionStatus,
    fallback: "audio" | "photo",
  ) {
    setPermissionBanner({
      status,
      fallback,
      message: permissionCopy.status[status] || labels.micDenied,
    });
  }

  async function beginRecording() {
    setPreflightKind(null);
    setPermissionBanner(null);
    setError(null);
    if (busy || recording) return;

    const media = mediaRef.current;
    if (!media.isMediaDevicesSupported() || !media.isMediaRecorderSupported()) {
      showPermissionBanner("unsupported", "audio");
      return;
    }

    const requested = await media.request("microphone", {
      audio: true,
      video: false,
    });
    if (!requested.ok) {
      // Keep typed notes / attachments — only surface actionable fallback.
      showPermissionBanner(requested.status, "audio");
      return;
    }

    streamRef.current = requested.stream;
    chunksRef.current = [];
    const mime = selectSupportedAudioMimeType(MediaRecorder.isTypeSupported);
    const recorder = mime
      ? new MediaRecorder(requested.stream, { mimeType: mime })
      : new MediaRecorder(requested.stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      mediaRef.current.release(streamRef.current);
      streamRef.current = null;
      setRecording(false);
      if (blob.size > AI_LIMITS.audioBytes) {
        setError(labels.audioTooLarge);
        setAudioBlob(null);
        return;
      }
      setAudioBlob(blob);
    };
    markCaptureExplained("audio");
    setRecording(true);
    setAudioBlob(null);
    recorder.start(250);
  }

  async function openMicFlow() {
    setError(null);
    setAttachOpen(false);
    setPermissionBanner(null);
    if (busy || recording) return;

    const media = mediaRef.current;
    setPreflightBusy(true);
    let status: MediaPermissionStatus = "prompt";
    if (!media.isMediaDevicesSupported() || !media.isMediaRecorderSupported()) {
      status = "unsupported";
    } else {
      status = await media.query("microphone");
    }
    setPreflightBusy(false);

    const decision = decideCaptureStart({
      kind: "audio",
      status,
      explained: hasCaptureExplained("audio"),
    });

    if (decision.action === "show-reauth") {
      showPermissionBanner(decision.status, "audio");
      return;
    }
    if (decision.action === "show-preflight") {
      setPreflightKind("audio");
      setPreflightStatus(decision.status);
      return;
    }
    await beginRecording();
  }

  async function openCameraFlow() {
    setError(null);
    setAttachOpen(false);
    setPermissionBanner(null);
    if (busy || recording) return;

    const media = mediaRef.current;
    setPreflightBusy(true);
    let status: MediaPermissionStatus = "prompt";
    if (media.isMediaDevicesSupported()) {
      status = await media.query("camera");
    }
    setPreflightBusy(false);

    // Camera capture may be permanently blocked — offer gallery before OS picker.
    if (isBlockingPermissionStatus(status)) {
      showPermissionBanner(status, "photo");
      return;
    }

    // Reuse the video explained flag: both need a one-shot camera explain.
    const decision = decideCaptureStart({
      kind: "video",
      status,
      explained: hasCaptureExplained("video"),
    });

    if (decision.action === "show-preflight") {
      setPreflightKind("video");
      setPreflightStatus(decision.status);
      return;
    }

    cameraRef.current?.click();
  }

  async function onPreflightContinue() {
    if (!preflightKind) return;
    const kind = preflightKind;
    if (kind === "audio") {
      markCaptureExplained("audio");
      await beginRecording();
      return;
    }
    if (kind === "video") {
      markCaptureExplained("video");
      setPreflightKind(null);
      setPermissionBanner(null);
      cameraRef.current?.click();
      return;
    }
    setPreflightKind(null);
    imageRef.current?.click();
  }

  function onPreflightImport() {
    const kind = preflightKind;
    setPreflightKind(null);
    if (kind === "audio") {
      audioImportRef.current?.click();
      return;
    }
    // Camera / photo: gallery without capture attribute
    imageRef.current?.click();
  }

  function onPreflightCancel() {
    setPreflightKind(null);
    setPreflightBusy(false);
    // Do not clear composer text / attachments.
  }

  function focusTextFallback() {
    setPermissionBanner(null);
    setPreflightKind(null);
    textareaRef.current?.focus();
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
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
    }
    // Video and other docs travel as file attachments
    setFile(picked);
    setImage(null);
    setPermissionBanner(null);
    setError(null);
  }

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
    setText("");
    setAudioBlob(null);
    setImage(null);
    setFile(null);
    setMultiline(false);
    requestAnimationFrame(() => resizeTextarea(""));
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
            label={labels.camera}
            onClick={() => void openCameraFlow()}
            icon={<Camera className="h-4 w-4" />}
          />
          <AttachItem
            label={labels.uploadImage}
            onClick={() => {
              setAttachOpen(false);
              imageRef.current?.click();
            }}
            icon={<ImagePlus className="h-4 w-4" />}
          />
          <AttachItem
            label={labels.importAudio}
            onClick={() => {
              setAttachOpen(false);
              audioImportRef.current?.click();
            }}
            icon={<Mic className="h-4 w-4" />}
          />
          <AttachItem
            label={labels.uploadVideo || "Video"}
            onClick={() => {
              setAttachOpen(false);
              videoRef.current?.click();
            }}
            icon={<Video className="h-4 w-4" />}
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
      ) : (
        <button
          type="button"
          disabled={busy}
          aria-label={labels.recording}
          onClick={() => void openMicFlow()}
          className="flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full text-[#4B5563] active:bg-black/5 disabled:opacity-40"
        >
          <Mic className="h-5 w-5" />
        </button>
      )}
      <button
        type="button"
        disabled={busy || recording || !canSend}
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
      className={
        keyboardOpen
          ? "bg-transparent px-2.5 pb-1.5 pt-1.5"
          : "bg-transparent px-2.5 pb-1.5 pt-1.5 md:pb-[max(0.65rem,env(safe-area-inset-bottom))]"
      }
      data-keyboard-open={keyboardOpen ? "true" : "false"}
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
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="camera-capture-input"
        onChange={(event) => {
          applyPickedFile(event.target.files?.[0]);
          event.target.value = "";
          setAttachOpen(false);
        }}
      />
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
        ref={videoRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        className="hidden"
        onChange={(event) => {
          applyPickedFile(event.target.files?.[0]);
          event.target.value = "";
          setAttachOpen(false);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt,.m4a,.mp3,.wav,.webm,.mp4,.mov"
        className="hidden"
        onChange={(event) => {
          applyPickedFile(event.target.files?.[0]);
          event.target.value = "";
          setAttachOpen(false);
        }}
      />

      {preflightKind ? (
        <PermissionPreflight
          kind={preflightKind}
          copy={permissionCopy}
          status={preflightStatus}
          busy={preflightBusy}
          onContinue={() => void onPreflightContinue()}
          onCancel={onPreflightCancel}
          onImport={onPreflightImport}
          onTextNote={focusTextFallback}
        />
      ) : null}

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

      {processing || processingHint ? (
        <p
          className="mb-1.5 px-1 text-[11px] font-semibold text-[#1D4ED8]"
          role="status"
        >
          {processingHint || labels.processing || labels.uploading || "…"}
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
