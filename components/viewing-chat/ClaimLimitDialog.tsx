"use client";

export function ClaimLimitDialog({
  title,
  body,
  upgradeLabel,
  manageLabel,
  laterLabel,
  onUpgrade,
  onManage,
  onLater,
}: {
  title: string;
  body: string;
  upgradeLabel: string;
  manageLabel: string;
  laterLabel: string;
  onUpgrade: () => void;
  onManage: () => void;
  onLater: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-limit-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <h2 id="claim-limit-title" className="text-[16px] font-bold">
          {title}
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-[#4B5563]">{body}</p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onUpgrade}
            className="w-full rounded-full bg-black px-3 py-2.5 text-[13px] font-bold text-white"
          >
            {upgradeLabel}
          </button>
          <button
            type="button"
            onClick={onManage}
            className="w-full rounded-full border border-black/10 px-3 py-2.5 text-[13px] font-bold"
          >
            {manageLabel}
          </button>
          <button
            type="button"
            onClick={onLater}
            className="w-full rounded-full px-3 py-2 text-[13px] font-semibold text-[#6B7280]"
          >
            {laterLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
