"use client";

export function GuestLimitDialog({
  title,
  body,
  signInLabel,
  cancelLabel,
  signInHref,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  signInLabel: string;
  cancelLabel: string;
  signInHref?: string;
  onCancel: () => void;
  onConfirm?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <h2 className="text-[16px] font-bold">{title}</h2>
        <p className="mt-2 text-[13px] text-[#4B5563]">{body}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-full border border-black/10 px-3 py-2 text-[13px] font-bold">
            {cancelLabel}
          </button>
          {onConfirm ? (
            <button type="button" onClick={onConfirm} className="flex-1 rounded-full bg-black px-3 py-2 text-[13px] font-bold text-white">
              {signInLabel}
            </button>
          ) : (
            <a href={signInHref ?? "/login"} className="flex-1 rounded-full bg-black px-3 py-2 text-center text-[13px] font-bold text-white">
              {signInLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
