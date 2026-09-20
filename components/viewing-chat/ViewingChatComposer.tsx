"use client";

import {
  Camera,
  FileUp,
  ImagePlus,
  Mic,
  Plus,
  Send,
  Square,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { selectSupportedAudioMimeType } from "@/components/media/useMediaCapture";
import { createBrowserMediaPermissionAdapter } from "@/lib/media-permissions";

export type ChatComposerLabels = {
  placeholder: string;
  send: string;
  recording: string;
  stop: string;
  attach: string;
  camera: string;
  uploadImage: string;
  uploadFile: string;
  empty: string;
  micDenied: string;
};

const TEXTAREA_MAX_PX = 168;
/** One line of text (15px / leading 22) + vertical padding */
const SINGLE_LINE_PX = 36;

export function ViewingChatComposer({
  labels,
  busy,
  onSubmit,
}: {
  labels: ChatComposerLabels;
  busy?: boolean;
  onSubmit: (payload: {
    text: string;
    audio: Blob | null;
    image: File | null;
    file: File | null;
  }) => void | Promise<void>;
}) {
  const inputId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachWrapRef = useRef<HTMLDivElement>(null);
  const media = useRef(createBrowserMediaPermissionAdapter()).current;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [multiline, setMultiline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const raw = el.scrollHeight;
    el.style.height = `${Math.min(Math.max(raw, SINGLE_LINE_PX), TEXTAREA_MAX_PX)}px`;
    const nextMulti = raw > SINGLE_LINE_PX + 4;
    setMultiline((prev) => (prev === nextMulti ? prev : nextMulti));
  }

  useEffect(() => {
    resizeTextarea();
  }, [text, multiline]);

  useEffect(() => {
    return () => {
      media.release(streamRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [media]);

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

  async function startRecording() {
    setError(null);
    setAttachOpen(false);
    if (busy || recording) return;
    const requested = await media.request("microphone", { audio: true, video: false });
    if (!requested.ok) {
      setError(labels.micDenied);
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
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];
      media.release(streamRef.current);
      streamRef.current = null;
      setRecording(false);
      setAudioBlob(blob);
    };
    setRecording(true);
    setAudioBlob(null);
    recorder.start(250);
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  function applyPickedFile(picked: File | null | undefined) {
    if (!picked) return;
    if (picked.type.startsWith("image/")) {
      setImage(picked);
      setFile(null);
      return;
    }
    if (picked.type.startsWith("audio/")) {
      setAudioBlob(picked);
      setFile(null);
      return;
    }
    setFile(picked);
    setImage(null);
  }

  async function handleSend() {
    if (busy || recording) return;
    if (!text.trim() && !audioBlob && !image && !file) {
      setError(labels.empty);
      return;
    }
    setError(null);
    setAttachOpen(false);
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
    requestAnimationFrame(resizeTextarea);
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
        className={`flex h-9 w-9 items-center justify-center rounded-full text-[#6B7280] transition active:bg-black/5 disabled:opacity-40 ${
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
            onClick={() => cameraRef.current?.click()}
            icon={<Camera className="h-4 w-4" />}
          />
          <AttachItem
            label={labels.uploadImage}
            onClick={() => imageRef.current?.click()}
            icon={<ImagePlus className="h-4 w-4" />}
          />
          <AttachItem
            label={labels.uploadFile}
            onClick={() => fileRef.current?.click()}
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EF4444] text-white"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          aria-label={labels.recording}
          onClick={() => void startRecording()}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#4B5563] active:bg-black/5 disabled:opacity-40"
        >
          <Mic className="h-5 w-5" />
        </button>
      )}
      <button
        type="button"
        disabled={busy || recording || !canSend}
        aria-label={labels.send}
        onClick={() => void handleSend()}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#111] text-white disabled:bg-transparent disabled:text-[#D1D5DB]"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="bg-transparent px-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-1.5">
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
        onChange={(event) => {
          applyPickedFile(event.target.files?.[0]);
          event.target.value = "";
          setAttachOpen(false);
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
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
        accept="image/*,audio/*,.pdf,.doc,.docx,.txt,.m4a,.mp3,.wav,.webm"
        className="hidden"
        onChange={(event) => {
          applyPickedFile(event.target.files?.[0]);
          event.target.value = "";
          setAttachOpen(false);
        }}
      />

      <div
        className={
          multiline
            ? "flex flex-col gap-1 rounded-[22px] bg-[#F3F4F6] px-2 pb-1 pt-2"
            : "flex items-center gap-0.5 rounded-[24px] bg-[#F3F4F6] px-1 py-1"
        }
      >
        <label htmlFor={inputId} className="sr-only">
          {labels.placeholder}
        </label>
        {!multiline ? attachButton : null}
        <textarea
          ref={textareaRef}
          id={inputId}
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

      {error ? (
        <p className="mt-1 px-1 text-[11px] font-medium text-[#991B1B]" role="alert">
          {error}
        </p>
      ) : null}
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
