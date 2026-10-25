"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

/**
 * Accessible slide-in panel (focus trap, Escape to close, scroll lock, labelled) built on Radix Dialog.
 * Slides from the bottom on phones. Animation is CSS only and is switched off for reduced-motion users.
 */
export function Sheet({ trigger, title, description, children, triggerClassName }: { trigger: ReactNode; title: string; description?: string; children: ReactNode; triggerClassName?: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className={triggerClassName}>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-ink/50" />
        <Dialog.Content className="sheet-content fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-pop)] focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
            <Dialog.Close className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl leading-none hover:bg-canvas" aria-label="Close">×</Dialog.Close>
          </div>
          {description ? <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
