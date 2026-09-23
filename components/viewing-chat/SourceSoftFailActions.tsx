"use client";

export function SourceSoftFailActions({
  labels,
  disabled,
  onPasteText,
  onUploadScreenshot,
}: {
  labels: {
    pasteText: string;
    uploadScreenshot: string;
  };
  disabled?: boolean;
  onPasteText: () => void;
  onUploadScreenshot: () => void;
}) {
  const btn =
    "rounded-full border border-[#F59E0B]/40 bg-[#FFFBEB] px-3 py-1.5 text-[12px] font-semibold text-[#92400E] disabled:opacity-40";
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <button type="button" className={btn} disabled={disabled} onClick={onPasteText}>
        {labels.pasteText}
      </button>
      <button
        type="button"
        className={btn}
        disabled={disabled}
        onClick={onUploadScreenshot}
      >
        {labels.uploadScreenshot}
      </button>
    </div>
  );
}
