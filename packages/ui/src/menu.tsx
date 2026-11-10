"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "./cn";

export type MenuEntry =
  | {
      type?: "item";
      id: string;
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      hint?: string;
      checked?: boolean;
      danger?: boolean;
      disabled?: boolean;
      onSelect?: () => void;
      /** A nested list, shown to the side. */
      items?: MenuEntry[];
    }
  | { type: "separator"; id: string }
  | { type: "label"; id: string; label: string };

/**
 * A floating menu: a list of actions with icons, shortcuts, checks and one
 * level of submenus. Arrow keys move, Enter or Space picks, Escape closes,
 * typing a letter jumps to the next item starting with it.
 */
export function MenuList({
  items,
  onClose,
  at,
  labelledBy,
  className,
  autoFocus = true,
}: {
  items: MenuEntry[];
  onClose: () => void;
  at: { x: number; y: number; align?: "start" | "end" };
  labelledBy?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [sub, setSub] = useState<{ id: string; y: number; x: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = at.align === "end" ? at.x - rect.width : at.x;
    let top = at.y;
    left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
    if (top + rect.height > window.innerHeight - 8)
      top = Math.max(8, window.innerHeight - rect.height - 8);
    setPos({ left, top });
  }, [at.x, at.y, at.align]);

  useEffect(() => {
    if (!autoFocus || !pos) return;
    ref.current
      ?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')
      ?.focus();
  }, [autoFocus, pos]);

  const focusables = () =>
    Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        ':scope > [role^="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = focusables();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (index + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      list[event.key === "Home" ? 0 : list.length - 1]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase();
      const start = index + 1;
      const order = [...list.slice(start), ...list.slice(0, start)];
      order.find((el) => el.textContent?.trim().toLowerCase().startsWith(letter))?.focus();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={cn(
        "fixed z-[70] min-w-[13rem] max-w-[20rem] rounded-[12px] border border-border bg-surface p-1 text-sm text-foreground shadow-[var(--shadow-md)] outline-none hhip-menu-pop",
        !pos && "invisible",
        className,
      )}
      style={pos ? { left: pos.left, top: pos.top } : { left: at.x, top: at.y }}
    >
      {items.map((entry) => {
        if (entry.type === "separator")
          return <div key={entry.id} role="separator" className="my-1 h-px bg-border" />;
        if (entry.type === "label")
          return (
            <div
              key={entry.id}
              className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
            >
              {entry.label}
            </div>
          );
        return (
          <MenuItemRow
            key={entry.id}
            entry={entry}
            sub={sub?.id === entry.id ? sub : null}
            setSub={setSub}
            onClose={onClose}
          />
        );
      })}
    </div>
  );
}

/** A button that opens a menu below it. */
export function Menu({
  label,
  items,
  children,
  align = "start",
  className,
  buttonClassName,
  title,
}: {
  label: string;
  items: MenuEntry[];
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  buttonClassName?: string;
  title?: string;
}) {
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = `menu-${useId().replace(/:/g, "")}`;

  const close = useCallback(() => {
    setOpen(null);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (buttonRef.current?.contains(target) || target.closest('[role="menu"]')) return;
      setOpen(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const show = () => {
    const r = buttonRef.current!.getBoundingClientRect();
    setOpen({ x: align === "end" ? r.right : r.left, y: r.bottom + 6 });
  };

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!open}
        aria-label={title ? undefined : label}
        title={title}
        onClick={() => (open ? setOpen(null) : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            show();
          }
        }}
        className={buttonClassName}
      >
        {children}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <MenuList items={items} onClose={close} at={{ ...open, align }} labelledBy={id} />,
            document.body,
          )
        : null}
    </div>
  );
}

