import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { getPartsByGroup, PART_GROUPS } from "@kiungo/core/parts";
import type { PartModel } from "@kiungo/core/parts/types";
import { vendorLinksFor } from "@kiungo/core/parts/vendor-links";
import { PartPlanGraphic } from "@kiungo/lab/views/PartPlanView";
import { invoke } from "../ipc";
import { PageTitle } from "../shell/widgets";

const ALL = "All components";
type Category = typeof ALL | (typeof PART_GROUPS)[number]["title"];

/** Where to actually buy each part the simulator models, one click to a real vendor's page. Kiungo doesn't sell hardware itself. */
export function Marketplace() {
  const [category, setCategory] = useState<Category>(ALL);
  const [query, setQuery] = useState("");

  const groups = useMemo(() => getPartsByGroup(), []);
  const q = query.trim().toLowerCase();
  const matches = (part: PartModel) => !q || part.name.toLowerCase().includes(q) || (part.aka ?? []).some((a) => a.toLowerCase().includes(q));
  const shown = groups.flatMap(({ group, parts }) => (category === ALL || category === group.title ? parts.filter(matches) : []));

  return (
    <div className="mx-auto max-w-[1280px] p-6" data-testid="marketplace">
      <PageTitle title="Kiungo Marketplace" detail="Every part the simulator models, with one click to shop it at a real local vendor." />
      <p className="mb-5 rounded-[10px] bg-muted-bg p-3 text-[11px] text-muted">
        These links go straight to Jumia Kenya, Jiji Kenya, and Nerokas — Kiungo doesn&apos;t sell hardware or hold stock, so pricing, availability, and checkout all happen on the vendor&apos;s own site.
      </p>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-[14px] border border-border bg-surface p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search components"
            className="mb-3 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-xs outline-none focus-visible:border-primary"
          />
          <button type="button" onClick={() => setCategory(ALL)} className={`w-full rounded-[10px] px-3 py-2 text-left text-xs ${category === ALL ? "bg-[color-mix(in_srgb,var(--primary)_14%,var(--surface))] font-semibold text-primary" : "text-muted hover:bg-muted-bg"}`}>
            {ALL}
          </button>
          {groups.map(({ group, parts }) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setCategory(group.title)}
              className={`w-full rounded-[10px] px-3 py-2 text-left text-xs ${category === group.title ? "bg-[color-mix(in_srgb,var(--primary)_14%,var(--surface))] font-semibold text-primary" : "text-muted hover:bg-muted-bg"}`}
            >
              {group.title}
              <span className="ml-1.5 text-muted">({parts.length})</span>
            </button>
          ))}
        </aside>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((part) => (
            <ShopCard key={part.id} part={part} />
          ))}
          {shown.length === 0 ? <p className="col-span-full py-8 text-center text-sm text-muted">No components match that search.</p> : null}
        </div>
      </div>
    </div>
  );
}

function ShopCard({ part }: { part: PartModel }) {
  const links = useMemo(() => vendorLinksFor(part), [part]);
  return (
    <article className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-3 grid h-24 place-items-center rounded-[10px] bg-muted-bg p-2">
        <PartPlanGraphic model={part} powered={false} className="h-full w-full" />
      </div>
      <h3 className="text-xs font-semibold text-foreground">{part.name}</h3>
      <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{part.summary}</p>
      <div className="mt-3 space-y-1.5">
        {links.map((link) => (
          <button
            key={link.vendor}
            type="button"
            onClick={() => void invoke("marketplace:open-vendor-link", link.url)}
            className="flex w-full items-center justify-between rounded-[8px] border border-border px-2.5 py-1.5 text-[10.5px] font-medium text-foreground hover:border-primary/60 hover:text-primary"
          >
            <span>
              Shop on {link.vendor}
              <span className="ml-1.5 text-muted">{link.kind === "search" ? "· search results" : "· category"}</span>
            </span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </button>
        ))}
      </div>
    </article>
  );
}
