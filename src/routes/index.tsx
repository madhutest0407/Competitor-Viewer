import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filters, defaultFilters, type FilterState } from "@/components/Filters";
import { applyFilters, quarterOf, quartersWindow, useReleases, type Release } from "@/lib/releases";
import { ReleaseCard } from "@/components/ReleaseCard";
import { ReleaseDrawer } from "@/components/ReleaseDrawer";
import { ActiveProductsBar } from "@/components/ActiveProductsBar";
import { AIInsightsSummary } from "@/components/AIInsightsSummary";
import { useActiveProductIds } from "@/lib/products";
import { ChevronDown } from "lucide-react";

export const Route = createFileRoute("/")({
  component: TimelinePage,
  head: () => ({
    meta: [
      { title: "Timeline — PM Radar" },
      {
        name: "description",
        content:
          "Chronological feed of Google Workspace and Microsoft 365 releases. Filter by quarter, product and category.",
      },
      { property: "og:title", content: "Timeline — PM Radar" },
      {
        property: "og:description",
        content:
          "Chronological feed of Google Workspace and Microsoft 365 releases.",
      },
      { property: "og:url", content: "https://competitorradar.lovable.app/" },
      { name: "twitter:title", content: "Timeline — PM Radar" },
      {
        name: "twitter:description",
        content:
          "Chronological feed of Google Workspace and Microsoft 365 releases.",
    ],
    links: [{ rel: "canonical", href: "https://competitorradar.lovable.app/" }],
  }),
});

function TimelinePage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selected, setSelected] = useState<Release | null>(null);
  const { data, isLoading } = useReleases();
  const { activeIds, products } = useActiveProductIds();
  const quarters = useMemo(quartersWindow, []);
  const currentQuarter = useMemo(() => {
    const now = new Date();
    return `Q${Math.floor(now.getUTCMonth() / 3) + 1} ${now.getUTCFullYear()}`;
  }, []);
  const [activeQuarter, setActiveQuarter] = useState<string>(currentQuarter);

  const filtered = useMemo(
    () => applyFilters(data ?? [], filters).filter((r) => activeIds.has(r.source)),
    [data, filters, activeIds],
  );
  const activeProducts = useMemo(
    () => products.filter((p) => activeIds.has(p.id)),
    [products, activeIds],
  );

  const grouped = useMemo(() => {
    const map: Record<string, Record<string, Release[]>> = {};
    for (const q of quarters) {
      map[q] = {};
      for (const p of activeProducts) map[q][p.id] = [];
    }
    for (const r of filtered) {
      const q = quarterOf(r.release_date);
      if (q && map[q] && map[q][r.source]) map[q][r.source].push(r);
    }
    return map;
  }, [filtered, quarters, activeProducts]);

  const activeByProduct = grouped[activeQuarter] ?? {};
  const totalActive = activeProducts.reduce(
    (acc, p) => acc + (activeByProduct[p.id]?.length ?? 0),
    0,
  );

  const quarterReleases = useMemo(() => {
    const releases = filtered.filter((r) => quarterOf(r.release_date) === activeQuarter);
    return releases.map((r) => ({
      title: r.title,
      category: r.category ?? "Other",
      status: r.status ?? "Unknown",
      source: r.source,
    }));
  }, [filtered, activeQuarter]);

  const insightsQ = useQuery({
    queryKey: ["ai_insights_timeline", Array.from(activeIds), activeQuarter],
    queryFn: async () => {
      if (activeProducts.length === 0 || quarterReleases.length === 0) {
        return { insights: [] };
      }
      const { authedFetch } = await import("@/lib/authed-fetch");
      const res = await authedFetch("/api/ai/insights", {
        method: "POST",
        body: JSON.stringify({
          products: activeProducts.map((p) => ({ name: p.name, color: p.color })),
          releases: quarterReleases,
          quarter: activeQuarter,
          variant: "timeline",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { insights: [], error: json.error ?? `HTTP ${res.status}` };
      }
      return json;
    },
    staleTime: 1000 * 60 * 60,
    enabled: false,
  });

  return (
    <div>
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Timeline</h1>
        <p className="text-xs text-muted-foreground">
          View product updates by quarter. Track launches and releases across all your monitored products.
        </p>
      </header>
      <ActiveProductsBar />
      <div className="border-b border-border bg-background/60">
        <div className="flex items-center gap-1 overflow-x-auto px-6 py-2">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Quarter
          </span>
          {quarters.map((q) => {
            const count = activeProducts.reduce(
              (acc, p) => acc + (grouped[q]?.[p.id]?.length ?? 0),
              0,
            );
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
      </div>
      <Filters value={filters} onChange={setFilters} />
      {isLoading ? (
        <div className="p-8 text-sm text-muted-foreground">Loading releases…</div>
      ) : activeProducts.length === 0 ? (
        <div className="p-8 text-sm text-muted-foreground">
          Select at least one product above to see releases.
        </div>
      ) : (
        <div className="p-6">
          <div className="mb-4 flex flex-wrap items-baseline gap-4 text-xs text-muted-foreground">
            <span className="text-sm font-medium text-foreground">{activeQuarter}</span>
            <span>{totalActive} releases</span>
            {activeProducts.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                {activeByProduct[p.id]?.length ?? 0} {p.name}
              </span>
            ))}
          </div>
          <AIInsightsSummary
            variant="timeline"
            insights={insightsQ.data?.insights}
            isLoading={insightsQ.isFetching}
            error={insightsQ.data?.error ?? null}
            onGenerate={() => insightsQ.refetch()}
            canGenerate={activeProducts.length > 0 && quarterReleases.length > 0}
          />
          {totalActive === 0 ? (
            <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No releases in this quarter. Try another one above.
            </div>
          ) : (
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${Math.min(activeProducts.length, 4)}, minmax(0, 1fr))`,
              }}
            >
              {activeProducts.map((p) => (
                <Lane
                  key={p.id}
                  label={p.name}
                  color={p.color}
                  items={activeByProduct[p.id] ?? []}
                  onSelect={setSelected}
                />
              ))}
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
      <div className="mb-3 flex items-center gap-2 text-base font-bold text-foreground">
        <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        {label}
        <span className="ml-auto text-xs font-medium text-muted-foreground">
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
