"use client";

export function GuestLimitDialog({
  title,
  body,
  signInLabel,
  cancelLabel,
  signInHref,
  onCancel,
  deleteLabel,
  onDelete,
}: {
  title: string;
  body: string;
  signInLabel: string;
  cancelLabel: string;
  signInHref: string;
  onCancel: () => void;
  deleteLabel?: string;
  onDelete?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <h2 className="text-[16px] font-bold">{title}</h2>
        <p className="mt-2 text-[13px] text-[#4B5563]">{body}</p>
        {deleteLabel && onDelete ? (
          <button type="button" onClick={onDelete} className="mt-4 w-full rounded-full border border-[#FECACA] px-3 py-2 text-[13px] font-bold text-[#991B1B]">
            {deleteLabel}
          </button>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-full border border-black/10 px-3 py-2 text-[13px] font-bold">
            {cancelLabel}
          </button>
          <a href={signInHref} className="flex-1 rounded-full bg-black px-3 py-2 text-center text-[13px] font-bold text-white">
            {signInLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
