"use client";

import { Camera, FileAudio, Mic, Send, Square, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { selectSupportedAudioMimeType } from "@/components/media/useMediaCapture";
import {
  createBrowserMediaPermissionAdapter,
} from "@/lib/media-permissions";

export type ChatComposerLabels = {
  placeholder: string;
  send: string;
  recording: string;
  stop: string;
  photo: string;
  importAudio: string;
  empty: string;
  micDenied: string;
};

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
  }) => void | Promise<void>;
}) {
  const inputId = useId();
  const filePhotoRef = useRef<HTMLInputElement>(null);
  const fileAudioRef = useRef<HTMLInputElement>(null);
  const media = useRef(createBrowserMediaPermissionAdapter()).current;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function startRecording() {
    setError(null);
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

  async function handleSend() {
    if (busy || recording) return;
    if (!text.trim() && !audioBlob && !image) {
      setError(labels.empty);
      return;
    }
    setError(null);
    await onSubmit({ text: text.trim(), audio: audioBlob, image });
    setText("");
    setAudioBlob(null);
    setImage(null);
  }

  return (
    <div className="border-t border-black/8 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
      {(audioBlob || image || recording) && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#1D4ED8]">
          {recording ? <span>{labels.recording}…</span> : null}
          {audioBlob ? (
            <span className="rounded-full bg-[#EFF6FF] px-2 py-1">
              ♪ audio
              <button
                type="button"
                className="ml-1"
                onClick={() => setAudioBlob(null)}
                aria-label="remove audio"
              >
                <X className="inline h-3 w-3" />
              </button>
            </span>
          ) : null}
          {image ? (
            <span className="rounded-full bg-[#EFF6FF] px-2 py-1">
              🖼 {image.name.slice(0, 18)}
              <button
                type="button"
                className="ml-1"
                onClick={() => setImage(null)}
                aria-label="remove image"
              >
                <X className="inline h-3 w-3" />
              </button>
            </span>
          ) : null}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <input
          ref={filePhotoRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            setImage(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
        <input
          ref={fileAudioRef}
          type="file"
          accept="audio/*,.m4a,.mp3,.wav,.webm"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) setAudioBlob(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy || recording}
          aria-label={labels.photo}
          onClick={() => filePhotoRef.current?.click()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#4B5563] active:bg-black/5 disabled:opacity-40"
        >
          <Camera className="h-5 w-5" />
        </button>
        <button
          type="button"
          disabled={busy || recording}
          aria-label={labels.importAudio}
          onClick={() => fileAudioRef.current?.click()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#4B5563] active:bg-black/5 disabled:opacity-40"
        >
          <FileAudio className="h-5 w-5" />
        </button>
        {recording ? (
          <button
            type="button"
            aria-label={labels.stop}
            onClick={stopRecording}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EF4444] text-white shadow-md"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            aria-label={labels.recording}
            onClick={() => void startRecording()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-md active:scale-[0.98] disabled:opacity-40"
          >
            <Mic className="h-5 w-5" />
          </button>
        )}
        <label htmlFor={inputId} className="sr-only">
          {labels.placeholder}
        </label>
        <textarea
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
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-black/10 bg-[#FAF6F1] px-3 py-2.5 text-[14px] outline-none placeholder:text-[#9CA3AF] disabled:opacity-60"
        />
        <button
          type="button"
          disabled={busy || recording}
          aria-label={labels.send}
          onClick={() => void handleSend()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-white disabled:opacity-35"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 text-[11px] font-semibold text-[#991B1B]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
