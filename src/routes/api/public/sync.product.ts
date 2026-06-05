import { createFileRoute } from "@tanstack/react-router";
import { syncGoogle, syncMicrosoft, syncProductRss } from "@/lib/sync.server";

export const Route = createFileRoute("/api/public/sync/product")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) return Response.json({ ok: false, error: "Missing id" }, { status: 400 });
        // Public endpoint - no authentication required
        const trigger = "manual";
        const result =
          id === "google"
            ? await syncGoogle(trigger)
            : id === "microsoft"
              ? await syncMicrosoft(trigger)
              : await syncProductRss(id, trigger);
        return Response.json(result, {
          status: result.ok ? 200 : result.rateLimited ? 429 : 500,
        });
      },
    },
  },
});