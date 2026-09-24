"use client";

import {
  QuickActionChip,
  QuickActionRow,
} from "@/components/viewing-chat/QuickActionChip";

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

/** Collection / coach quick intents — shared chip language with CollectionQuickActions. */
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
      <QuickActionRow>
        {actions.map((action) => (
          <QuickActionChip
            key={action.id}
            disabled={disabled}
            accent={action.id === "finish"}
            onClick={() => onAction?.(action.id)}
          >
            {action.label}
          </QuickActionChip>
        ))}
      </QuickActionRow>
    );
  }

  return (
    <QuickActionRow>
      {(items ?? []).map((label) => (
        <QuickActionChip
          key={label}
          disabled={disabled}
          onClick={() => onPick?.(label)}
        >
          {label}
        </QuickActionChip>
      ))}
    </QuickActionRow>
  );
}
