import { Book, Check } from "lucide-react";
import { Button } from "@kiungo/ui/button";
import { FocusPanel, PageTitle } from "../shell/widgets";

const COURSES = ["Sensor interfaces", "Practical robotics", "PCB design basics"];

/** Role-aware lessons tied directly to the simulation and firmware tools. */
export function LearningCenter() {
  return (
    <div className="mx-auto max-w-[1180px] p-6" data-testid="learning-center">
      <PageTitle title="Learning center" detail="Role-aware lessons connected directly to the simulation and firmware tools." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <div className="rounded-[16px] bg-gradient-to-r from-[var(--kiungo-navy)] to-primary p-6 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/75">Continue learning</p>
            <h2 className="mt-2 text-xl font-semibold">Embedded C foundations</h2>
            <p className="mt-2 max-w-xl text-xs text-white/85">Lesson 7 · Interrupts, timers, and deterministic control loops</p>
            <div className="mt-5 h-1.5 max-w-md rounded-full bg-white/25">
              <div className="h-full w-2/3 rounded-full bg-white" />
            </div>
            <Button size="sm" variant="secondary" className="mt-5 bg-white text-[var(--kiungo-navy)] hover:bg-white/90">
              Resume lesson
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {COURSES.map((x, i) => (
              <article key={x} className="rounded-[14px] border border-border bg-surface p-4">
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-primary">Course {i + 2}</div>
                <h3 className="text-sm font-semibold text-foreground">{x}</h3>
                <p className="mt-2 text-[11px] text-muted">Hands-on lessons, simulation challenges, and a verified project at the end.</p>
                <button type="button" className="mt-4 text-[11px] font-semibold text-primary">
                  View course →
                </button>
              </article>
            ))}
          </div>
        </div>
        <aside className="space-y-4">
          <FocusPanel title="Assignments" icon={<Book className="size-4" aria-hidden />} items={["PWM motor control · due Fri", "Sensor calibration · due Mon", "Circuit review · submitted", "Quiz 4 · 92%"]} />
          <FocusPanel title="Achievements" icon={<Check className="size-4" aria-hidden />} items={["First physical upload", "10 clean builds", "Research ready", "7-day streak"]} />
        </aside>
      </div>
    </div>
  );
}
