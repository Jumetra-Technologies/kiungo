import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@kiungo/ui/cn";

export interface Command {
  id: string;
  title: string;
  /** Shown under the title: a path, a board. */
  detail?: string;
  /** Extra words that should find it ("parts" finds Search parts). */
  keywords?: string;
  group: string;
  icon?: ReactNode;
  shortcut?: string;
  run: () => void;
}

/** Ranks a command for a query: every word must appear; earlier and title matches rank higher. */
export function scoreCommand(command: Pick<Command, "title" | "detail" | "keywords" | "group">, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const title = command.title.toLowerCase();
  const rest = `${command.detail ?? ""} ${command.keywords ?? ""} ${command.group}`.toLowerCase();
  let score = 0;
  for (const word of words) {
    const inTitle = title.indexOf(word);
    if (inTitle === 0) score += 4;
    else if (inTitle > 0) score += title[inTitle - 1] === " " ? 3 : 2;
    else if (rest.includes(word)) score += 1;
    else return 0;
  }
  return score;
}

/** The command palette (DSK-82): Ctrl+K, or ⌘K on macOS. */
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery("");
      setActive(0);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const results = useMemo(
    () =>
      commands
        .map((command, order) => ({ command, order, score: scoreCommand(command, query) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => (query ? b.score - a.score : 0) || a.order - b.order)
        .slice(0, 40)
        .map((r) => r.command),
    [commands, query],
  );
  const current = Math.min(active, Math.max(0, results.length - 1));

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    // Let the palette close before the command opens its own dialog or moves focus.
    window.setTimeout(command.run, 0);
  };

  return (
    <dialog
      ref={ref}
      className="k-dialog mx-auto mt-[12vh] w-[min(600px,calc(100vw-48px))] overflow-hidden rounded-[16px] border border-border bg-surface p-0 text-foreground shadow-[var(--shadow-md)]"
      aria-label="Search and commands"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open ? (
        <div>
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  run(results[current]);
                }
              }}
              placeholder="Type a command or a project name"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[current] ? `cmd-${results[current].id}` : undefined}
              aria-label="Search commands"
              className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted focus-visible:shadow-[inset_0_-2px_0_var(--primary)]"
              data-testid="palette-input"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Commands" className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-[13.5px] text-muted">Nothing matches “{query}”.</li>
            ) : (
              results.map((command, i) => {
                const showGroup = i === 0 || results[i - 1].group !== command.group;
                return (
                  <li key={command.id} role="presentation">
                    {showGroup && !query ? <p className="px-3 pb-1 pt-2.5 text-[11.5px] font-medium text-muted">{command.group}</p> : null}
                    <div
                      id={`cmd-${command.id}`}
                      role="option"
                      aria-selected={i === current}
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(command)}
                      className={cn("flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2", i === current ? "bg-accent text-foreground" : "text-foreground")}
                    >
                      {command.icon ? <span className="flex size-4 shrink-0 items-center justify-center text-muted [&_svg]:size-4">{command.icon}</span> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px]">{command.title}</span>
                        {command.detail ? <span className="block truncate text-[12px] text-muted">{command.detail}</span> : null}
                      </span>
                      {command.shortcut ? <kbd className="shrink-0 font-sans text-[12px] text-muted">{command.shortcut}</kbd> : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </dialog>
  );
}
