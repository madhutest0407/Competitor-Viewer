import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Filters, defaultFilters, type FilterState } from "@/components/Filters";
import { applyFilters, useReleases, type Release } from "@/lib/releases";
import { CATEGORIES } from "@/lib/categories";
import { ReleaseDrawer } from "@/components/ReleaseDrawer";
import { ActiveProductsBar } from "@/components/ActiveProductsBar";
import { useActiveProductIds } from "@/lib/products";

export const Route = createFileRoute("/compare")({
  component: ComparePage,
});

function ComparePage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selected, setSelected] = useState<Release | null>(null);
  const { data } = useReleases();
  const { activeIds, products } = useActiveProductIds();
  const activeProducts = useMemo(
    () => products.filter((p) => activeIds.has(p.id)),
    [products, activeIds],
  );
  const filtered = useMemo(
    () => applyFilters(data ?? [], filters).filter((r) => activeIds.has(r.source)),
    [data, filters, activeIds],
  );

  const byCat = useMemo(() => {
    const m: Record<string, Record<string, Release[]>> = {};
    for (const c of CATEGORIES) {
      m[c] = {};
      for (const p of activeProducts) m[c][p.id] = [];
    }
    for (const r of filtered) {
      const c = r.category ?? "Other";
      if (!m[c]) m[c] = {};
      if (!m[c][r.source]) m[c][r.source] = [];
      m[c][r.source].push(r);
    }
    return m;
  }, [filtered, activeProducts]);

  return (
    <div>
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Compare</h1>
        <p className="text-xs text-muted-foreground">Side-by-side by category.</p>
      </header>
      <ActiveProductsBar />
      <Filters value={filters} onChange={setFilters} />
      <div className="p-4">
        {activeProducts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            Select at least one product above to compare.
          </div>
        ) : (
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="w-44 px-3 py-2">Category</th>
              {activeProducts.map((p) => (
                <th key={p.id} className="px-3 py-2">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full align-middle"
                    style={{ backgroundColor: p.color }}
                  />{" "}
                  {p.name}
                </th>
              ))}
              <th className="w-24 px-3 py-2">Gap</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => {
              const counts = activeProducts.map((p) => byCat[c]?.[p.id]?.length ?? 0);
              const withItems = activeProducts.filter((_, i) => counts[i] > 0);
              const gap =
                withItems.length === 0
                  ? "—"
                  : withItems.length === activeProducts.length
                    ? "All"
                    : withItems.length === 1
                      ? `${withItems[0].name} only`
                      : `${withItems.length}/${activeProducts.length}`;
              return (
                <tr key={c} className="border-b border-border align-top">
                  <td className="px-3 py-3 text-[13px] font-medium">{c}</td>
                  {activeProducts.map((p) => (
                    <td key={p.id} className="px-3 py-3">
                      <RowList items={byCat[c]?.[p.id] ?? []} onSelect={setSelected} />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-[11px] text-muted-foreground">{gap}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
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