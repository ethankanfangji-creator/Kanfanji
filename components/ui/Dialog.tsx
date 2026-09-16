"use client";

import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type RefObject,
  type ReactNode,
} from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className = "",
  backdropClassName = "",
  closeOnBackdrop = true,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = description ? `${generatedId}-description` : undefined;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const initial =
      initialFocusRef?.current ?? dialog?.querySelector<HTMLElement>(FOCUSABLE) ?? dialog;
    initial?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.getAttribute("aria-hidden") !== "true",
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [initialFocusRef, onClose, open]);

  if (!open) return null;

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (closeOnBackdrop && event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className={`fixed inset-0 z-[70] flex justify-center bg-black/45 p-4 ${backdropClassName}`}
      onMouseDown={handleBackdrop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`w-full max-w-[420px] my-auto rounded-[24px] bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] ${className}`}
      >
        <h2 id={titleId} className="text-[17px] font-bold leading-snug">
          {title}
        </h2>
        {description ? (
          <div id={descriptionId} className="mt-2 text-[13px] leading-[1.5] text-[#4B5563]">
            {description}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
