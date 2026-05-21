import { createFileRoute } from "@tanstack/react-router";
import { syncGoogle } from "@/lib/sync.server";

export const Route = createFileRoute("/api/public/sync/google")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const triggered =
          request.headers.get("x-trigger") === "cron" ? "cron" : "manual";
        const result = await syncGoogle(triggered);
        return Response.json(result, {
          status: result.ok ? 200 : result.rateLimited ? 429 : 500,
        });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to sync" }),
    },
  },
});