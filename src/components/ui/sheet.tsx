"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

type Side = "bottom" | "left" | "top";

const SIDE: Record<Side, string> = {
  // Phones: slides up from the bottom; from 768px it becomes a right-hand panel (see globals.css).
  bottom: "sheet-content fixed inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[var(--radius-xl)] pb-[calc(1.25rem+var(--safe-bottom))]",
  left: "drawer-left fixed inset-y-0 left-0 w-[min(88vw,22rem)] rounded-r-[var(--radius-xl)] pb-[calc(1.25rem+var(--safe-bottom))]",
  top: "drop-panel fixed inset-x-0 top-0 max-h-[88dvh] rounded-b-[var(--radius-xl)] pt-[calc(1.25rem+var(--safe-top))]",
};

/**
 * Accessible overlay (focus trap, Escape to close, scroll lock, labelled) built on Radix Dialog: the "Liquid Glass Reveal".
 * The panel is a frosted-glass surface with an opaque-enough fill for text contrast. Motion is CSS transform/opacity only
 * and is switched off for reduced-motion users.
 */
export function Sheet({
  trigger, title, description, children, triggerClassName, side = "bottom", open, onOpenChange, hideTitle, triggerLabel,
}: {
  trigger?: ReactNode; title: string; description?: string; children: ReactNode; triggerClassName?: string;
  side?: Side; open?: boolean; onOpenChange?: (o: boolean) => void; hideTitle?: boolean; triggerLabel?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger !== undefined && <Dialog.Trigger className={triggerClassName} aria-label={triggerLabel}>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-ink/55" style={{ WebkitBackdropFilter: "blur(2px)", backdropFilter: "blur(2px)" }} />
        <Dialog.Content className={`${SIDE[side]} glass-panel z-50 overflow-y-auto overscroll-contain p-5 focus:outline-none`}>
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className={hideTitle ? "sr-only" : "text-lg font-bold"}>{title}</Dialog.Title>
            <Dialog.Close className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl leading-none hover:bg-canvas" aria-label="Close">×</Dialog.Close>
          </div>
          {description ? <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
