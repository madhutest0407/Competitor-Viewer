import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CATEGORIES, normalizeStatus } from "./categories";
import { XMLParser } from "fast-xml-parser";

// Restrict Microsoft items to Calendar + Mail products only.
const MS_PRODUCT_ALLOW = ["outlook", "exchange", "bookings", "places"];

function isCalendarOrMail(item: {
  title?: string;
  description?: string;
  products?: string[];
}) {
  const products = (item.products ?? []).map((p) => p.toLowerCase());
  if (products.some((p) => MS_PRODUCT_ALLOW.some((k) => p.includes(k)))) return true;
  // Fallback: title mentions Outlook/Exchange/Bookings/Places/Calendar/Mail explicitly
  const t = `${item.title ?? ""}`.toLowerCase();
  return /\b(outlook|exchange|bookings|places|calendar|mail)\b/.test(t);
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

async function aiCategorizeGeneric(
  productName: string,
  title: string,
  description: string,
): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return "Other";
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You output ONLY valid JSON. No prose." },
          {
            role: "user",
            content: `Classify this ${productName} product update into ONE category from: ${CATEGORIES.join(", ")}. If it is not relevant to calendar / mail / scheduling / productivity tools, choose "Other".\nTitle: ${title}\nDescription: ${description.slice(0, 1500)}\nReturn JSON: {"category": "..."}`,
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

type RssItem = {
  id: string;
  title: string;
  link: string;
  description: string;
  published: string | null;
};

function parseFeed(xml: string): RssItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
  });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const items: RssItem[] = [];

  const rss = (doc.rss as { channel?: { item?: unknown } } | undefined)?.channel;
  if (rss && rss.item) {
    const arr = Array.isArray(rss.item) ? rss.item : [rss.item];
    for (const it of arr as Record<string, unknown>[]) {
      const guid =
        typeof it.guid === "string"
          ? it.guid
          : ((it.guid as { "#text"?: string } | undefined)?.["#text"] ?? "");
      const link = typeof it.link === "string" ? it.link : "";
      items.push({
        id: String(guid || link || it.title || Math.random()),
        title: String(it.title ?? "").trim(),
        link,
        description: String(it.description ?? it["content:encoded"] ?? ""),
        published: it.pubDate ? new Date(String(it.pubDate)).toISOString().slice(0, 10) : null,
      });
    }
    return items;
  }

  const feed = doc.feed as { entry?: unknown } | undefined;
  if (feed && feed.entry) {
    const arr = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
    for (const it of arr as Record<string, unknown>[]) {
      const linkRaw = it.link as unknown;
      let link = "";
      if (Array.isArray(linkRaw)) {
        const alt = (linkRaw as Array<Record<string, unknown>>).find(
          (l) => l["@_rel"] === "alternate" || !l["@_rel"],
        );
        link = String(alt?.["@_href"] ?? "");
      } else if (linkRaw && typeof linkRaw === "object") {
        link = String((linkRaw as Record<string, unknown>)["@_href"] ?? "");
      }
      const id = String(it.id ?? link ?? it.title ?? Math.random());
      const title =
        typeof it.title === "string"
          ? it.title
          : String((it.title as { "#text"?: string } | undefined)?.["#text"] ?? "");
      const contentRaw = it.content ?? it.summary;
      const description =
        typeof contentRaw === "string"
          ? contentRaw
          : String((contentRaw as { "#text"?: string } | undefined)?.["#text"] ?? "");
      const pub = it.published ?? it.updated;
      items.push({
        id,
        title: title.trim(),
        link,
        description,
        published: pub ? new Date(String(pub)).toISOString().slice(0, 10) : null,
      });
    }
  }
  return items;
}

