import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ApiAuthResult =
  | { ok: true; userId: string | null; trigger: "cron" | "manual" }
  | { ok: false; response: Response };

function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h || !h.startsWith("Bearer ")) return null;
  const t = h.slice("Bearer ".length).trim();
  return t || null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Authorize an API request. Accepts either:
 *  - A valid Supabase user JWT (returns trigger="manual").
 *  - A Bearer token matching CRON_SECRET env (returns trigger="cron").
 * Returns a 401 Response otherwise.
 */
export async function authorizeApiRequest(request: Request): Promise<ApiAuthResult> {
  const token = bearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && constantTimeEqual(token, cronSecret)) {
    return { ok: true, userId: null, trigger: "cron" };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "Server auth not configured" },
        { status: 500 },
      ),
    };
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, userId: data.claims.sub, trigger: "manual" };
}