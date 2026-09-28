"use client";

import { useState } from "react";

export function ShareReportDialog({
  open,
  labels,
  url,
  needsRegenerate,
  error,
  onClose,
  onCreate,
  onCopy,
  onRevoke,
  onRegenerate,
}: {
  open: boolean;
  labels: {
    title: string;
    body: string;
    point1: string;
    point2: string;
    point3: string;
    acknowledge: string;
    create: string;
    revoke: string;
    regenerate: string;
    copy: string;
    copyFailed: string;
    unavailable: string;
    needsRegenerate: string;
    close: string;
  };
  url: string | null;
  needsRegenerate: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: () => void;
  onCopy: () => Promise<boolean>;
  onRevoke: () => void;
  onRegenerate: () => void;
}) {
  const [ack, setAck] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <h2 className="text-[16px] font-bold">{labels.title}</h2>
        <p className="mt-2 text-[13px] text-[#4B5563]">{labels.body}</p>
        <ul className="mt-2 list-disc pl-5 text-[12px] text-[#4B5563]">
          <li>{labels.point1}</li>
          <li>{labels.point2}</li>
          <li>{labels.point3}</li>
        </ul>
        {url ? (
          <p className="mt-3 break-all text-[12px]">{url}</p>
        ) : needsRegenerate ? (
          <p className="mt-3 text-[12px]">{labels.needsRegenerate}</p>
        ) : null}
        {error ? <p className="mt-2 text-[12px] text-[#991B1B]">{error}</p> : null}
        {copyNote ? <p className="mt-2 text-[12px]">{copyNote}</p> : null}
        {!url ? (
          <label className="mt-3 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
            {labels.acknowledge}
          </label>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="rounded-full border px-3 py-2 text-[12px] font-bold" onClick={onClose}>
          {labels.close}
        </button>
          {!url ? (
            <button
              type="button"
              disabled={!ack}
              className="rounded-full bg-black px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40"
              onClick={onCreate}
            >
              {labels.create}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="rounded-full bg-black px-3 py-2 text-[12px] font-bold text-white"
                onClick={() => {
                  void onCopy().then((ok) => setCopyNote(ok ? null : labels.copyFailed));
                }}
              >
                {labels.copy}
              </button>
              <button type="button" className="rounded-full border px-3 py-2 text-[12px] font-bold" onClick={onRevoke}>
                {labels.revoke}
              </button>
              <button type="button" className="rounded-full border px-3 py-2 text-[12px] font-bold" onClick={onRegenerate}>
                {labels.regenerate}
              </button>
            </>
          )}
        </div>
        {error === labels.unavailable ? null : null}
      </div>
    </div>
  );
}
