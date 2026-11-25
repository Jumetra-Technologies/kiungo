import { useEffect, useId, useState } from "react";
import { Check, FolderOpen, Loader2 } from "lucide-react";
import type { OpenedProject, ProjectSettings } from "@kiungo/api";
import { PROJECT_BOARDS, STARTERS } from "@kiungo/core/project";
import { Button } from "@kiungo/ui/button";
import { cn } from "@kiungo/ui/cn";
import { invoke } from "../ipc";
import { Dialog } from "../ui/Dialog";

const BLANK = { id: null, title: "Blank", does: "Just the board and an empty sketch." } as const;

/** New project (DSK-11): a name, the board, and blank or a starter. */
export function NewProjectDialog({ open, onClose, onCreated, initialStarter = null }: { open: boolean; onClose: () => void; onCreated: (project: OpenedProject) => void; initialStarter?: string | null }) {
  const nameId = useId();
  const [name, setName] = useState("");
  const [board, setBoard] = useState(PROJECT_BOARDS[0].part);
  const [starter, setStarter] = useState<string | null>(initialStarter);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void invoke("projects:settings").then(setSettings);
  }, [open]);

  const chosenStarter = starter ? STARTERS.find((s) => s.id === starter) : null;
  const placeholder = chosenStarter?.title ?? "My project";

  const changeFolder = async () => setSettings(await invoke("projects:choose-folder"));

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await invoke("projects:create", { name: name.trim() || placeholder, board, starter });
      if (result.ok) {
        setName("");
        onCreated(result.project);
      } else setError(result.message);
    } catch {
      setError("Couldn't make the project. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="New project"
      footer={
        <>
          <p className="mr-auto flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted" title={settings?.projectsFolder}>
            <FolderOpen className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Saved in {settings ? settings.projectsFolder : "…"}</span>
            <button type="button" onClick={changeFolder} className="shrink-0 font-medium text-primary hover:underline">
              Change
            </button>
          </p>
          <Button variant="ghost" onClick={onClose} disabled={busy} className="shrink-0">
            Cancel
          </Button>
          <Button onClick={create} disabled={busy} className="shrink-0 whitespace-nowrap" data-testid="create-project">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Create project
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className="flex flex-col gap-5 pb-2"
      >
        <div>
          <label htmlFor={nameId} className="text-[13px] font-medium">
            Name
          </label>
          <input
            id={nameId}
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            maxLength={120}
            className="mt-1.5 h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[14px] outline-none placeholder:text-muted focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_22%,transparent)]"
          />
        </div>

        <fieldset>
          <legend className="text-[13px] font-medium">Board</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {PROJECT_BOARDS.map((b) => (
              <label key={b.part} className={cn("flex cursor-pointer items-center gap-2.5 rounded-[12px] border px-3 py-2.5 text-[13.5px] transition-colors", board === b.part ? "border-primary bg-accent" : "border-border hover:border-primary/50")}>
                <input type="radio" name="board" value={b.part} checked={board === b.part} onChange={() => {
                    setBoard(b.part);
                    // A starter that can't be built for this board falls back to blank.
                    if (STARTERS.find((x) => x.id === starter)?.notOn?.[b.part]) setStarter(null);
                  }} className="accent-[var(--primary)]" />
                <span className="font-medium">{b.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">A Uno project also uploads to an Arduino Nano.</p>
        </fieldset>

        <fieldset>
          <legend className="text-[13px] font-medium">Start from</legend>
          <ul className="mt-1.5 overflow-hidden rounded-[12px] border border-border" role="radiogroup" aria-label="Start from">
            {[BLANK, ...STARTERS].map((s) => {
              const checked = starter === s.id;
              const notHere = "notOn" in s ? s.notOn?.[board] : undefined;
              return (
                <li key={s.id ?? "blank"} className="border-b border-border last:border-0">
                  <label className={cn("flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors has-[:focus-visible]:shadow-[inset_0_0_0_2px_var(--ring)]", checked ? "bg-accent" : "hover:bg-muted-bg", notHere && "cursor-not-allowed opacity-60 hover:bg-transparent")}>
                    <input type="radio" name="starter" checked={checked} disabled={Boolean(notHere)} onChange={() => setStarter(s.id)} className="sr-only" data-testid={`starter-${s.id ?? "blank"}`} />
                    <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", checked ? "border-primary bg-primary text-primary-foreground" : "border-border")} aria-hidden>
                      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium">{s.title}</span>
                      <span className="block text-[12.5px] leading-5 text-muted">{notHere ?? s.does}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        {error ? (
          <p role="alert" className="rounded-[10px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
