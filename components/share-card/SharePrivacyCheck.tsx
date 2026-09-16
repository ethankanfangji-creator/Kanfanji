"use client";

import { ShieldAlert } from "lucide-react";

export type SharePrivacyCheckLabels = {
  title: string;
  body: string;
  address: string;
  photos: string;
  personal: string;
  confirm: string;
  cancel: string;
};

type Props = {
  open: boolean;
  labels: SharePrivacyCheckLabels;
  onConfirm: () => void;
  onCancel: () => void;
};

export function SharePrivacyCheck({ open, labels, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-privacy-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[420px] rounded-[24px] bg-white border border-black/5 shadow-[0_20px_50px_rgba(0,0,0,0.2)] p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#FEF3C7] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-[#92400E]" />
          </div>
          <div>
            <h3 id="share-privacy-title" className="text-[15px] font-bold">
              {labels.title}
            </h3>
            <p className="mt-1.5 text-[12px] leading-[1.5] text-[#4B5563]">{labels.body}</p>
          </div>
        </div>
        <ul className="mt-4 space-y-2 text-[12px] text-[#1A1A1A]">
          <li className="rounded-xl bg-[#FAF7F3] border border-black/5 px-3 py-2">{labels.address}</li>
          <li className="rounded-xl bg-[#FAF7F3] border border-black/5 px-3 py-2">{labels.photos}</li>
          <li className="rounded-xl bg-[#FAF7F3] border border-black/5 px-3 py-2">{labels.personal}</li>
        </ul>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-11 rounded-full border border-black/10 text-[13px] font-bold text-[#6B7280]"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 h-11 rounded-full bg-black text-white text-[13px] font-bold"
          >
            {labels.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
