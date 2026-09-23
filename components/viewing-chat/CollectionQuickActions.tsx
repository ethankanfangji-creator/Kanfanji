"use client";

export function CollectionQuickActions({
  labels,
  disabled,
  onPasteUrl,
  onUploadPhoto,
  onUploadScreenshot,
  onUploadHoaDoc,
  onPasteText,
  onSkip,
}: {
  labels: {
    pasteUrl: string;
    uploadPhoto: string;
    uploadScreenshot: string;
    uploadHoaDoc: string;
    pasteText: string;
    skip: string;
  };
  disabled?: boolean;
  onPasteUrl: () => void;
  onUploadPhoto: () => void;
  onUploadScreenshot: () => void;
  onUploadHoaDoc: () => void;
  onPasteText: () => void;
  onSkip: () => void;
}) {
  const btn =
    "rounded-full border border-black/10 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1F2937] disabled:opacity-40";
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
      <button type="button" className={btn} disabled={disabled} onClick={onPasteUrl}>
        {labels.pasteUrl}
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={onUploadPhoto}>
        {labels.uploadPhoto}
      </button>
      <button
        type="button"
        className={btn}
        disabled={disabled}
        onClick={onUploadScreenshot}
      >
        {labels.uploadScreenshot}
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={onUploadHoaDoc}>
        {labels.uploadHoaDoc}
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={onPasteText}>
        {labels.pasteText}
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={onSkip}>
        {labels.skip}
      </button>
    </div>
  );
}
