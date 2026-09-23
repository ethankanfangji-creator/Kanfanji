"use client";

export type CollectionActionId =
  | "supplement"
  | "correct"
  | "skip"
  | "summarize"
  | "finish";

export type CollectionActionItem = {
  id: CollectionActionId;
  label: string;
};

/** Reuses the existing ReportQuickActions chip style for collection intents. */
export function ReportQuickActions({
  items,
  disabled,
  onPick,
  actions,
  onAction,
}: {
  /** Legacy string chips (listing / coach prompts) */
  items?: string[];
  disabled?: boolean;
  onPick?: (prompt: string) => void;
  /** Typed collection actions */
  actions?: CollectionActionItem[];
  onAction?: (id: CollectionActionId) => void;
}) {
  if (actions?.length) {
    return (
      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            onClick={() => onAction?.(action.id)}
            className="rounded-full bg-[#DBEAFE] px-3 py-1.5 text-[12px] font-semibold text-[#1E40AF] disabled:opacity-40"
          >
            {action.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
      {(items ?? []).map((label) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={() => onPick?.(label)}
          className="rounded-full bg-[#DBEAFE] px-3 py-1.5 text-[12px] font-semibold text-[#1E40AF] disabled:opacity-40"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
