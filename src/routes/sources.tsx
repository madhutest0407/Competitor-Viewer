import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/sources")({
  component: SourcesPage,
});

const SOURCES = [
  {
    key: "microsoft" as const,
    label: "Microsoft 365 Roadmap",
    url: "https://www.microsoft.com/microsoft-365/roadmap",
    endpoint: "/api/public/sync/microsoft",
  },
  {
    key: "google" as const,
    label: "Google Workspace Updates (Calendar)",
    url: "https://workspaceupdates.googleblog.com/search/label/Calendar",
    endpoint: "/api/public/sync/google",
  },
];

function SourcesPage() {
  const qc = useQueryClient();
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
    mutationFn: async (endpoint: string) => {
      const res = await fetch(endpoint, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      return json as { upserted: number };
    },
    onSuccess: (r) => {
      toast.success(`Synced ${r.upserted} item${r.upserted === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["releases"] });
      qc.invalidateQueries({ queryKey: ["sync_runs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  function lastRun(source: string) {
    return (runsQ.data ?? []).find((r) => r.source === source && r.finished_at);
  }

  return (
    <div>
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Sources</h1>
        <p className="text-xs text-muted-foreground">
          Public data feeds. Daily auto-sync; anyone can trigger a manual refresh (rate-limited).
        </p>
      </header>
      <div className="space-y-3 p-4">
        {SOURCES.map((s) => {
          const last = lastRun(s.key);
          return (
            <div
              key={s.key}
              className="flex items-center justify-between rounded-md border border-border bg-card p-4"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {s.label}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div className="text-xs text-muted-foreground">
                  {last
                    ? `Last sync ${formatDistanceToNow(new Date(last.started_at))} ago · ${last.items_upserted ?? 0} items${last.error ? ` · error: ${last.error}` : ""}`
                    : "Never synced"}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => sync.mutate(s.endpoint)}
                disabled={sync.isPending}
                className="h-8 gap-1.5 text-xs"
              >
                <RefreshCw className={`h-3 w-3 ${sync.isPending ? "animate-spin" : ""}`} />
                Sync now
              </Button>
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
              {(runsQ.data ?? []).map((r) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}