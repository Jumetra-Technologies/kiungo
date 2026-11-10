import { shortcut } from "../ipc";

export function Footer() {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-sidebar-border bg-sidebar px-4 text-[9px] text-sidebar-muted">
      <span className="text-success">● Kiungo 2.0</span>
      <span className="ml-auto">{shortcut("K")} · Commands</span>
    </footer>
  );
}