export async function syncProductRss(
  productId: string,
  triggeredBy: "cron" | "manual",
): Promise<{ ok: boolean; upserted: number; error?: string; rateLimited?: boolean }> {
  if (triggeredBy === "manual" && !(await rateLimitCheck(productId))) {
    return { ok: false, upserted: 0, rateLimited: true, error: "Rate limited (1 sync per 10 min)" };
  }
  const { data: product, error: pErr } = await supabaseAdmin
    .from("products")
    .select("id,name,feed_url,feed_kind")
    .eq("id", productId)
    .single();
  if (pErr || !product) return { ok: false, upserted: 0, error: pErr?.message ?? "Product not found" };
  if (!product.feed_url) return { ok: false, upserted: 0, error: "No feed_url for product" };

  const { data: run } = await supabaseAdmin
    .from("sync_runs")
    .insert({ source: product.id, triggered_by: triggeredBy })
    .select("id")
    .single();

  try {
    const res = await fetch(product.feed_url, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": "CalRadar/1.0 (+https://calradar.app)",
      },
    });
    if (!res.ok) throw new Error(`Feed ${product.feed_url} ${res.status}`);
    const xml = await res.text();
    const items = parseFeed(xml).slice(0, 100);

    const { data: existingRows } = await supabaseAdmin
      .from("releases")
      .select("source_id, category")
      .eq("source", product.id);
    const existingMap = new Map((existingRows ?? []).map((r) => [r.source_id, r.category]));

    const rows = items.map((it) => {
      const text = stripHtml(it.description);
      return {
        source: product.id,
        source_id: it.id,
        title: it.title || "(untitled)",
        description: text.slice(0, 4000),
        summary: text.slice(0, 240),
        status: "Generally available",
        category: existingMap.get(it.id) ?? null,
        release_date: it.published,
        announced_date: it.published,
        source_url: it.link || null,
        platforms: [],
        audience: [],
        raw: it as never,
      };
    });

    let upserted = 0;
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin
        .from("releases")
        .upsert(chunk, { onConflict: "source,source_id" });
      if (!error) upserted += chunk.length;
    }

    const needsAi = items.filter((it) => !existingMap.get(it.id)).slice(0, 30);
    const AI_BATCH = 5;
    for (let i = 0; i < needsAi.length; i += AI_BATCH) {
      const batch = needsAi.slice(i, i + AI_BATCH);
      const cats = await Promise.all(
        batch.map((it) => aiCategorizeGeneric(product.name, it.title, stripHtml(it.description))),
      );
      await Promise.all(
        batch.map((it, idx) =>
          supabaseAdmin
            .from("releases")
            .update({ category: cats[idx] })
            .eq("source", product.id)
            .eq("source_id", it.id),
        ),
      );
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

    const filtered = body.value.filter(isCalendarOrMail);
    // Load existing rows once so we know which need AI categorization.
    const { data: existingRows } = await supabaseAdmin
      .from("releases")
      .select("source_id, category")
      .eq("source", "microsoft");
    const existingMap = new Map(
      (existingRows ?? []).map((r) => [r.source_id, r.category]),
    );

    // Phase 1: fast upsert of all items without blocking on AI.
    const rows = filtered.map((item) => {
      const sourceId = String(item.id);
      const existingCat = existingMap.get(sourceId);
      const releaseDate =
        parseMonthYear(item.generalAvailabilityDate) ??
        parseMonthYear(item.previewAvailabilityDate);
      const announcedDate = item.created ? item.created.slice(0, 10) : null;
      return {
        source: "microsoft",
        source_id: sourceId,
        title: item.title,
        description: item.description,
        summary: item.description?.slice(0, 280) ?? null,
        status: normalizeStatus(item.status),
        category: existingCat ?? null,
        release_date: releaseDate,
        announced_date: announcedDate,
        source_url: `https://www.microsoft.com/microsoft-365/roadmap?id=${item.id}`,
        platforms: item.platforms ?? [],
        audience: item.cloudInstances ?? [],
        raw: item as never,
      };
    });

    let upserted = 0;
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin
        .from("releases")
        .upsert(chunk, { onConflict: "source,source_id" });
      if (!error) upserted += chunk.length;
    }

    // Phase 2: categorize a bounded set of uncategorized items in parallel.
    const needsAi = filtered.filter(
      (it) => !existingMap.get(String(it.id)),
    ).slice(0, 40);
    const AI_BATCH = 5;
    for (let i = 0; i < needsAi.length; i += AI_BATCH) {
      const batch = needsAi.slice(i, i + AI_BATCH);
      const cats = await Promise.all(
        batch.map((it) => aiCategorizeMs(it.title, it.description ?? "")),
      );
      await Promise.all(
        batch.map((it, idx) =>
          supabaseAdmin
            .from("releases")
            .update({ category: cats[idx] })
            .eq("source", "microsoft")
            .eq("source_id", String(it.id)),
        ),
      );
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
    type GEntry = {
      id: { $t: string };
      title: { $t: string };
      published: { $t: string };
      updated: { $t: string };
      content: { $t: string };
      link: Array<{ rel: string; href: string }>;
      category?: Array<{ term: string }>;
    };
    // Google Workspace Updates uses labels "Google Calendar" and "Gmail".
    // Paginate via start-index (feed caps max-results at 150).
    const labels = ["Google Calendar", "Gmail"];
    const entries: GEntry[] = [];
    const seen = new Set<string>();
    const PAGE = 150;
    const MAX_PAGES = 4; // up to 600 posts per label
    for (const label of labels) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const start = page * PAGE + 1;
        const url = `https://workspaceupdates.googleblog.com/feeds/posts/default/-/${encodeURIComponent(label)}?alt=json&max-results=${PAGE}&start-index=${start}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`Google feed (${label}) ${res.status}`);
        const body = (await res.json()) as { feed?: { entry?: GEntry[] } };
        const pageEntries = body.feed?.entry ?? [];
        let added = 0;
        for (const e of pageEntries) {
          const id = e.id.$t;
          if (seen.has(id)) continue;
          seen.add(id);
          entries.push(e);
          added++;
        }
        if (pageEntries.length < PAGE) break; // last page
        if (added === 0) break; // nothing new
      }
    }

    // Load existing rows once.
    const { data: existingRows } = await supabaseAdmin
      .from("releases")
      .select("source_id, category, summary, status")
      .eq("source", "google");
    const existingMap = new Map(
      (existingRows ?? []).map((r) => [r.source_id, r]),
    );

    // Phase 1: fast upsert with fallback values for new items.
    const rows = entries.map((entry) => {
      const sourceId = entry.id.$t;
      const existing = existingMap.get(sourceId);
      const altLink = entry.link.find((l) => l.rel === "alternate");
      const sourceUrl = altLink?.href ?? "";
      const text = stripHtml(entry.content.$t);
      const title = entry.title.$t;
      const audience = (entry.category ?? [])
        .map((c) => c.term)
        .filter((t) =>
          ["Rapid Release", "Scheduled Release", "End-user", "Admin console", "Beta"].includes(t),
        );
      return {
        source: "google",
        source_id: sourceId,
        title,
        description: text.slice(0, 4000),
        summary: existing?.summary ?? text.slice(0, 240),
        status: existing?.status ?? "Rolling out",
        category: existing?.category ?? null,
        release_date: entry.published.$t.slice(0, 10),
        announced_date: entry.published.$t.slice(0, 10),
        source_url: sourceUrl,
        platforms: [],
        audience,
        raw: entry as never,
      };
    });

    let upserted = 0;
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin
        .from("releases")
        .upsert(chunk, { onConflict: "source,source_id" });
      if (!error) upserted += chunk.length;
    }

    // Phase 2: AI-extract summary/status/category for a bounded set of new items.
    const needsAi = entries
      .filter((e) => !existingMap.get(e.id.$t)?.category)
      .slice(0, 30);
    const AI_BATCH = 5;
    for (let i = 0; i < needsAi.length; i += AI_BATCH) {
      const batch = needsAi.slice(i, i + AI_BATCH);
      const results = await Promise.all(
        batch.map((entry) =>
          aiExtract(entry.title.$t, stripHtml(entry.content.$t)),
        ),
      );
      await Promise.all(
        batch.map((entry, idx) =>
          supabaseAdmin
            .from("releases")
            .update({
              summary: results[idx].summary,
              status: results[idx].status,
              category: results[idx].category,
            })
            .eq("source", "google")
            .eq("source_id", entry.id.$t),
        ),
      );
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