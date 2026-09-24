"use client";

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { SheetCloseButton } from "@/components/viewing-chat/shell/SheetCloseButton";

const DISMISS_PX = 72;

/**
 * Shared mobile bottom sheet: scrim + rounded top panel + safe-area.
 * Hidden from md and up (desktop uses IconRail / offset panels).
 */
export function MobileSheet({
  open,
  onClose,
  title,
  closeLabel,
  children,
  /** Near-full height for long lists (history, search, media). */
  tall = false,
  /** Optional node under the title (e.g. search field). */
  headerExtra,
  /** Accessible name when title is a custom node; defaults to string title. */
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  closeLabel: string;
  children: ReactNode;
  tall?: boolean;
  headerExtra?: ReactNode;
  ariaLabel?: string;
}) {
  const startY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const dragging = useRef(false);

  const resetDrag = useCallback(() => {
    startY.current = null;
    dragging.current = false;
    setDragY(0);
  }, []);

  const onTouchStart = (event: TouchEvent) => {
    startY.current = event.touches[0]?.clientY ?? null;
    dragging.current = true;
  };

  const onTouchMove = (event: TouchEvent) => {
    if (startY.current == null || !dragging.current) return;
    const y = event.touches[0]?.clientY ?? startY.current;
    const delta = Math.max(0, y - startY.current);
    setDragY(delta);
  };

  const onTouchEnd = () => {
    if (dragY >= DISMISS_PX) {
      resetDrag();
      onClose();
      return;
    }
    resetDrag();
  };

  if (!open) return null;

  const label =
    ariaLabel ?? (typeof title === "string" ? title : closeLabel);

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[24px] border border-black/8 bg-white shadow-2xl ${
          tall ? "h-[90svh] max-h-[90svh]" : "max-h-[85svh]"
        }`}
        style={{
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragY ? "none" : "transform 160ms ease-out",
        }}
      >
        <div
          className="flex shrink-0 touch-none flex-col pt-2"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={resetDrag}
        >
          <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-black/15" aria-hidden />
          <div className="flex items-center justify-between gap-2 px-3 pb-2">
            <div className="min-w-0 flex-1 text-[15px] font-bold text-[#1A1A1A]">
              {title}
            </div>
            <SheetCloseButton label={closeLabel} onClick={onClose} />
          </div>
          {headerExtra ? (
            <div className="border-b border-black/8 px-3 pb-3">{headerExtra}</div>
          ) : (
            <div className="border-b border-black/8" />
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
