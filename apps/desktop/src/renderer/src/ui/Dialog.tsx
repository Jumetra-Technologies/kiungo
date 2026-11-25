import { useEffect, useRef, type ReactNode } from "react";
import { CloseButton } from "@kiungo/ui/close-button";
import { cn } from "@kiungo/ui/cn";

/**
 * A modal on the native <dialog>: it keeps focus inside, closes on Escape and
 * hides the rest of the app from screen readers while open. A control marked
 * data-autofocus gets the focus when it opens.
 */
export function Dialog({ open, onClose, title, description, children, footer, className }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal focuses the first control (the close button); start where the dialog says to.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={cn("k-dialog m-auto w-[min(640px,calc(100vw-48px))] max-h-[calc(100vh-64px)] overflow-hidden rounded-[18px] border border-border bg-surface p-0 text-foreground shadow-[var(--shadow-md)]", className)}
      aria-labelledby="k-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className="flex max-h-[calc(100vh-64px)] flex-col">
          <header className="flex items-start gap-3 px-6 pb-2 pt-5">
            <div className="min-w-0 flex-1">
              <h2 id="k-dialog-title" className="text-lg font-semibold tracking-[-0.01em]">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
            </div>
            <CloseButton onClose={onClose} className="-mr-2" />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">{children}</div>
          {footer ? <footer className="flex items-center gap-2 border-t border-border px-6 py-3.5">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
