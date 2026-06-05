import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReleases } from "@/lib/releases";
import { CATEGORIES } from "@/lib/categories";
import { ActiveProductsBar } from "@/components/ActiveProductsBar";
import { AIInsightsSummary } from "@/components/AIInsightsSummary";
import { useActiveProductIds } from "@/lib/products";

export const Route = createFileRoute("/gaps")({
  component: GapsPage,
  head: () => ({
    meta: [
      { title: "Gap analysis — PM Radar" },
      {
        name: "description",
        content:
          "Spot feature gaps between Google Workspace and Microsoft 365 calendar with AI-powered strategic recommendations.",
      },
      { property: "og:title", content: "Gap analysis — PM Radar" },
      {
        property: "og:description",
        content:
          "Spot feature gaps between Google Workspace and Microsoft 365 calendar.",
      },
      { property: "og:url", content: "https://competitorradar.lovable.app/gaps" },
      { name: "twitter:title", content: "Gap analysis — PM Radar" },
      {
        name: "twitter:description",
        content:
          "Spot feature gaps between Google Workspace and Microsoft 365 calendar.",
      },
    ],
    links: [{ rel: "canonical", href: "https://competitorradar.lovable.app/gaps" }],
  }),
});

function GapsPage() {
  const { data } = useReleases();
  const { activeIds, products } = useActiveProductIds();
  const activeProducts = useMemo(
    () => products.filter((p) => activeIds.has(p.id)),
    [products, activeIds],
  );

  const summary = useMemo(() => {
    return CATEGORIES.map((c) => {
      const items = (data ?? []).filter((r) => r.category === c);
      const counts: Record<string, number> = {};
      for (const p of activeProducts) {
        counts[p.id] = items.filter((r) => r.source === p.id).length;
      }
      const withItems = activeProducts.filter((p) => counts[p.id] > 0);
      const verdict =
        activeProducts.length === 0
          ? "—"
          : withItems.length === 0
            ? "None"
            : withItems.length === activeProducts.length
              ? "All"
              : withItems.length === 1
                ? `${withItems[0].name} only`
                : `${withItems.length}/${activeProducts.length}`;
      return { c, counts, verdict };
    });
  }, [data, activeProducts]);

  const allReleases = useMemo(() => {
    return (data ?? []).map((r) => ({
      title: r.title,
      category: r.category ?? "Other",
      status: r.status ?? "Unknown",
      source: r.source,
    }));
  }, [data]);

  const insightsQ = useQuery({
    queryKey: ["ai_insights_gaps", Array.from(activeIds)],
    queryFn: async () => {
      if (activeProducts.length === 0 || allReleases.length === 0) {
        return { insights: [] };
      }
      const { authedFetch } = await import("@/lib/authed-fetch");
      const res = await authedFetch("/api/ai/insights", {
        method: "POST",
        body: JSON.stringify({
          products: activeProducts.map((p) => ({ name: p.name, color: p.color })),
          releases: allReleases,
          quarter: "",
          variant: "gaps",
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
        <h1 className="text-lg font-semibold tracking-tight">Gap analysis</h1>
        <p className="text-xs text-muted-foreground">
          Where active products are investing — and your private notes per category.
        </p>
      </header>
      <ActiveProductsBar />
      <div className="p-4">
        <AIInsightsSummary
          variant="gaps"
          insights={insightsQ.data?.insights}
          isLoading={insightsQ.isFetching}
          error={insightsQ.data?.error ?? null}
          onGenerate={() => insightsQ.refetch()}
          canGenerate={activeProducts.length > 0 && allReleases.length > 0}
        />
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Category</th>
              {activeProducts.map((p) => (
                <th key={p.id} className="px-3 py-2">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full align-middle"
                    style={{ backgroundColor: p.color }}
                  />{" "}
                  {p.name}
                </th>
              ))}
              <th className="px-3 py-2">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.c} className="border-b border-border align-top">
                <td className="px-3 py-3 text-[13px] font-medium">{s.c}</td>
                {activeProducts.map((p) => (
                  <td key={p.id} className="px-3 py-3 tabular-nums">
                    {s.counts[p.id] ?? 0}
                  </td>
                ))}
                <td className="px-3 py-3 text-muted-foreground">{s.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}