export function CompareSelectionBar({
  selectedText,
  openText,
  disabled,
  onOpen,
}: {
  selectedText: string;
  openText: string;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-20 flex items-center justify-between gap-2 border-t border-black/8 bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <p className="text-[12px] font-bold text-[#6B7280]">{selectedText}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-full bg-black px-4 text-[13px] font-bold text-white disabled:opacity-40"
      >
        {openText}
      </button>
    </div>
  );
}
