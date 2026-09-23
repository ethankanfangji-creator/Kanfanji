"use client";

import type { StepUiStatus, WizardStep } from "@/lib/viewing-wizard/readiness";

type StepMeta = {
  step: WizardStep;
  label: string;
  status: StepUiStatus;
};

export type WizardStepperLabels = {
  navLabel: string;
  progress: string;
  statusActive: string;
  statusCompleted: string;
  statusError: string;
  statusEmpty: string;
};

const DEFAULT_STATUS: Record<StepUiStatus, string> = {
  active: "目前步驟",
  completed: "已完成",
  error: "需要處理",
  empty: "尚未開始",
};

export function WizardStepper({
  steps,
  onSelect,
  canEnter,
  labels,
  activeStep,
}: {
  steps: StepMeta[];
  onSelect: (step: WizardStep) => void;
  /** When provided, overrides default reachability (step 1 always, later steps after setup). */
  canEnter?: (step: WizardStep) => boolean;
  labels?: Partial<WizardStepperLabels>;
  activeStep?: WizardStep;
}) {
  const statusLabels: Record<StepUiStatus, string> = {
    active: labels?.statusActive ?? DEFAULT_STATUS.active,
    completed: labels?.statusCompleted ?? DEFAULT_STATUS.completed,
    error: labels?.statusError ?? DEFAULT_STATUS.error,
    empty: labels?.statusEmpty ?? DEFAULT_STATUS.empty,
  };
  const current =
    activeStep ?? steps.find((item) => item.status === "active")?.step ?? 1;
  const step1Complete = steps.some((s) => s.step === 1 && s.status === "completed");
  const progressText = (labels?.progress ?? "Step {current} / 3").replace(
    "{current}",
    String(current),
  );

  return (
    <nav
      aria-label={labels?.navLabel ?? "Viewing wizard"}
      className="sticky top-0 z-30 -mx-1 mb-4 rounded-2xl border border-black/5 bg-[var(--color-canvas,#FDF6F0)]/95 px-1 py-2 backdrop-blur-md"
    >
      <p className="mb-2 px-1 text-[11px] font-bold tracking-wide text-[#6B7280]">
        {progressText}
      </p>
      <ol className="flex items-stretch gap-1.5">
        {steps.map((item) => {
          const clickable = canEnter
            ? canEnter(item.step)
            : item.step === 1 ||
              item.status === "active" ||
              item.status === "completed" ||
              (step1Complete && item.step <= 2) ||
              (step1Complete &&
                steps.some((s) => s.step === 2 && s.status === "completed") &&
                item.step === 3);
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
                  {statusLabels[item.status]}
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
