import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ImportCandidate, OpenResult } from "@kiungo/api";
import { Button } from "@kiungo/ui/button";
import { invoke, openedAgo } from "../ipc";
import { Dialog } from "../ui/Dialog";

/** The lab sessions and projects on the person's website account, each one click from a desktop project (DSK-15). */
export function ImportDialog({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: (result: OpenResult) => void }) {
  const [list, setList] = useState<{ items: ImportCandidate[] } | { message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Shown fresh each time it opens (the caller mounts it then), so the list loads once.
  useEffect(() => {
    void invoke("import:account-list").then((r) => setList(r.ok ? { items: r.items } : { message: r.message }), () => setList({ message: "Your account couldn't be read." }));
  }, []);

  const take = async (item: ImportCandidate) => {
    setBusy(`${item.kind}:${item.id}`);
    setError(null);
    const result = await invoke("import:account", item.kind, item.id).catch(() => ({ ok: false as const, message: "That couldn't be imported." }));
    setBusy(null);
    if (!result.ok) setError(result.message);
    else onOpened(result);
  };

  const sessions = list && "items" in list ? list.items.filter((i) => i.kind === "lab-session") : [];
  const projects = list && "items" in list ? list.items.filter((i) => i.kind === "phase-one-project") : [];

  return (
    <Dialog open={open} onClose={onClose} title="Import from the website" description="Your lab sessions and projects from the Kiungo website. Each becomes a new project on this computer; the website keeps its copy." footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="px-6 pb-4" data-testid="import-dialog">
        {error ? (
          <p role="alert" className="mb-3 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
        {list === null ? (
          <p className="flex items-center gap-2 py-6 text-[13px] text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Reading your account…
          </p>
        ) : "message" in list ? (
          <p className="py-6 text-[13px] text-muted">{list.message}</p>
        ) : !list.items.length ? (
          <p className="py-6 text-[13px] text-muted">There&apos;s nothing on your account to import yet. Lab sessions you save on the website show up here.</p>
        ) : (
          <>
            {[
              { title: "Lab sessions", items: sessions },
              { title: "Projects", items: projects },
            ]
              .filter((g) => g.items.length)
              .map((g) => (
                <section key={g.title} className="mb-4" aria-label={g.title}>
                  <h3 className="mb-1.5 text-[12.5px] font-semibold text-muted">{g.title}</h3>
                  <ul className="divide-y divide-border rounded-[12px] border border-border">
                    {g.items.map((item) => (
                      <li key={`${item.kind}:${item.id}`} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">{item.name}</span>
                          <span className="block text-[12px] text-muted">
                            {item.detail}
                            {item.updatedAt ? ` · changed ${openedAgo(item.updatedAt)}` : ""}
                            {item.copies.length ? ` · imported before` : ""}
                          </span>
                        </span>
                        <Button size="sm" variant={item.copies.length ? "secondary" : "default"} disabled={busy !== null} onClick={() => void take(item)} data-testid="import-item">
                          {busy === `${item.kind}:${item.id}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                          {item.copies.length ? "Import again" : "Import"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </>
        )}
      </div>
    </Dialog>
  );
}
