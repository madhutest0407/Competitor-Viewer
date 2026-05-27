import { createFileRoute } from "@tanstack/react-router";
import { syncGoogle } from "@/lib/sync.server";
import { authorizeApiRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/sync/google")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authorizeApiRequest(request);
        if (!auth.ok) return auth.response;
        const result = await syncGoogle(auth.trigger);
        return Response.json(result, {
          status: result.ok ? 200 : result.rateLimited ? 429 : 500,
        });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to sync" }),
    },
  },
});