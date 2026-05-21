import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Filters, defaultFilters, type FilterState } from "@/components/Filters";
import { applyFilters, quarterOf, quartersWindow, useReleases, type Release } from "@/lib/releases";
import { ReleaseCard } from "@/components/ReleaseCard";
import { ReleaseDrawer } from "@/components/ReleaseDrawer";

export const Route = createFileRoute("/")({
  component: TimelinePage,
});

function TimelinePage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selected, setSelected] = useState<Release | null>(null);
  const { data, isLoading } = useReleases();
  const quarters = useMemo(quartersWindow, []);

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

  return (
    <div>
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Timeline</h1>
        <p className="text-xs text-muted-foreground">
          Quarterly view of Google Workspace and Microsoft 365 calendar releases.
        </p>
      </header>
      <Filters value={filters} onChange={setFilters} />
      {isLoading ? (
        <div className="p-8 text-sm text-muted-foreground">Loading releases…</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-3 p-4">
            {quarters.map((q) => (
              <div key={q} className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>{q}</span>
                  <span>
                    {grouped[q].google.length + grouped[q].microsoft.length}
                  </span>
                </div>
                <div className="space-y-2">
                  <Lane
                    label="Google"
                    color="var(--vendor-google)"
                    items={grouped[q].google}
                    onSelect={setSelected}
                  />
                  <Lane
                    label="Microsoft"
                    color="var(--vendor-microsoft)"
                    items={grouped[q].microsoft}
                    onSelect={setSelected}
                  />
                </div>
              </div>
            ))}
          </div>
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
  return (
    <div className="rounded-md border border-border bg-card/30 p-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {label} · {items.length}
      </div>
      <div className="space-y-1.5">
        {items.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/60">No releases</div>
        ) : (
          items.map((r) => <ReleaseCard key={r.id} release={r} onClick={() => onSelect(r)} />)
        )}
      </div>
    </div>
  );
}
