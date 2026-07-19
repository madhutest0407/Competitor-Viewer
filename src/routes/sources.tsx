import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { RefreshCw, ExternalLink, Check, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useActiveProductIds } from "@/lib/products";
import { SectionTabs } from "@/components/SectionTabs";
import { cacheSyncResult, getCachedSyncResult } from "@/lib/sync-cache";
import { useState } from "react";

export const Route = createFileRoute("/sources")({
  component: SourcesPage,
  head: () => ({
    meta: [
      { title: "Sources & sync — PM Radar" },
      {
        name: "description",
        content:
          "Manage tracked competitor products and review recent release-feed sync runs.",
      },
      { property: "og:title", content: "Sources & sync — PM Radar" },
      {
        property: "og:description",
        content: "Manage tracked competitor products and review release-feed sync runs.",
      },
      { property: "og:url", content: "https://competitorradar.lovable.app/sources" },
      { name: "twitter:title", content: "Sources & sync — PM Radar" },
      {
        name: "twitter:description",
        content: "Manage tracked competitor products and review release-feed sync runs.",
      },
    ],
    links: [{ rel: "canonical", href: "https://competitorradar.lovable.app/sources" }],
  }),
});

const MAX_CONCURRENT_SYNCS = 3;

function SourcesPage() {
  const qc = useQueryClient();
  const { activeIds, products, toggle } = useActiveProductIds();
  const [syncingProductIds, setSyncingProductIds] = useState<Set<string>>(new Set());
  const runsQ = useQuery({
    queryKey: ["sync_runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  const sync = useMutation({
    mutationFn: async (productId: string) => {
      setSyncingProductIds((prev) => new Set([...prev, productId]));
      try {
        const res = await fetch(`/api/public/sync/product?id=${encodeURIComponent(productId)}`, {
          method: "POST",
        });
        const json = await res.json();
        if (!res.ok) {
          const error = new Error(json.error ?? `HTTP ${res.status}`);
          (error as any).rateLimited = json.rateLimited ?? false;
          (error as any).productId = productId;
          throw error;
        }
        return { ...json, productId } as { upserted: number; productId: string };
      } finally {
        setSyncingProductIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    onSuccess: (r) => {
      // Cache the sync result locally for offline/public users
      cacheSyncResult(r.productId, r.upserted);
      toast.success(`Synced ${r.upserted} item${r.upserted === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["releases"] });
      qc.invalidateQueries({ queryKey: ["sync_runs"] });
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : "Sync failed";
      const isRateLimited = (e as any).rateLimited;
      const productId = (e as any).productId;
      if (productId) {
        // Cache error result as well
        cacheSyncResult(productId, 0, message);
      }
      if (isRateLimited) {
        toast.error(`Rate limited: ${message}`);
      } else {
        toast.error(message);
      }
    },
  });

  function lastRun(source: string) {
    // Try to get from database first
    const dbRun = (runsQ.data ?? []).find((r) => r.source === source && r.finished_at);
    if (dbRun) return dbRun;

    // Fallback to cached result for public users
    const cached = getCachedSyncResult(source);
    if (cached) {
      return {
        id: `cached-${source}`,
        source,
        started_at: cached.timestamp,
        finished_at: cached.timestamp,
        items_upserted: cached.itemsUpserted,
        triggered_by: "manual",
        error: cached.error || null,
      };
    }

    return undefined;
  }

  return (
    <div>
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Product Sources</h1>
        <p className="text-xs text-muted-foreground">
          Public product updates — no account needed. Toggle products, or trigger a sync per product (rate-limited).
        </p>
      </header>
      <SectionTabs />
      <div className="space-y-3 p-4">
        {products.map((p) => {
          const last = lastRun(p.id);
          const on = activeIds.has(p.id);
          return (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md border border-border bg-card p-4"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                  {p.feed_url && (
                    <a
                      href={p.feed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {last
                    ? `Last sync ${formatDistanceToNow(new Date(last.started_at))} ago · ${last.items_upserted ?? 0} items${last.error ? ` · error: ${last.error}` : ""}`
                    : "Never synced"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={on ? "secondary" : "outline"}
                  onClick={() => { void toggle(p.id, !on); }}
                  className="h-8 gap-1.5 text-xs"
                >
                  {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {on ? "Active" : "Enable"}
                </Button>
                {!on ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Button
                            size="sm"
                            onClick={() => sync.mutate(p.id)}
                            disabled
                            className="h-8 gap-1.5 text-xs"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Sync now
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Enable this product first to sync
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => sync.mutate(p.id)}
                    disabled={syncingProductIds.has(p.id)}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncingProductIds.has(p.id) ? "animate-spin" : ""}`} />
                    Sync now
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent runs
          </div>
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="py-1.5">Source</th>
                <th>Started</th>
                <th>Items</th>
                <th>Trigger</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runsQ.error ? (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-sm text-destructive">
                    Error loading sync history: {runsQ.error.message}
                  </td>
                </tr>
              ) : (runsQ.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-sm text-muted-foreground">
                    No syncs yet. Click "Sync now" above to start.
                  </td>
                </tr>
              ) : (
                (runsQ.data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-1.5">{r.source}</td>
                  <td>{new Date(r.started_at).toLocaleString()}</td>
                  <td className="tabular-nums">{r.items_upserted ?? 0}</td>
                  <td>{r.triggered_by}</td>
                  <td>
                    {r.error ? (
                      <span className="text-destructive">error</span>
                    ) : r.finished_at ? (
                      "ok"
                    ) : (
                      "running"
                    )}
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}