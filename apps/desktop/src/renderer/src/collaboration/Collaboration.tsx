import { PageTitle } from "../shell/widgets";

const WORKSPACES = [
  { title: "Engineering team", members: "8 members", detail: "3 active projects" },
  { title: "Research group", members: "12 members", detail: "4 shared experiments" },
  { title: "Robotics cohort", members: "48 learners", detail: "7 assignments" },
];

/** Projects, research, classes, and product teams, sharing one controlled workspace. */
export function Collaboration() {
  return (
    <div className="mx-auto max-w-[1180px] p-6" data-testid="collaboration">
      <PageTitle title="Collaboration" detail="Projects, research, classes, and product teams share one controlled engineering workspace." action="Invite member" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WORKSPACES.map((w) => (
          <article key={w.title} className="rounded-[14px] border border-border bg-surface p-5">
            <div className="mb-4 flex -space-x-2">
              {[1, 2, 3, 4].map((x) => (
                <div key={x} className="grid size-8 place-items-center rounded-full border-2 border-surface bg-muted-bg text-[9px] font-semibold text-muted">
                  U{x}
                </div>
              ))}
            </div>
            <h3 className="text-sm font-semibold text-foreground">{w.title}</h3>
            <p className="mt-1 text-[11px] text-muted">
              {w.members} · {w.detail}
            </p>
            <button type="button" className="mt-4 rounded-[10px] border border-border px-3 py-2 text-[11px] text-foreground hover:bg-muted-bg">
              Open workspace
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
