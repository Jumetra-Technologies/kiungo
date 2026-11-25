import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@kiungo/ui/button";

/** Simulation and Firmware act on one open project; this is what they show until one is. */
export function NoProjectOpen({ what, onNew, onProjects }: { what: string; onNew: () => void; onProjects: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <p className="max-w-sm text-sm text-muted">Open or start a project to {what}.</p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onProjects}>
          <FolderOpen className="size-4" aria-hidden />
          Go to Projects
        </Button>
        <Button onClick={onNew}>
          <Plus className="size-4" aria-hidden />
          New project
        </Button>
      </div>
    </div>
  );
}
