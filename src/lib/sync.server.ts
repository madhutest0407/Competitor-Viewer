import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CATEGORIES, normalizeStatus } from "./categories";

const MS_KEYWORDS = [
  "calendar",
  "outlook",
  "scheduling",
  "bookings",
  "places",
  "rooms",
  "meeting",
  "rsvp",
];

function isCalendarRelated(item: {
  title?: string;
  description?: string;
  products?: string[];
}) {
  const t = `${item.title ?? ""} ${item.description ?? ""} ${(item.products ?? []).join(" ")}`.toLowerCase();
  return MS_KEYWORDS.some((k) => t.includes(k));
}

function parseMonthYear(s: string | null | undefined): string | null {
  if (!s) return null;
  // formats like "2026-08" or "August CY2026"
  const isoMatch = s.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-01`;
  const months = [
    "january","february","march","april","may","june",
    "july","august","september","october","november","december",
  ];
  const m = s.toLowerCase();
  for (let i = 0; i < months.length; i++) {
    if (m.includes(months[i])) {
      const year = m.match(/(20\d{2})/);
      if (year) return `${year[1]}-${String(i + 1).padStart(2, "0")}-01`;
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function aiExtract(
  title: string,
  contentText: string,
): Promise<{ summary: string; status: string; category: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    return { summary: contentText.slice(0, 240), status: "Rolling out", category: "Other" };
  }
  const prompt = `You are categorizing a Google Workspace calendar release announcement.

Title: ${title}
Body: ${contentText.slice(0, 4000)}

Return JSON only with keys: summary (1-2 sentences), status (one of: Planned, In development, Rolling out, Generally available, Cancelled), category (one of: ${CATEGORIES.join(", ")}).`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You output ONLY valid JSON. No prose, no markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const cat = CATEGORIES.includes(parsed.category) ? parsed.category : "Other";
    return {
      summary: String(parsed.summary ?? "").slice(0, 500) || contentText.slice(0, 240),
      status: normalizeStatus(parsed.status),
      category: cat,
    };
  } catch (err) {
    console.warn("aiExtract failed", err);
    return { summary: contentText.slice(0, 240), status: "Rolling out", category: "Other" };
  }
}

async function aiCategorizeMs(
  title: string,
  description: string,
): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return "Other";
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You output ONLY valid JSON. No prose." },
          {
            role: "user",
            content: `Classify this Microsoft 365 calendar release into ONE category from this list: ${CATEGORIES.join(", ")}.\nTitle: ${title}\nDescription: ${description.slice(0, 1500)}\nReturn JSON: {"category": "..."}`,
          },
        ],
      }),
    });
    if (!res.ok) return "Other";
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (json.choices?.[0]?.message?.content ?? "{}").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    return CATEGORIES.includes(parsed.category) ? parsed.category : "Other";
  } catch {
    return "Other";
  }
}

async function rateLimitCheck(source: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("sync_runs")
    .select("started_at, triggered_by")
    .eq("source", source)
    .eq("triggered_by", "manual")
    .order("started_at", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return true;
  const last = new Date(data[0].started_at).getTime();
  return Date.now() - last > 10 * 60 * 1000; // 10 minutes
}

export async function syncMicrosoft(triggeredBy: "cron" | "manual"): Promise<{
  ok: boolean;
  upserted: number;
  error?: string;
  rateLimited?: boolean;
}> {
  if (triggeredBy === "manual" && !(await rateLimitCheck("microsoft"))) {
    return { ok: false, upserted: 0, rateLimited: true, error: "Rate limited (1 sync per 10 min)" };
  }
  const { data: run } = await supabaseAdmin
    .from("sync_runs")
    .insert({ source: "microsoft", triggered_by: triggeredBy })
    .select("id")
    .single();

  try {
    const res = await fetch("https://www.microsoft.com/releasecommunications/api/v2/m365", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Microsoft API ${res.status}`);
    const body = (await res.json()) as {
      value: Array<{
        id: number;
        title: string;
        description: string;
        products: string[];
        platforms: string[];
        cloudInstances: string[];
        status: string;
        generalAvailabilityDate: string | null;
        previewAvailabilityDate: string | null;
        created: string;
        modified: string;
      }>;
    };

    const filtered = body.value.filter(isCalendarRelated);
    let upserted = 0;
    for (const item of filtered) {
      const sourceId = String(item.id);
      const { data: existing } = await supabaseAdmin
        .from("releases")
        .select("id, category")
        .eq("source", "microsoft")
        .eq("source_id", sourceId)
        .maybeSingle();

      let category = existing?.category ?? null;
      if (!category) {
        category = await aiCategorizeMs(item.title, item.description ?? "");
      }

      const releaseDate =
        parseMonthYear(item.generalAvailabilityDate) ??
        parseMonthYear(item.previewAvailabilityDate);
      const announcedDate = item.created ? item.created.slice(0, 10) : null;

      const { error } = await supabaseAdmin.from("releases").upsert(
        {
          source: "microsoft",
          source_id: sourceId,
          title: item.title,
          description: item.description,
          summary: item.description?.slice(0, 280) ?? null,
          status: normalizeStatus(item.status),
          category,
          release_date: releaseDate,
          announced_date: announcedDate,
          source_url: `https://www.microsoft.com/microsoft-365/roadmap?id=${item.id}`,
          platforms: item.platforms ?? [],
          audience: item.cloudInstances ?? [],
          raw: item as never,
        },
        { onConflict: "source,source_id" },
      );
      if (!error) upserted++;
    }

    await supabaseAdmin
      .from("sync_runs")
      .update({ finished_at: new Date().toISOString(), items_upserted: upserted })
      .eq("id", run!.id);
    return { ok: true, upserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("sync_runs")
      .update({ finished_at: new Date().toISOString(), error: msg })
      .eq("id", run!.id);
    return { ok: false, upserted: 0, error: msg };
  }
}

