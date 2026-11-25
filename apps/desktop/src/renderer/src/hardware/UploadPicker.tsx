import { ChevronDown, Usb } from "lucide-react";
import type { BoardsState } from "@kiungo/api";
import { hardwareBoard, type HardwareBoard, type HardwareBoardId } from "@kiungo/core/hardware/boards";
import { identifyBoard, type DetectedBoard } from "@kiungo/core/hardware/usb";
import { Menu, type MenuEntry } from "@kiungo/ui/menu";
import { cn } from "@kiungo/ui/cn";

export interface UploadTarget {
  port: string;
  board: HardwareBoardId;
}

/** The board to suggest for what's plugged in: the most likely one this project can upload to. */
export function suggestTarget(detected: DetectedBoard, targets: HardwareBoard[]): HardwareBoardId | null {
  const identity = identifyBoard(detected);
  const likely = identity.likely.find((id) => targets.some((t) => t.id === id));
  return likely ?? targets[0]?.id ?? null;
}

/** "Upload to": the plugged-in board, and which board it is when USB can't tell (HW-01). */
export function UploadPicker({ boards, targets, value, onChange, onHelp }: { boards: BoardsState | null; targets: HardwareBoard[]; value: UploadTarget | null; onChange: (t: UploadTarget) => void; onHelp: () => void }) {
  const list = boards?.boards ?? [];
  const plugged = value ? list.find((b) => b.port === value.port) : undefined;
  const items: MenuEntry[] = [];
  if (list.length) items.push({ type: "label", id: "plugged", label: "Plugged in" });
  for (const b of list) {
    const identity = identifyBoard(b);
    const suggested = suggestTarget(b, targets);
    const name = `${identity.name} · ${b.port}`;
    if (identity.certain && targets.length && identity.likely.length === 1 && targets.some((t) => t.id === identity.likely[0])) {
      items.push({
        id: b.port,
        label: name,
        checked: value?.port === b.port,
        onSelect: () => onChange({ port: b.port, board: identity.likely[0] }),
      });
    } else {
      items.push({
        id: b.port,
        label: name,
        hint: identity.certain ? undefined : "Which board is it?",
        checked: value?.port === b.port,
        items: targets.map((t) => ({
          id: `${b.port}:${t.id}`,
          label: t.name,
          hint: t.id === suggested && !identity.certain ? "Likely" : undefined,
          checked: value?.port === b.port && value.board === t.id,
          onSelect: () => onChange({ port: b.port, board: t.id }),
        })),
      });
    }
  }
  if (!list.length)
    items.push({
      id: "none",
      label: boards?.message ?? "No board plugged in",
      disabled: true,
    });
  items.push({ type: "separator", id: "sep" }, { id: "help", label: "My board isn't listed…", onSelect: onHelp });

  const label = value && plugged ? `${hardwareBoard(value.board)?.name ?? value.board} · ${value.port}` : value ? `${value.port} (unplugged)` : list.length ? "Choose a board" : "No board";
  return (
    <Menu label="Upload to" items={items} buttonClassName={cn("inline-flex h-8 min-w-0 max-w-[200px] items-center gap-1.5 rounded-[8px] px-2 text-[12.5px] hover:bg-muted-bg", value && plugged ? "text-foreground" : "text-muted")} title="Upload to">
      <Usb className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate" data-testid="upload-target">
        {label}
      </span>
      <ChevronDown className="size-3.5 shrink-0" aria-hidden />
    </Menu>
  );
}
