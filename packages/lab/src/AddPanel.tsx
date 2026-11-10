"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ChevronDown, CornerDownLeft, FolderKanban, Plus, Search, Sparkles, Wand2, X } from "lucide-react";
import { PartThumb } from "./views/PartThumb";
import { getPartsByGroup } from "@kiungo/core/parts";
import { fitFor, suggest, type ProjectContext, type Suggestion } from "@kiungo/core/lab/suggest";
import { cn } from "@kiungo/ui/cn";
import { useLabContext } from "./lab-context";

export const TEMPLATES: Array<{ id: string; title: string; blurb: string; board: string; parts: string[] }> = [
  { id: "blink", title: "Blink an LED", blurb: "Uno + LED on D13", board: "arduino-uno", parts: ["led"] },
  { id: "climate", title: "Temperature display", blurb: "ESP32 + DHT22 + OLED", board: "esp32", parts: ["dht22", "oled-ssd1306"] },
  { id: "alarm", title: "Motion alarm", blurb: "Uno + PIR + buzzer", board: "arduino-uno", parts: ["pir", "buzzer"] },
  { id: "radar", title: "Distance radar", blurb: "Uno + HC-SR04 + servo", board: "arduino-uno", parts: ["hc-sr04", "servo"] },
];

export interface AddPanelHandle {
  focusSearch: () => void;
}

interface Props {
  project: (ProjectContext & { id: string }) | null;
  autowire: boolean;
  onAutowire: (value: boolean) => void;
  onTemplate: (id: string) => void;
  /** Omitted: "Link a project" isn't offered. */
  onLinkProject?: () => void;
}