export async function syncGoogle(triggeredBy: "cron" | "manual"): Promise<{
  ok: boolean;
  upserted: number;
  error?: string;
  rateLimited?: boolean;
}> {
  if (triggeredBy === "manual" && !(await rateLimitCheck("google"))) {
    return { ok: false, upserted: 0, rateLimited: true, error: "Rate limited (1 sync per 10 min)" };
  }
  const { data: run } = await supabaseAdmin
    .from("sync_runs")
    .insert({ source: "google", triggered_by: triggeredBy })
    .select("id")
    .single();

  try {
    const url =
      "https://workspaceupdates.googleblog.com/feeds/posts/default/-/Calendar?alt=json&max-results=50";
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Google feed ${res.status}`);
    const body = (await res.json()) as {
      feed?: {
        entry?: Array<{
          id: { $t: string };
          title: { $t: string };
          published: { $t: string };
          updated: { $t: string };
          content: { $t: string };
          link: Array<{ rel: string; href: string }>;
          category?: Array<{ term: string }>;
        }>;
      };
    };
    const entries = body.feed?.entry ?? [];
    let upserted = 0;

    for (const entry of entries) {
      const sourceId = entry.id.$t;
      const altLink = entry.link.find((l) => l.rel === "alternate");
      const sourceUrl = altLink?.href ?? "";
      const text = stripHtml(entry.content.$t);
      const title = entry.title.$t;

      const { data: existing } = await supabaseAdmin
        .from("releases")
        .select("id, summary, status, category")
        .eq("source", "google")
        .eq("source_id", sourceId)
        .maybeSingle();

      let summary = existing?.summary ?? "";
      let status = existing?.status ?? "Rolling out";
      let category = existing?.category ?? "Other";
      if (!existing) {
        const extracted = await aiExtract(title, text);
        summary = extracted.summary;
        status = extracted.status;
        category = extracted.category;
      }

      const audience = (entry.category ?? [])
        .map((c) => c.term)
        .filter((t) =>
          ["Rapid Release", "Scheduled Release", "End-user", "Admin console", "Beta"].includes(t),
        );

      const { error } = await supabaseAdmin.from("releases").upsert(
        {
          source: "google",
          source_id: sourceId,
          title,
          description: text.slice(0, 4000),
          summary,
          status,
          category,
          release_date: entry.published.$t.slice(0, 10),
          announced_date: entry.published.$t.slice(0, 10),
          source_url: sourceUrl,
          platforms: [],
          audience,
          raw: entry as never,
        },
        { onConflict: "source,source_id" },
      );
      if (!error) upserted++;
    }

    await supabaseAdmin
      .from("sync_runs")
      .update({ finished_at: new Date().toISOString(), items_upserted: upserted })
      .eq("id", run!.id);
    return { ok: true, upserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("sync_runs")
      .update({ finished_at: new Date().toISOString(), error: msg })
      .eq("id", run!.id);
    return { ok: false, upserted: 0, error: msg };
  }
}