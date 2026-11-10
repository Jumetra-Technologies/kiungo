import { Book, Cpu, FlaskConical, Plus, Sparkles, Users } from "lucide-react";
import type { AuthState, RecentProject, Role } from "@kiungo/api";
import { Button } from "@kiungo/ui/button";
import { openedAgo } from "../ipc";
import { CircuitThumbnail } from "../home/CircuitThumbnail";
import { FocusPanel, Metric } from "../shell/widgets";
import type { View } from "../shell/types";

export function Dashboard({
  auth,
  roles,
  recent,
  onView,
  onNewProject,
  onOpenRecent,
}: {
  auth: AuthState | null;
  roles: Role[];
  recent: RecentProject[] | null;
  onView: (view: View) => void;
  onNewProject: () => void;
  onOpenRecent: (project: RecentProject) => void;
}) {
  const visibleRoles = roles;
  const name = auth?.status === "signed-in" ? auth.user.name.split(" ")[0] : null;
  const projects = (recent ?? []).filter((p) => !p.missing).slice(0, 3);
  const attention = (recent ?? []).filter((p) => !p.missing).length;

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{name ? `Good to see you, ${name}` : "Good to see you"}</h1>
          <p className="mt-1 text-sm text-muted">{attention ? `Your engineering environment is ready. ${attention} project${attention === 1 ? "" : "s"} on this computer.` : "Start a project to see it here."}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onView("simulation")}>
            Open the lab
          </Button>
          <Button onClick={onNewProject}>
            <Plus className="size-4" aria-hidden />
            New project
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Projects on this computer" value={String((recent ?? []).filter((p) => !p.missing).length)} detail="Open any time from Projects" />
        <Metric label="Roles active" value={String(roles.length)} detail={roles.length ? "Shaping your nav and dashboard" : "Add one in Settings"} tone="info" />
        <Metric label="Simulation" value="Ready" detail="3D, 2D, and trace views" tone="warn" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent projects</h2>
            <button type="button" onClick={() => onView("projects")} className="text-[11px] font-medium text-primary hover:underline">
              View all projects
            </button>
          </div>
          {projects.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {projects.map((project) => (
                <button key={project.path} type="button" onClick={() => onOpenRecent(project)} className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface text-left transition-colors hover:border-primary/60">
                  <CircuitThumbnail thumbnail={project.thumbnail} className="aspect-[16/10] w-full border-b border-border" />
                  <span className="block px-3.5 pb-3 pt-2.5">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{project.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {project.boardName} · {openedAgo(project.openedAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[14px] border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-sm text-muted">No projects yet.</p>
              <Button className="mt-3" onClick={onNewProject}>
                <Plus className="size-4" aria-hidden />
                New project
              </Button>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleRoles.includes("researcher") || visibleRoles.includes("university") ? (
              <FocusPanel title="Research focus" icon={<FlaskConical className="size-4" aria-hidden />} items={["Active experiments live in Research", "Datasets and lab notes stay with the project", "Open Research from the sidebar"]} />
            ) : null}
            {visibleRoles.includes("embedded-engineer") || visibleRoles.includes("electrical-engineer") || visibleRoles.includes("hobbyist") ? (
              <FocusPanel title="Engineering focus" icon={<Cpu className="size-4" aria-hidden />} items={["Firmware builds in the project workspace", "Hardware profiles live in Components", "Open Firmware from the sidebar"]} />
            ) : null}
            {visibleRoles.includes("student") ? (
              <FocusPanel title="Continue learning" icon={<Book className="size-4" aria-hidden />} items={["Role-aware lessons live in Learning", "Tied to the simulation and firmware tools", "Open Learning from the sidebar"]} />
            ) : null}
            {visibleRoles.includes("stem-trainer") || visibleRoles.includes("university") ? (
              <FocusPanel title="Teaching focus" icon={<Users className="size-4" aria-hidden />} items={["Classes and cohorts live in Collaboration", "Share a project with a learner's workspace", "Open Collaboration from the sidebar"]} />
            ) : null}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[14px] border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--primary)_14%,var(--surface))] text-primary">
                <Sparkles className="size-4" aria-hidden />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-foreground">AI Assistant</h3>
                <p className="text-[10px] text-muted">Context-aware across your projects</p>
              </div>
            </div>
            <p className="text-[11.5px] leading-relaxed text-muted">Ask about firmware, circuits, parts, or where to find something in Kiungo. It reads the project you have open.</p>
            <Button size="sm" className="mt-3 w-full" onClick={() => onView("assistant")}>
              Open the assistant
            </Button>
          </div>
          <div className="rounded-[14px] border border-border bg-surface p-4">
            <h3 className="mb-1 text-xs font-semibold text-foreground">Quick actions</h3>
            {[
              ["monitor", "Start simulation", "simulation"],
              ["cpu", "Open firmware", "firmware"],
              ["flask", "Open research", "research"],
              ["store", "Open marketplace", "marketplace"],
            ].map(([, label, target]) => (
              <button key={label} type="button" onClick={() => onView(target as View)} className="flex w-full items-center justify-between border-t border-border py-2.5 text-left text-[11.5px] text-muted first:border-0 hover:text-primary">
                {label}
                <span aria-hidden>→</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
