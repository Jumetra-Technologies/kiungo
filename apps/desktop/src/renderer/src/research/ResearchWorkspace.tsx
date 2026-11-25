import { Book, FlaskConical } from "lucide-react";
import { FocusPanel, Metric, PageTitle, Pill } from "../shell/widgets";

const EXPERIMENTS: Array<{ title: string; status: "Running" | "Review" | "Planned"; detail: string }> = [
  { title: "PID response under variable surface reflectance", status: "Running", detail: "Line follower · 8 runs" },
  { title: "Motor current characterization", status: "Review", detail: "Power bench · 16 samples" },
  { title: "Ultrasonic sensor temperature drift", status: "Planned", detail: "HC-SR04 · controlled chamber" },
];

/** Reproducible experiments, evidence, and the datasets a hardware configuration produced. */
export function ResearchWorkspace() {
  return (
    <div className="mx-auto max-w-[1280px] p-6" data-testid="research-workspace">
      <PageTitle title="Research workspace" detail="Design reproducible experiments, keep the evidence, and connect datasets to the hardware that produced them." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Active experiments" value="3" detail="1 running today" />
        <Metric label="Datasets" value="18" detail="Linked to projects" tone="info" />
        <Metric label="Lab notes" value="142" detail="Across your projects" tone="accent" />
        <Metric label="Publications" value="1" detail="Draft in review" tone="warn" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[14px] border border-border bg-surface">
          <div className="flex items-center border-b border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">Active experiments</h3>
          </div>
          {EXPERIMENTS.map((e) => (
            <div key={e.title} className="flex items-center gap-3 border-b border-border p-4 last:border-0">
              <div className="grid size-9 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--primary)_14%,var(--surface))] text-primary">
                <FlaskConical className="size-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-foreground">{e.title}</div>
                <div className="text-[10.5px] text-muted">{e.detail}</div>
              </div>
              <Pill tone={e.status === "Running" ? "info" : e.status === "Review" ? "warn" : "neutral"}>{e.status}</Pill>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <FocusPanel title="Lab notebook" icon={<Book className="size-4" aria-hidden />} items={["Hypothesis log", "Protocol changes", "Calibration notes", "Review signatures"]} />
          <FocusPanel title="Research outputs" icon={<FlaskConical className="size-4" aria-hidden />} items={["Datasets", "Figures", "Reports", "Publications"]} />
        </div>
      </div>
    </div>
  );
}