/** A menu opened at the pointer, for right-clicks. */
export function ContextMenu({
  at,
  items,
  onClose,
}: {
  at: { x: number; y: number } | null;
  items: MenuEntry[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!at) return;
    const onDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('[role="menu"]')) return;
      onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("wheel", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("wheel", onScroll);
    };
  }, [at, onClose]);
  if (!at || typeof document === "undefined") return null;
  return createPortal(<MenuList items={items} onClose={onClose} at={at} />, document.body);
}

type MenuItemEntry = Exclude<MenuEntry, { type: "separator" } | { type: "label" }>;
type SubMenu = { id: string; x: number; y: number };

/** One action in a menu, with its submenu when it has one and it's open. */
function MenuItemRow({
  entry,
  sub,
  setSub,
  onClose,
}: {
  entry: MenuItemEntry;
  /** This item's submenu, when it's the open one. */
  sub: SubMenu | null;
  setSub: (sub: SubMenu | null) => void;
  onClose: () => void;
}) {
  const hasSub = !!entry.items?.length;
  const open = sub !== null;
  return (
    <div
      role={entry.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
      aria-checked={entry.checked}
      aria-disabled={entry.disabled || undefined}
      aria-haspopup={hasSub ? "menu" : undefined}
      aria-expanded={hasSub ? open : undefined}
      tabIndex={-1}
      onMouseEnter={(event) => {
        (event.currentTarget as HTMLElement).focus();
        if (hasSub) {
          const r = event.currentTarget.getBoundingClientRect();
          setSub({ id: entry.id, x: r.right - 4, y: r.top - 4 });
        } else setSub(null);
      }}
      onClick={(event) => {
        if (entry.disabled) return;
        if (hasSub) {
          const r = event.currentTarget.getBoundingClientRect();
          setSub(open ? null : { id: entry.id, x: r.right - 4, y: r.top - 4 });
          return;
        }
        entry.onSelect?.();
        onClose();
      }}
      onKeyDown={(event) => {
        if (entry.disabled) return;
        if (event.key === "Enter" || event.key === " " || (hasSub && event.key === "ArrowRight")) {
          event.preventDefault();
          if (hasSub) {
            const r = event.currentTarget.getBoundingClientRect();
            setSub({ id: entry.id, x: r.right - 4, y: r.top - 4 });
            return;
          }
          entry.onSelect?.();
          onClose();
        }
      }}
      className={cn(
        "flex cursor-default select-none items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 outline-none transition-colors focus:bg-muted-bg data-[open=true]:bg-muted-bg",
        entry.danger ? "text-danger" : "text-foreground",
        entry.disabled && "opacity-45",
      )}
      data-open={open || undefined}
    >
      <MenuItemContent entry={entry} />
      {hasSub ? <ChevronRight className="size-3.5 shrink-0 text-muted" aria-hidden /> : null}
      {hasSub && sub ? (
        <span
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "ArrowLeft" || event.key === "Escape") {
              event.preventDefault();
              setSub(null);
              (event.currentTarget.parentElement as HTMLElement | null)?.focus();
            }
          }}
          onMouseEnter={(event) => event.stopPropagation()}
        >
          <MenuList
            items={entry.items!}
            at={{ x: sub.x, y: sub.y }}
            onClose={() => {
              setSub(null);
              onClose();
            }}
          />
        </span>
      ) : null}
    </div>
  );
}

/** An item's check or icon, label, hint and shortcut. */
function MenuItemContent({ entry }: { entry: MenuItemEntry }) {
  return (
    <>
      <span
        className="flex size-4 shrink-0 items-center justify-center text-muted [&>svg]:size-4"
        aria-hidden
      >
        {entry.checked ? <Check className="text-primary" /> : entry.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{entry.label}</span>
        {entry.hint ? (
          <span className="block truncate text-[11px] leading-4 text-muted">{entry.hint}</span>
        ) : null}
      </span>
      {entry.shortcut ? (
        <kbd className="ml-3 shrink-0 font-mono text-[10px] text-muted">{entry.shortcut}</kbd>
      ) : null}
    </>
  );
}
