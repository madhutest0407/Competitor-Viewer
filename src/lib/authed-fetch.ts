import { supabase } from "@/integrations/supabase/client";

/**
 * fetch() wrapper that attaches the current Supabase user's Bearer token.
 * Use for calls to protected /api/* server routes.
 */
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token && !headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("content-type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}