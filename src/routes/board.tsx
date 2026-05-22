import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Filters, defaultFilters, type FilterState } from "@/components/Filters";
import { applyFilters, useReleases, type Release } from "@/lib/releases";
import { ReleaseCard } from "@/components/ReleaseCard";
import { ReleaseDrawer } from "@/components/ReleaseDrawer";
import { STATUSES } from "@/lib/categories";
import { ChevronDown } from "lucide-react";

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
        <p className="text-xs text-muted-foreground">
          Kanban grouped by status. Columns show the latest 8 — expand for the full list.
        </p>
      </header>
      <Filters value={filters} onChange={setFilters} />
      {isLoading ? (
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-3 p-4">
            {STATUSES.map((s) => (
              <BoardColumn
                key={s}
                status={s}
                items={cols[s]}
                onSelect={setSelected}
              />
            ))}
          </div>
        </div>
      )}
      <ReleaseDrawer release={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function BoardColumn({
  status,
  items,
  onSelect,
}: {
  status: string;
  items: Release[];
  onSelect: (r: Release) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const PAGE = 8;
  const visible = expanded ? items : items.slice(0, PAGE);
  return (
    <div className="w-72 shrink-0">
      <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{status}</span>
        <span>{items.length}</span>
      </div>
      <div className="space-y-1.5">
        {visible.map((r) => (
          <ReleaseCard key={r.id} release={r} onClick={() => onSelect(r)} />
        ))}
        {items.length === 0 && (
          <div className="rounded border border-dashed border-border/60 py-6 text-center text-[11px] text-muted-foreground/60">
            Empty
          </div>
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