function Row({ item, active, onAdd, onHover, index }: { item: Suggestion; active: boolean; onAdd: () => void; onHover: () => void; index: number }) {
  return (
    <li
      id={`lab-add-${item.part.id}`}
      role="option"
      aria-selected={active}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/hhip-part", item.part.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onMouseEnter={onHover}
      onDoubleClick={onAdd}
      className={cn("group flex cursor-grab items-center gap-3 rounded-[10px] px-2 py-2 transition-colors active:cursor-grabbing", active ? "bg-accent" : "hover:bg-muted-bg")}
      data-testid="lab-add-row"
      data-index={index}
    >
      <PartThumb model={item.part} className="size-11 shrink-0 p-1" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-5 text-foreground">{item.part.name}</p>
        <p className="line-clamp-2 text-[11.5px] leading-4 text-muted">{item.reason}</p>
        {item.fit ? (
          <p className={cn("mt-1 inline-flex max-w-full items-center gap-1 truncate rounded-full px-1.5 py-px text-[10.5px] font-medium", item.fit.tone === "ok" ? "bg-success/10 text-success" : "bg-warning/15 text-warning")}>{item.fit.text}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add ${item.part.name}`}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-[9px] border transition-all",
          active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-surface text-foreground hover:border-primary hover:text-primary",
        )}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </li>
  );
}

export const AddPanel = forwardRef<AddPanelHandle, Props>(function AddPanel({ project, autowire, onAutowire, onTemplate, onLinkProject }, ref) {
  const { session, addPart } = useLabContext();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useImperativeHandle(ref, () => ({ focusSearch: () => input.current?.focus() }), []);

  const { items, didYouMean } = useMemo(() => suggest(query, session.nodes, project, query ? 12 : 8), [query, session.nodes, project]);
  const groups = useMemo(() => getPartsByGroup(), []);
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));

  const add = (partId: string) => {
    addPart(partId, { autowire });
  };

  const move = (delta: number) => {
    if (!items.length) return;
    const next = (activeIndex + delta + items.length) % items.length;
    setActive(next);
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const hasBoard = session.nodes.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="Add components">
      <div className="shrink-0 space-y-2.5 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                move(-1);
              } else if (e.key === "Enter" && items[activeIndex]) {
                e.preventDefault();
                add(items[activeIndex].part.id);
              } else if (e.key === "Escape") {
                setQuery("");
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="lab-add-list"
            aria-activedescendant={items[activeIndex] ? `lab-add-${items[activeIndex].part.id}` : undefined}
            aria-label="Search components"
            placeholder="Search parts: led, temperature, i2c…"
            className="h-10 w-full rounded-[10px] border border-border bg-canvas pl-9 pr-16 text-sm outline-none transition-shadow placeholder:text-muted focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_18%,transparent)]"
            data-testid="lab-search"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-muted-bg hover:text-foreground">
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1.5 font-mono text-[10px] text-muted">/</kbd>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <button
              type="button"
              role="switch"
              aria-checked={autowire}
              onClick={() => onAutowire(!autowire)}
              className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors", autowire ? "border-primary bg-primary" : "border-border bg-muted-bg")}
            >
              <span className={cn("size-3.5 rounded-full bg-white shadow-sm transition-transform", autowire ? "translate-x-[18px]" : "translate-x-0.5")} />
            </button>
            <span className="inline-flex items-center gap-1">
              <Wand2 className="size-3.5 text-muted" aria-hidden /> Auto-wire to board
            </span>
          </label>
          {project ? (
            <span className="inline-flex max-w-[9rem] items-center gap-1 truncate rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary" title={`Suggestions use “${project.name}”`}>
              <FolderKanban className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{project.name}</span>
            </span>
          ) : onLinkProject ? (
            <button type="button" onClick={onLinkProject} className="text-[11px] font-medium text-primary hover:underline">
              Link a project
            </button>
          ) : null}
        </div>
      </div>

      <div className="hhip-scroll min-h-0 flex-1 overflow-y-auto p-2">
        <p className="flex items-center gap-1.5 px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {query ? (
            didYouMean ? (
              items.length ? (
                <>No exact match. Did you mean</>
              ) : (
                <>No parts match “{query}”</>
              )
            ) : (
              <>
                {items.length} result{items.length === 1 ? "" : "s"}
              </>
            )
          ) : (
            <>
              <Sparkles className="size-3.5 text-primary" aria-hidden /> Suggested for {project ? "this project" : hasBoard ? "this build" : "a first build"}
            </>
          )}
        </p>
        <ul ref={listRef} id="lab-add-list" role="listbox" aria-label={query ? "Search results" : "Suggested parts"} className="space-y-0.5">
          {items.map((item, i) => (
            <Row key={item.part.id} item={item} index={i} active={i === activeIndex} onHover={() => setActive(i)} onAdd={() => add(item.part.id)} />
          ))}
        </ul>
        {query && items.length ? (
          <p className="mt-2 flex items-center gap-1.5 px-2 text-[11px] text-muted">
            <CornerDownLeft className="size-3" aria-hidden /> Enter adds the highlighted part · drag onto the canvas to place it
          </p>
        ) : null}

        {!query ? (
          <>
            <p className="px-2 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Starter builds</p>
            <div className="grid grid-cols-2 gap-1.5 px-1">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => onTemplate(t.id)} className="rounded-[10px] border border-border bg-surface px-2.5 py-2 text-left transition-colors hover:border-primary hover:bg-accent" data-testid={`template-${t.id}`}>
                  <span className="block text-[12px] font-semibold text-foreground">{t.title}</span>
                  <span className="block text-[10.5px] leading-4 text-muted">{t.blurb}</span>
                </button>
              ))}
            </div>

            <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">All parts</p>
            {groups.map(({ group, parts }) => {
              const isOpen = open[group.id] ?? group.id === "boards";
              return (
                <div key={group.id} className="border-b border-border/60 last:border-0">
                  <button type="button" onClick={() => setOpen((o) => ({ ...o, [group.id]: !isOpen }))} aria-expanded={isOpen} className="flex w-full items-center justify-between rounded-[8px] px-2 py-2 text-left text-[13px] font-medium text-foreground hover:bg-muted-bg">
                    <span>
                      {group.title} <span className="text-muted">· {parts.length}</span>
                    </span>
                    <ChevronDown className={cn("size-4 text-muted transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                  {isOpen ? (
                    <ul className="space-y-0.5 pb-2">
                      {parts.map((part, i) => (
                        <Row key={part.id} index={1000 + i} item={{ part, reason: part.summary.split(". ")[0], source: "search", fit: fitFor(part.id, session.nodes) }} active={false} onHover={() => undefined} onAdd={() => add(part.id)} />
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </>
        ) : null}
      </div>
    </div>
  );
});
