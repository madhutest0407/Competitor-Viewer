import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Filters, defaultFilters, type FilterState } from "@/components/Filters";
import { applyFilters, useReleases, type Release } from "@/lib/releases";
import { ReleaseCard } from "@/components/ReleaseCard";
import { ReleaseDrawer } from "@/components/ReleaseDrawer";
import { STATUSES } from "@/lib/categories";

export const Route = createFileRoute("/board")({
  component: BoardPage,
});

function BoardPage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selected, setSelected] = useState<Release | null>(null);
  const { data, isLoading } = useReleases();
  const filtered = useMemo(() => applyFilters(data ?? [], filters), [data, filters]);

  const cols = useMemo(() => {
    const map: Record<string, Release[]> = {};
    for (const s of STATUSES) map[s] = [];
    for (const r of filtered) {
      const s = (r.status ?? "Planned") as string;
      if (map[s]) map[s].push(r);
    }
    return map;
  }, [filtered]);

  return (
    <div>
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Board</h1>
        <p className="text-xs text-muted-foreground">Kanban grouped by release status.</p>
      </header>
      <Filters value={filters} onChange={setFilters} />
      {isLoading ? (
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-3 p-4">
            {STATUSES.map((s) => (
              <div key={s} className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>{s}</span>
                  <span>{cols[s].length}</span>
                </div>
                <div className="space-y-1.5">
                  {cols[s].map((r) => (
                    <ReleaseCard key={r.id} release={r} onClick={() => setSelected(r)} />
                  ))}
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