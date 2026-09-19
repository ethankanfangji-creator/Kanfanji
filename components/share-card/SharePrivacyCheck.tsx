"use client";

import { ShieldAlert } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";

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
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FEF3C7]">
            <ShieldAlert className="h-5 w-5 text-[#92400E]" aria-hidden="true" />
          </span>
          {labels.title}
        </span>
      }
      description={labels.body}
      backdropClassName="items-end sm:items-center"
    >
        <ul className="mt-4 space-y-2 text-[12px] text-[#1A1A1A]">
          <li className="rounded-xl bg-[#FAF7F3] border border-black/5 px-3 py-2">{labels.address}</li>
          <li className="rounded-xl bg-[#FAF7F3] border border-black/5 px-3 py-2">{labels.photos}</li>
          <li className="rounded-xl bg-[#FAF7F3] border border-black/5 px-3 py-2">{labels.personal}</li>
        </ul>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-11 rounded-full border border-black/10 text-[13px] font-bold text-[#6B7280]"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 min-h-11 rounded-full bg-black text-white text-[13px] font-bold"
          >
            {labels.confirm}
          </button>
        </div>
    </Dialog>
  );
}
