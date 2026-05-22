import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Filters, defaultFilters, type FilterState } from "@/components/Filters";
import { applyFilters, quarterOf, quartersWindow, useReleases, type Release } from "@/lib/releases";
import { ReleaseCard } from "@/components/ReleaseCard";
import { ReleaseDrawer } from "@/components/ReleaseDrawer";
import { ChevronDown } from "lucide-react";

export const Route = createFileRoute("/")({
  component: TimelinePage,
});

function TimelinePage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selected, setSelected] = useState<Release | null>(null);
  const { data, isLoading } = useReleases();
  const quarters = useMemo(quartersWindow, []);
  const currentQuarter = useMemo(() => {
    const now = new Date();
    return `Q${Math.floor(now.getUTCMonth() / 3) + 1} ${now.getUTCFullYear()}`;
  }, []);
  const [activeQuarter, setActiveQuarter] = useState<string>(currentQuarter);

  const filtered = useMemo(() => applyFilters(data ?? [], filters), [data, filters]);

  const grouped = useMemo(() => {
    const map: Record<string, Record<"google" | "microsoft", Release[]>> = {};
    for (const q of quarters) map[q] = { google: [], microsoft: [] };
    for (const r of filtered) {
      const q = quarterOf(r.release_date);
      if (q && map[q]) map[q][r.source].push(r);
    }
    return map;
  }, [filtered, quarters]);

  const active = grouped[activeQuarter] ?? { google: [], microsoft: [] };
  const totalActive = active.google.length + active.microsoft.length;

  return (
    <div>
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Timeline</h1>
        <p className="text-xs text-muted-foreground">
          Browse one quarter at a time. Pick a quarter below to focus.
        </p>
      </header>
      <Filters value={filters} onChange={setFilters} />
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-background/60 px-6 py-2">
        {quarters.map((q) => {
          const count =
            (grouped[q]?.google.length ?? 0) + (grouped[q]?.microsoft.length ?? 0);
          const isActive = q === activeQuarter;
          const isCurrent = q === currentQuarter;
          return (
            <button
              key={q}
              onClick={() => setActiveQuarter(q)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {q}
              {isCurrent && !isActive && <span className="ml-1 text-primary">•</span>}
              <span className="ml-1.5 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      {isLoading ? (
        <div className="p-8 text-sm text-muted-foreground">Loading releases…</div>
      ) : (
        <div className="p-6">
          <div className="mb-4 flex flex-wrap items-baseline gap-4 text-xs text-muted-foreground">
            <span className="text-sm font-medium text-foreground">{activeQuarter}</span>
            <span>{totalActive} releases</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--vendor-google)" }} />
              {active.google.length} Google
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--vendor-microsoft)" }} />
              {active.microsoft.length} Microsoft
            </span>
          </div>
          {totalActive === 0 ? (
            <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No releases in this quarter. Try another one above.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Lane
                label="Google Workspace"
                color="var(--vendor-google)"
                items={active.google}
                onSelect={setSelected}
              />
              <Lane
                label="Microsoft 365"
                color="var(--vendor-microsoft)"
                items={active.microsoft}
                onSelect={setSelected}
              />
            </div>
          )}
        </div>
      )}
      <ReleaseDrawer release={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Lane({
  label,
  color,
  items,
  onSelect,
}: {
  label: string;
  color: string;
  items: Release[];
  onSelect: (r: Release) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const PAGE = 6;
  useEffect(() => {
    setExpanded(false);
  }, [items]);
  const visible = expanded ? items : items.slice(0, PAGE);
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
        <span className="ml-auto normal-case tracking-normal text-muted-foreground/80">
          {items.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.length === 0 ? (
          <div className="rounded border border-dashed border-border/60 py-6 text-center text-[11px] text-muted-foreground/60">
            No releases
          </div>
        ) : (
          visible.map((r) => <ReleaseCard key={r.id} release={r} onClick={() => onSelect(r)} />)
        )}
      </div>
      {items.length > PAGE && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {expanded ? "Show less" : `Show ${items.length - PAGE} more`}
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}
