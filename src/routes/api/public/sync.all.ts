import { createFileRoute } from "@tanstack/react-router";
import { syncGoogle, syncMicrosoft, syncProductRss } from "@/lib/sync.server";

/**
 * Daily auto-sync entry point. Called by pg_cron every morning to refresh
 * every enabled product across both categories. Public endpoint by design
 * (no PII, no writes to user data) — pg_cron just needs an unauth URL.
 */
export const Route = createFileRoute("/api/public/sync/all")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: products } = await supabaseAdmin
          .from("products")
          .select("id");
        const ids = (products ?? []).map((p) => p.id);

        const results: Record<string, { ok: boolean; upserted: number; error?: string }> = {};
        for (const id of ids) {
          try {
            const r =
              id === "google"
                ? await syncGoogle("cron")
                : id === "microsoft"
                  ? await syncMicrosoft("cron")
                  : await syncProductRss(id, "cron");
            results[id] = { ok: r.ok, upserted: r.upserted, error: r.error };
          } catch (err) {
            results[id] = {
              ok: false,
              upserted: 0,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        return Response.json({ ok: true, ran: ids.length, results });
      },
    },
  },
});