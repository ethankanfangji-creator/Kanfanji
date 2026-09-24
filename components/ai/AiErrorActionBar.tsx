"use client";

import type { AiUiAction } from "@/lib/ai-boundary/map-ai-error-ui";

export type AiErrorActionLabels = {
  retry: string;
  signIn: string;
  upgrade: string;
};

/**
 * Compact CTA row for AI failures (quota → sign-in / upgrade; 5xx → retry).
 */
export function AiErrorActionBar({
  actions,
  labels,
  disabled,
  onAction,
}: {
  actions: AiUiAction[];
  labels: AiErrorActionLabels;
  disabled?: boolean;
  onAction: (action: AiUiAction) => void;
}) {
  if (actions.length === 0) return null;

  const labelFor = (action: AiUiAction) => {
    if (action === "retry") return labels.retry;
    if (action === "sign_in") return labels.signIn;
    return labels.upgrade;
  };

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="AI error actions">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          disabled={disabled}
          onClick={() => onAction(action)}
          className={
            action === "retry"
              ? "rounded-full bg-[#FEE2E2] px-2.5 py-1 text-[11px] font-bold text-[#991B1B] disabled:opacity-40"
              : "rounded-full bg-[#1E3A8A] px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-40"
          }
        >
          {labelFor(action)}
        </button>
      ))}
    </div>
  );
}
