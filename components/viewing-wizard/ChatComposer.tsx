"use client";

import { ImagePlus, Mic, Send, Square, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { AI_LIMITS, IMAGE_MIME_TYPES } from "@/lib/ai-boundary/config";
import { selectSupportedAudioMimeType } from "@/components/media/useMediaCapture";
import {
  PermissionPreflight,
  type PermissionCopy,
} from "@/components/media/PermissionPreflight";
import {
  createBrowserMediaPermissionAdapter,
  decideCaptureStart,
  hasCaptureExplained,
  markCaptureExplained,
  type MediaPermissionAdapter,
  type MediaPermissionStatus,
} from "@/lib/media-permissions";
import type { AiUiAction } from "@/lib/ai-boundary/map-ai-error-ui";
import { AiErrorActionBar } from "@/components/ai/AiErrorActionBar";

export type ComposerSuggestionTicket = {
  id: number;
  text: string;
  priority?: "high" | "medium" | "low";
  category?: string;
  discoveryStatus?: "pending" | "confirmed" | "ignored";
  hint?: string;
};

export type ChatComposerMessages = {
  placeholder: string;
  placeholderBound: string;
  send: string;
  cancel: string;
  recording: string;
  stopRecording: string;
  attachImage: string;
  removeImage: string;
  removeAudio: string;
  clearBound: string;
  suggestionsLabel: string;
  limitsHint: string;
  imageTooLarge: string;
  imageBadType: string;
  audioTooLarge: string;
  emptyError: string;
  micDenied: string;
  micUnsupported: string;
  uploading: string;
  integrating: string;
  transcribing: string;
  reEdit: string;
  sourceUser: string;
  sourceAi: string;
  discoveryBadge: string;
};

export type ChatComposerSubmitPayload = {
  text: string;
  transcript: string;
  imageFile: File | null;
  audioBlob: Blob | null;
  audioDurationSec: number;
  boundQuestionId: number | null;
};

const MAX_IMAGE_BYTES = AI_LIMITS.imageBytes;
const MAX_AUDIO_BYTES = AI_LIMITS.audioBytes;

export function ChatComposer({
  messages,
  suggestions,
  boundQuestionId,
  boundQuestionText,
  busy = false,
  progressLabel = null,
  error = null,
  errorActions,
  errorActionLabels,
  onErrorAction,
  mediaAdapter,
  permissionCopy,
  onBindQuestion,
  onClearBound,
  onSubmit,
  onCancel,
}: {
  messages: ChatComposerMessages;
  suggestions: ComposerSuggestionTicket[];
  boundQuestionId: number | null;
  boundQuestionText: string | null;
  busy?: boolean;
  progressLabel?: string | null;
  error?: string | null;
  errorActions?: AiUiAction[];
  errorActionLabels?: { retry: string; signIn: string; upgrade: string };
  onErrorAction?: (action: AiUiAction) => void;
  /** Injectable for tests; defaults to browser MediaPermissionAdapter. */
  mediaAdapter?: MediaPermissionAdapter;
  /** When set, first mic tap shows why-permission copy before getUserMedia. */
  permissionCopy?: PermissionCopy;
  onBindQuestion: (id: number) => void;
  onClearBound: () => void;
  onSubmit: (payload: ChatComposerSubmitPayload) => void | Promise<void>;
  onCancel: () => void;
}) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const mediaRef = useRef(mediaAdapter ?? createBrowserMediaPermissionAdapter());
  if (mediaAdapter) mediaRef.current = mediaAdapter;

  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastSentText, setLastSentText] = useState<string | null>(null);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightStatus, setPreflightStatus] = useState<MediaPermissionStatus | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    return () => {
      stopRecorderInternal(true);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  function stopRecorderInternal(discard: boolean) {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    mediaRef.current.release(streamRef.current);
    streamRef.current = null;
    if (discard) {
      chunksRef.current = [];
      setRecording(false);
      setRecordSeconds(0);
    }
  }

  async function beginRecording() {
    setPreflightOpen(false);
    setPreflightStatus(null);
    setLocalError(null);
    if (recording || busy) return;
    const media = mediaRef.current;
    if (!media.isMediaDevicesSupported() || !media.isMediaRecorderSupported()) {
      setLocalError(messages.micUnsupported);
      return;
    }
    try {
      const requested = await media.request("microphone", { audio: true, video: false });
      if (!requested.ok) {
        setLocalError(
          requested.status === "unsupported" ? messages.micUnsupported : messages.micDenied,
        );
        return;
      }
      const stream = requested.stream;
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = selectSupportedAudioMimeType(MediaRecorder.isTypeSupported);
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
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
        if (timerRef.current != null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const duration = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        );
        if (blob.size > MAX_AUDIO_BYTES) {
          setLocalError(messages.audioTooLarge);
          setAudioBlob(null);
          setAudioDurationSec(0);
          return;
        }
        setAudioBlob(blob);
        setAudioDurationSec(duration);
        setRecordSeconds(duration);
      };
      startedAtRef.current = Date.now();
      setRecordSeconds(0);
      setRecording(true);
      setAudioBlob(null);
      recorder.start(250);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
      }, 250);
    } catch {
      setLocalError(messages.micDenied);
      stopRecorderInternal(true);
    }
  }

  async function startRecording() {
    setLocalError(null);
    if (recording || busy) return;
    const media = mediaRef.current;
    if (!media.isMediaDevicesSupported() || !media.isMediaRecorderSupported()) {
      setLocalError(messages.micUnsupported);
      return;
    }

    if (!permissionCopy) {
      await beginRecording();
      return;
    }

    setPreflightBusy(true);
    const status = await media.query("microphone");
    setPreflightBusy(false);

    const decision = decideCaptureStart({
      kind: "audio",
      status,
      explained: hasCaptureExplained("audio"),
    });

    if (decision.action === "show-reauth" || decision.action === "show-preflight") {
      setPreflightStatus(decision.status);
      setPreflightOpen(true);
      return;
    }

    await beginRecording();
  }

  async function onPreflightContinue() {
    markCaptureExplained("audio");
    await beginRecording();
  }

  function onPreflightCancel() {
    setPreflightOpen(false);
    setPreflightStatus(null);
  }

  function onPreflightTextNote() {
    onPreflightCancel();
    textAreaRef.current?.focus();
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") recorder.stop();
  }

  function onPickImage(file: File | null) {
    setLocalError(null);
    if (!file) return;
    if (!IMAGE_MIME_TYPES.has(file.type)) {
      setLocalError(messages.imageBadType);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES * 4) {
      // Allow larger camera originals; AI path will normalize.
      setLocalError(messages.imageTooLarge);
      return;
    }
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  }

  function clearImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
  }

  function clearAudio() {
    stopRecorderInternal(true);
    setAudioBlob(null);
    setAudioDurationSec(0);
    setRecordSeconds(0);
  }

  function resetDraft() {
    setText("");
    clearImage();
    clearAudio();
    setLocalError(null);
  }

  function handleCancel() {
    resetDraft();
    onClearBound();
    onCancel();
  }

  async function handleSubmit() {
    if (busy || recording) return;
    const trimmed = text.trim();
    if (!trimmed && !imageFile && !audioBlob) {
      setLocalError(messages.emptyError);
      return;
    }
    setLocalError(null);
    setLastSentText(trimmed || null);
    await onSubmit({
      text: trimmed,
      transcript: "",
      imageFile,
      audioBlob,
      audioDurationSec,
      boundQuestionId,
    });
    resetDraft();
  }

  const displayError = localError || error;
  const canSend = !busy && !recording && Boolean(text.trim() || imageFile || audioBlob);

  return (
    <>
    <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] inset-x-0 z-40 flex justify-center pointer-events-none">
      <div className="pointer-events-auto box-border w-full max-w-[min(420px,100%)] px-3 pb-1">
        <div className="rounded-[22px] border border-black/10 bg-white/95 shadow-[0_-8px_28px_rgba(0,0,0,0.08)] backdrop-blur-md">
          {suggestions.length > 0 ? (
            <div className="border-b border-black/5 px-3 pt-2.5 pb-2">
              <p className="mb-1.5 text-[10px] font-bold tracking-wide text-[#6B7280]">
                {messages.suggestionsLabel}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {suggestions.map((ticket) => {
                  const selected = boundQuestionId === ticket.id;
                  const isDiscovery = ticket.discoveryStatus === "pending";
                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      disabled={busy}
                      onClick={() => onBindQuestion(ticket.id)}
                      className={`max-w-[220px] shrink-0 rounded-2xl border px-3 py-2 text-left text-[11px] font-semibold leading-[1.35] active:scale-[0.98] disabled:opacity-50 ${
                        selected
                          ? "border-black bg-black text-white"
                          : isDiscovery
                            ? "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]"
                            : "border-black/10 bg-[#F8F4EF] text-[#1A1A1A]"
                      }`}
                    >
                      {isDiscovery ? (
                        <span className="mb-0.5 block text-[9px] font-bold opacity-80">
                          {messages.discoveryBadge}
                        </span>
                      ) : null}
                      <span className="line-clamp-2">{ticket.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {boundQuestionText ? (
            <div className="flex items-start gap-2 border-b border-black/5 px-3 py-2 text-[11px]">
              <p className="min-w-0 flex-1 font-semibold leading-[1.35] text-[#1A1A1A]">
                <span className="text-[#6B7280]">→ </span>
                {boundQuestionText}
              </p>
              <button
                type="button"
                onClick={onClearBound}
                disabled={busy}
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-[#6B7280]"
              >
                {messages.clearBound}
              </button>
            </div>
          ) : null}

          {(imagePreviewUrl || audioBlob || recording) && (
            <div className="flex flex-wrap items-center gap-2 border-b border-black/5 px-3 py-2">
              {imagePreviewUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                  <img
                    src={imagePreviewUrl}
                    alt=""
                    className="h-14 w-14 rounded-xl object-cover border border-black/10"
                  />
                  <button
                    type="button"
                    onClick={clearImage}
                    disabled={busy}
                    aria-label={messages.removeImage}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
              {recording || audioBlob ? (
                <div className="flex items-center gap-2 rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-1.5 text-[11px] font-bold text-[#1D4ED8]">
                  <span>
                    {recording
                      ? `${messages.recording} ${String(Math.floor(recordSeconds / 60)).padStart(2, "0")}:${String(recordSeconds % 60).padStart(2, "0")}`
                      : `♪ ${audioDurationSec}s`}
                  </span>
                  {!recording && audioBlob ? (
                    <button
                      type="button"
                      onClick={clearAudio}
                      disabled={busy}
                      className="text-[10px] font-bold text-[#6B7280]"
                    >
                      {messages.removeAudio}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex items-end gap-1.5 px-2 py-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                onPickImage(file);
              }}
            />
            <button
              type="button"
              disabled={busy || recording}
              onClick={() => fileInputRef.current?.click()}
              aria-label={messages.attachImage}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#4B5563] active:bg-black/5 disabled:opacity-40"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            {recording ? (
              <button
                type="button"
                onClick={stopRecording}
                aria-label={messages.stopRecording}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EF4444] text-white"
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || preflightBusy}
                onClick={() => void startRecording()}
                aria-label={messages.recording}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#2563EB] active:bg-[#EFF6FF] disabled:opacity-40"
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
            <label htmlFor={inputId} className="sr-only">
              {messages.placeholder}
            </label>
            <textarea
              ref={textAreaRef}
              id={inputId}
              value={text}
              disabled={busy}
              rows={1}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder={
                boundQuestionText ? messages.placeholderBound : messages.placeholder
              }
              className="max-h-28 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[14px] leading-[1.4] outline-none placeholder:text-[#9CA3AF] disabled:opacity-60"
            />
            <button
              type="button"
              disabled={!canSend}
              onClick={() => void handleSubmit()}
              aria-label={messages.send}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white disabled:opacity-35"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-black/5 px-3 py-1.5 text-[10px] text-[#6B7280]">
            <span>{messages.limitsHint}</span>
            {progressLabel ? (
              <span className="font-bold text-[#2563EB]">{progressLabel}</span>
            ) : null}
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy && !text && !imageFile && !audioBlob}
              className="ml-auto font-bold text-[#6B7280]"
            >
              {messages.cancel}
            </button>
            {lastSentText ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setText(lastSentText)}
                className="font-bold text-[#1A1A1A]"
              >
                {messages.reEdit}
              </button>
            ) : null}
          </div>

          {displayError ? (
            <div
              className="flex flex-col gap-1.5 border-t border-[#FECACA] bg-[#FEF2F2] px-3 py-2"
              role="alert"
            >
              <p className="text-[11px] font-semibold text-[#991B1B]">{displayError}</p>
              {error && errorActions && errorActions.length > 0 && errorActionLabels && onErrorAction ? (
                <AiErrorActionBar
                  actions={errorActions}
                  labels={errorActionLabels}
                  disabled={busy}
                  onAction={onErrorAction}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
    {permissionCopy && preflightOpen ? (
      <PermissionPreflight
        kind="audio"
        copy={permissionCopy}
        status={preflightStatus}
        busy={preflightBusy}
        onContinue={() => void onPreflightContinue()}
        onCancel={onPreflightCancel}
        onTextNote={onPreflightTextNote}
      />
    ) : null}
    </>
  );
}
