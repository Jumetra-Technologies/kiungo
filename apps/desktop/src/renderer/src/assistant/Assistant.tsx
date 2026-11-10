import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@kiungo/ui/button";
import { PageTitle } from "../shell/widgets";
import type { View } from "../shell/types";

export function Assistant({ onView }: { onView: (view: View) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="mx-auto flex max-w-[980px] flex-col p-6" data-testid="assistant">
      <PageTitle title="Kiungo AI Assistant" detail="Context-aware help across firmware, simulation, research, and the marketplace." />
      <div className="rounded-[16px] border border-border bg-surface p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-[12px] bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Project-aware assistant</div>
            <div className="text-[10.5px] text-muted">Reads whichever project you have open</div>
          </div>
        </div>
        <div className="max-w-2xl rounded-[14px] bg-muted-bg p-4 text-xs leading-relaxed text-foreground">
          This is a preview of the assistant panel — it isn&apos;t wired to a model yet, so it can&apos;t answer questions about your project. It will reply here once that connection is in place.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["Review power analysis", "projects"],
            ["Open the circuit", "simulation"],
            ["Find a part", "components"],
            ["Start an experiment", "research"],
          ].map(([label, target]) => (
            <button key={label} type="button" onClick={() => onView(target as View)} className="rounded-[10px] border border-border px-3 py-2 text-[11px] text-foreground hover:border-primary/50">
              {label}
            </button>
          ))}
        </div>
        <div className="mt-8 flex items-center gap-2 rounded-[14px] border border-border bg-muted-bg p-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about code, circuits, or documentation…"
            className="flex-1 bg-transparent px-2 text-xs placeholder:text-muted"
            disabled
          />
          <Button size="sm" disabled>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
