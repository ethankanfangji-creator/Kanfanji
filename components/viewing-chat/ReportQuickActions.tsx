"use client";

export function ReportQuickActions({
  items,
  disabled,
  onPick,
}: {
  items: string[];
  disabled?: boolean;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
      {items.map((label) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={() => onPick(label)}
          className="rounded-full bg-[#DBEAFE] px-3 py-1.5 text-[12px] font-semibold text-[#1E40AF] disabled:opacity-40"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
