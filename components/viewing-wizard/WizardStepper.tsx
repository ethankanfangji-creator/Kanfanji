"use client";

import type { StepUiStatus, WizardStep } from "@/lib/viewing-wizard/readiness";

type StepMeta = {
  step: WizardStep;
  label: string;
  status: StepUiStatus;
};

const STATUS_LABELS: Record<StepUiStatus, string> = {
  active: "目前步驟",
  completed: "已完成",
  error: "需要處理",
  empty: "尚未開始",
};

export function WizardStepper({
  steps,
  onSelect,
}: {
  steps: StepMeta[];
  onSelect: (step: WizardStep) => void;
}) {
  const setupReady = steps.some(
    (s) => s.step === 1 && (s.status === "completed" || s.status === "active" || s.status === "error"),
  );
  return (
    <nav aria-label="Viewing wizard" className="mb-4">
      <ol className="flex items-stretch gap-1.5">
        {steps.map((item) => {
          const clickable = item.step === 1 || setupReady || item.status !== "empty";
          return (
            <li key={item.step} className="flex-1 min-w-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onSelect(item.step)}
                aria-current={item.status === "active" ? "step" : undefined}
                className={`w-full min-h-[52px] rounded-2xl border px-2 py-2 text-left transition active:scale-[0.98] disabled:opacity-50 ${toneClass(item.status)}`}
              >
                <p className="text-[10px] font-bold tracking-widest opacity-70">
                  STEP {item.step}
                </p>
                <p className="text-[12px] font-bold leading-[1.25] mt-0.5 line-clamp-2">
                  {item.label}
                </p>
                <span className="mt-1 block text-[10px] font-medium opacity-80">
                  {STATUS_LABELS[item.status]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function toneClass(status: StepUiStatus): string {
  switch (status) {
    case "active":
      return "bg-[#111] text-white border-[#111]";
    case "completed":
      return "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]";
    case "error":
      return "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]";
    default:
      return "bg-white text-[#9CA3AF] border-black/10";
  }
}

export function WizardBottomNav({
  backLabel,
  nextLabel,
  onBack,
  onNext,
  nextDisabled,
  nextPrimary,
}: {
  backLabel?: string;
  nextLabel: string;
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextPrimary?: boolean;
}) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 flex justify-center pointer-events-none overflow-x-hidden">
      <div className="box-border w-full max-w-[min(420px,100%)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 pointer-events-auto bg-gradient-to-t from-[#FDF6F0] via-[#FDF6F0]/95 to-transparent">
        <div className="flex min-w-0 gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="h-12 min-w-0 flex-1 rounded-full bg-white border border-black/10 text-[14px] font-bold active:scale-[0.98]"
            >
              {backLabel ?? "Back"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className={`h-12 min-w-0 flex-[1.4] rounded-full text-[14px] font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-45 ${
              nextPrimary !== false
                ? "bg-black text-white"
                : "bg-white border border-black/10 text-[#1A1A1A]"
            }`}
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
