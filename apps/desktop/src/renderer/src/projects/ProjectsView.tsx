import { useState } from "react";
import { CloudDownload, FileUp, FolderOpen, Globe, Import, Loader2, MoreHorizontal } from "lucide-react";
import type { RecentProject, RemoteProject } from "@kiungo/api";
import { STARTERS } from "@kiungo/core/project";
import { Button } from "@kiungo/ui/button";
import { Menu } from "@kiungo/ui/menu";
import { CircuitThumbnail } from "../home/CircuitThumbnail";
import { openedAgo } from "../ipc";
import { PageTitle } from "../shell/widgets";

const FIRST_STARTERS = ["blink", "distance", "servo", "motion-alarm"];
const FILTERS = ["All", "Recent", "Missing"] as const;

interface ProjectsViewProps {
  recent: RecentProject[] | null;
  error: string | null;
  onNew: (starter?: string | null) => void;
  onOpenFolder: () => void;
  onOpen: (project: RecentProject) => void;
  onReveal: (project: RecentProject) => void;
  onForget: (project: RecentProject) => void;
  onImportFile: () => void;
  onImportAccount?: () => void;
  sync?: { enabled: boolean; onToggle: (enabled: boolean) => void; remote: RemoteProject[] | null; message: string | null; onDownload: (p: RemoteProject) => void; downloading: string | null };
}

/** The Projects module: every project on this computer (and, synced, on the account), one project lifecycle. */
export function ProjectsView({ recent, error, onNew, onOpenFolder, onOpen, onReveal, onForget, onImportFile, onImportAccount, sync }: ProjectsViewProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const empty = recent !== null && recent.length === 0;
  const shown = (recent ?? []).filter((p) => (filter === "Missing" ? p.missing : filter === "Recent" ? !p.missing : true));

  return (
    <div className="mx-auto max-w-[1280px] p-6" data-testid="projects-view">
      <PageTitle title="Projects" detail="Design, simulate, build and document hardware systems in one project lifecycle." action="New project" onAction={() => onNew()} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((x) => (
          <button key={x} type="button" onClick={() => setFilter(x)} className={`rounded-[10px] px-3 py-2 text-xs ${filter === x ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-foreground hover:bg-muted-bg"}`}>
            {x}
          </button>
        ))}
        <Button variant="secondary" size="sm" onClick={onOpenFolder} className="ml-auto">
          <FolderOpen className="size-4" aria-hidden />
          Open folder
        </Button>
        <Menu
          label="Import"
          align="end"
          buttonClassName="inline-flex h-8 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-muted-bg"
          items={[
            { id: "file", label: "A lab session file…", hint: ".kiungo.json", icon: <FileUp />, onSelect: onImportFile },
            ...(onImportAccount ? [{ id: "account", label: "From the Kiungo website…", hint: "Your lab sessions and projects", icon: <Globe />, onSelect: onImportAccount }] : []),
          ]}
        >
          <Import className="size-4" aria-hidden />
          Import
        </Menu>
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-[12px] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-4 py-3 text-[13.5px] text-danger">
          {error}
        </p>
      ) : null}

      {recent === null ? null : empty ? (
        <section className="max-w-[640px]" aria-label="Start your first project">
          <p className="text-[15px] leading-7 text-muted">Projects you make or open show up here. Start with a ready-made circuit and its code, or a board on its own.</p>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {FIRST_STARTERS.map((id) => {
              const starter = STARTERS.find((s) => s.id === id)!;
              return (
                <button key={id} type="button" onClick={() => onNew(id)} className="flex flex-col items-start justify-start rounded-[14px] border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-primary" data-testid={`first-${id}`}>
                  <span className="block text-[14px] font-semibold text-foreground">{starter.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-5 text-muted">{starter.does}</span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => onNew(null)} className="mt-3 text-[13.5px] font-medium text-primary hover:underline">
            Start with a blank project
          </button>
        </section>
      ) : shown.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">No projects in this filter.</div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4" aria-label="Projects">
          {shown.map((p) => (
            <ProjectCard key={p.path} project={p} onOpen={() => onOpen(p)} onReveal={() => onReveal(p)} onForget={() => onForget(p)} />
          ))}
        </ul>
      )}

      {sync ? <AccountProjects {...sync} /> : null}
    </div>
  );
}

function ProjectCard({ project, onOpen, onReveal, onForget }: { project: RecentProject; onOpen: () => void; onReveal: () => void; onForget: () => void }) {
  const folder = project.path.split(/[\\/]/).filter(Boolean).pop() ?? project.path;
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        disabled={project.missing}
        className="flex w-full flex-col overflow-hidden rounded-[16px] border border-border bg-surface text-left transition-colors hover:border-primary/60 disabled:cursor-default disabled:hover:border-border"
        title={project.path}
        data-testid="project-card"
      >
        <CircuitThumbnail thumbnail={project.thumbnail} className="aspect-[16/10] w-full border-b border-border" />
        <span className="block px-4 pb-3.5 pt-3">
          <span className="block truncate pr-7 text-[14.5px] font-semibold text-foreground">{project.missing ? folder : project.name}</span>
          {project.missing ? (
            <span className="mt-0.5 block text-[12.5px] text-danger">Moved or deleted</span>
          ) : (
            <>
              <span className="mt-0.5 block truncate text-[12.5px] text-muted">{project.boardName}</span>
              <span className="block text-[12.5px] text-muted">Opened {openedAgo(project.openedAt)}</span>
            </>
          )}
        </span>
      </button>
      <div className="absolute bottom-3 right-2.5">
        <Menu
          label={`More for ${project.name ?? folder}`}
          align="end"
          buttonClassName="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-foreground"
          items={[
            ...(!project.missing ? [{ id: "reveal", label: "Show in folder", onSelect: onReveal }] : []),
            { id: "forget", label: "Remove from this list", hint: "The folder stays", onSelect: onForget },
          ]}
        >
          <MoreHorizontal className="size-4" />
        </Menu>
      </div>
    </li>
  );
}

function AccountProjects({ enabled, onToggle, remote, message, onDownload, downloading }: NonNullable<ProjectsViewProps["sync"]>) {
  return (
    <section className="mt-10 max-w-[760px]" aria-labelledby="account-projects">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="account-projects" className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
          On your account
        </h2>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="size-4 accent-[var(--primary)]" data-testid="sync-toggle" />
          Keep a copy of my projects on my account
        </label>
      </div>
      <p className="mt-1 text-[13px] leading-5 text-muted">
        {enabled
          ? "Projects sync about 30 seconds after you stop editing, and when you close them, so they open on your other computers. Your folders stay the working copy."
          : "Turn this on to back up your projects and open them on another computer. Projects only ever live on this computer until you do."}
      </p>
      {enabled ? (
        remote === null ? (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Looking for projects from your other computers…
          </p>
        ) : message ? (
          <p className="mt-3 text-[13px] text-muted">{message}</p>
        ) : remote.length ? (
          <ul className="mt-3 divide-y divide-border rounded-[12px] border border-border bg-surface" data-testid="remote-projects">
            {remote.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-foreground">{p.name}</span>
                  <span className="block text-[12px] text-muted">{p.updatedAt ? `Changed ${openedAgo(p.updatedAt)}` : "On your account"}</span>
                </span>
                <Button size="sm" variant="secondary" disabled={downloading !== null} onClick={() => onDownload(p)}>
                  {downloading === p.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <CloudDownload className="size-3.5" aria-hidden />}
                  Bring to this computer
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-muted">Every project on your account is on this computer too.</p>
        )
      ) : null}
    </section>
  );
}
