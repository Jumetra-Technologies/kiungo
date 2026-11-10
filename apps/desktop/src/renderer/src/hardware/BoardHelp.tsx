import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type { PortHint } from "@kiungo/api";
import { invoke } from "../ipc";
import { Dialog } from "../ui/Dialog";

/** "My board isn't listed": what this computer can tell, and the steps to try (FIX-09). */
export function BoardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="My board isn't listed"
      description="Kiungo looks for boards on USB all the time. If yours doesn't appear, try these in order."
      footer={
        <button type="button" onClick={onClose} className="ml-auto h-9 rounded-[10px] bg-primary px-4 text-[13.5px] font-medium text-primary-foreground hover:opacity-90" data-autofocus>
          Done
        </button>
      }
    >
      <Hints />
    </Dialog>
  );
}

/** Mounted each time the dialog opens, so the checks run fresh. */
function Hints() {
  const [hints, setHints] = useState<PortHint[] | null>(null);
  useEffect(() => {
    let live = true;
    void invoke("boards:doctor")
      .then((h) => live && setHints(h))
      .catch(() => live && setHints([]));
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="space-y-4 pb-2" data-testid="board-help">
      {hints === null ? (
        <p className="flex items-center gap-2 text-[13.5px] text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Checking this computer…
        </p>
      ) : hints.length === 0 ? (
        <p className="text-[13.5px] text-muted">Nothing looks wrong on this computer. Unplug the board, plug it back in, and give it a few seconds.</p>
      ) : (
        hints.map((hint) => (
          <section key={hint.id} data-testid={`hint-${hint.id}`}>
            <h3 className="text-[14px] font-semibold">{hint.title}</h3>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13.5px] leading-[1.5] text-foreground">
              {hint.steps.map((step) => (
                <li key={step}>{step.includes(": sudo ") ? <StepWithCommand step={step} /> : step}</li>
              ))}
            </ol>
            {hint.links?.map((link) => (
              <button key={link.url} type="button" onClick={() => void invoke("boards:open-link", link.url)} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
                {link.label}
                <ExternalLink className="size-3.5" aria-hidden />
              </button>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

/** A step with a terminal command: the command on its own line, easy to copy. */
function StepWithCommand({ step }: { step: string }) {
  const at = step.indexOf(": sudo ");
  return (
    <>
      {step.slice(0, at + 1)}
      <code className="mt-1 block select-all rounded-[8px] bg-muted-bg px-2 py-1 font-mono text-[12.5px]">{step.slice(at + 2)}</code>
    </>
  );
}
