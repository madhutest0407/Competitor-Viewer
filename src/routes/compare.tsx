import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Filters, defaultFilters, type FilterState } from "@/components/Filters";
import { applyFilters, useReleases, type Release } from "@/lib/releases";
import { CATEGORIES } from "@/lib/categories";
import { ReleaseDrawer } from "@/components/ReleaseDrawer";

export const Route = createFileRoute("/compare")({
  component: ComparePage,
});

function ComparePage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selected, setSelected] = useState<Release | null>(null);
  const { data } = useReleases();
  const filtered = useMemo(() => applyFilters(data ?? [], filters), [data, filters]);

  const byCat = useMemo(() => {
    const m: Record<string, { google: Release[]; microsoft: Release[] }> = {};
    for (const c of CATEGORIES) m[c] = { google: [], microsoft: [] };
    for (const r of filtered) {
      const c = r.category ?? "Other";
      if (!m[c]) m[c] = { google: [], microsoft: [] };
      m[c][r.source].push(r);
    }
    return m;
  }, [filtered]);

  return (
    <div>
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Compare</h1>
        <p className="text-xs text-muted-foreground">Side-by-side by category.</p>
      </header>
      <Filters value={filters} onChange={setFilters} />
      <div className="p-4">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="w-44 px-3 py-2">Category</th>
              <th className="px-3 py-2">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ backgroundColor: "var(--vendor-google)" }}
                />{" "}
                Google
              </th>
              <th className="px-3 py-2">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ backgroundColor: "var(--vendor-microsoft)" }}
                />{" "}
                Microsoft
              </th>
              <th className="w-24 px-3 py-2">Gap</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => {
              const g = byCat[c]?.google ?? [];
              const m = byCat[c]?.microsoft ?? [];
              const gap =
                g.length === 0 && m.length > 0
                  ? "MS only"
                  : m.length === 0 && g.length > 0
                    ? "Google only"
                    : g.length === 0 && m.length === 0
                      ? "—"
                      : "Both";
              return (
                <tr key={c} className="border-b border-border align-top">
                  <td className="px-3 py-3 text-[13px] font-medium">{c}</td>
                  <td className="px-3 py-3">
                    <RowList items={g} onSelect={setSelected} />
                  </td>
                  <td className="px-3 py-3">
                    <RowList items={m} onSelect={setSelected} />
                  </td>
                  <td className="px-3 py-3 text-[11px] text-muted-foreground">{gap}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ReleaseDrawer release={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function RowList({ items, onSelect }: { items: Release[]; onSelect: (r: Release) => void }) {
  if (items.length === 0)
    return <span className="text-[11px] text-muted-foreground/60">—</span>;
  return (
    <ul className="space-y-1">
      {items.slice(0, 8).map((r) => (
        <li key={r.id}>
          <button
            onClick={() => onSelect(r)}
            className="text-left text-[12px] leading-snug text-foreground/90 hover:text-primary"
          >
            {r.title}{" "}
            <span className="text-muted-foreground">· {r.status}</span>
          </button>
        </li>
      ))}
      {items.length > 8 && (
        <li className="text-[10px] text-muted-foreground">+{items.length - 8} more</li>
      )}
    </ul>
  );
}