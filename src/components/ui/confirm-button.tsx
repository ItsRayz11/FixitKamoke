"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useRef, type ReactNode } from "react";

/**
 * A button that asks "are you sure?" in an accessible dialog before running a server action.
 * Use it for anything destructive. Cancel is focused first so Enter never confirms by accident.
 */
export function ConfirmButton({
  action, fields, children, title, description, confirmLabel = "Yes, continue", className, danger = true,
}: {
  action: (fd: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  children: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  className?: string;
  danger?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <AlertDialog.Root>
        <AlertDialog.Trigger type="button" className={className}>{children}</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-ink/50" />
          <AlertDialog.Content className="dialog-content fixed left-1/2 top-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] bg-surface p-6 shadow-[var(--shadow-pop)] focus:outline-none">
            <AlertDialog.Title className="text-lg font-bold">{title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted">{description}</AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-3">
              <AlertDialog.Cancel className="min-h-11 rounded-[var(--radius-sm)] border border-line px-5 text-sm font-semibold hover:bg-canvas">Cancel</AlertDialog.Cancel>
              <AlertDialog.Action
                type="button"
                onClick={() => form.current?.requestSubmit()}
                className={`min-h-11 rounded-[var(--radius-sm)] px-5 text-sm font-semibold text-white ${danger ? "bg-danger" : "bg-accent"}`}
              >
                {confirmLabel}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </form>
  );
}
