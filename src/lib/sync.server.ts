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

/**
 * Fallback date resolution: scan the raw HTML for date markers (datetime
 * attributes, itemprop="datePublished", visible "July 24, 2026" strings) and
 * map each one to the nearby text so an extracted entry title can be matched
 * back to its publish date when the model returns null.
 */
function buildDateWindows(html: string): Array<{ date: string; text: string }> {
  const windows: Array<{ date: string; text: string }> = [];
  const patterns = [
    /datetime=["']([^"']+)["']/gi,
    /itemprop=["']datePublished["'][^>]*content=["']([^"']+)["']/gi,
    />\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4})\s*</gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const date = parseLooseDate(m[1]);
      if (!date) continue;
      const from = Math.max(0, m.index - 4000);
      const to = Math.min(html.length, m.index + 4000);
      windows.push({ date, text: stripHtml(html.slice(from, to)).toLowerCase() });
    }
  }
  return windows;
}

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveDateForTitle(
  title: string,
  windows: Array<{ date: string; text: string }>,
): string | null {
  const norm = normalizeTitle(title);
  if (norm.length < 4) return null;
  const words = norm.split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return null;
  let best: { date: string; score: number } | null = null;
  for (const w of windows) {
    const flat = normalizeTitle(w.text);
    if (flat.includes(norm)) return w.date;
    const score = words.filter((word) => flat.includes(word)).length / words.length;
    if (score >= 0.8 && (!best || score > best.score)) best = { date: w.date, score };
  }
  return best?.date ?? null;
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

/**
 * Filter blog posts to include only feature releases, enhancements, and new product announcements.
 * VERY AGGRESSIVE - only keep posts that are clearly about product features/updates.
 */
function isRelevantBlogPost(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toLowerCase();
  const titleLower = title.toLowerCase();

  // ALWAYS EXCLUDE these - strong indicators of non-feature content
  // Be very aggressive with exclusions
  const excludePatterns = [
    /\b(blog|news|press release|interview|press)\b/i,
    /\b(tips|tricks|guide|how[- ]?to|tutorial|walkthrough)\b/i,
    /\b(case study|customer story|webinar|podcast|video|vlog)\b/i,
    /\b(event|conference|summit|trade show|speaking|speaker|talk)\b/i,
    /\b(security[- ]?fix|bug[- ]?fix|patch|hotfix|vulnerability|security|breach)\b/i,
    /\b(job|hiring|career|recruiting|company growth|company news|company update)\b/i,
    /\b(report|study|benchmark|survey|research|whitepaper|ebook)\b/i,
    /\b(partnership|acquisition|funding|investment|board|cto|ceo|executive)\b/i,
    /\b(best[- ]?practice|trend|thought|leadership|opinion|analysis)\b/i,
    /\b(privacy|data|gdpr|compliance|legal|tos|policy)\b/i,
  ];

  if (excludePatterns.some(pattern => pattern.test(combined))) {
    return false;
  }

  // MUST have strong product/feature indicators - very strict
  const featurePatterns = [
    /\b(new feature|feature release|product feature)\b/i,
    /\b(introducing|announce[d]?|launch[ed]?)\b.*\b(feature|product|update|capability)\b/i,
    /\b(available now|now available|coming soon|rolling out)\b/i,
    /\b(enhancement|enhancement|improvement|improved|improve)\b.*\b(feature|product)\b/i,
  ];

  const hasFeaturePattern = featurePatterns.some(pattern => pattern.test(combined));

  // Also check title starts with feature-like terms
  const titleStartsWithFeature = /^(new|introducing|announcing|available|launching|released|update|feature)[\s\-:]/i.test(titleLower);

  // Must match at least one feature pattern AND be substantive (not just a headline)
  return hasFeaturePattern && (titleStartsWithFeature || description.length > 50);
}

function safeHttpUrl(u: string | null | undefined): string | null {
  if (!u || typeof u !== "string") return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
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

// ---------------------------------------------------------------------------
// Changelog HTML adapter — for products that publish release notes as an
// HTML page (Mailgun, Resend, Brevo, Mailjet, Postmark, Twilio SendGrid) and
// don't offer a usable RSS/Atom feed. We fetch the page with a browser UA,
// strip scripts/styles, then ask the AI Gateway to extract structured entries
// (feature / api / enhancement / fix only — no marketing).
// ---------------------------------------------------------------------------

type ChangelogEntry = {
  title: string;
  description: string;
  date: string | null;
  href: string | null;
  kind: string;
};

/**
 * Some changelogs (Superhuman) only carry the publish date in a `datetime`
 * attribute or in JSON embedded in the markup, so plain tag-stripping loses it.
 * Surface those dates as visible text before stripping.
 */
function stripHtmlKeepDates(html: string): string {
  const withDates = html.replace(
    /<([a-z0-9]+)([^>]*?)\sdatetime=["']([^"']+)["']([^>]*)>/gi,
    (_m, tag, a, dt, b) => `<${tag}${a}${b}> ${dt} `,
  );
  return stripHtml(withDates);
}

/** Accepts "2026-07-24", "July 24, 2026", "24 Jul 2026", "2026/07/24". */
function parseLooseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = s.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    if (y > 2000 && y < 2100) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

async function aiExtractChangelogOnce(
  productName: string,
  pageUrl: string,
  pageText: string,
  relaxed: boolean,
): Promise<ChangelogEntry[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return [];
  const strictRules = `STRICT rules:
- Include ONLY product release notes: new features, API additions/changes, enhancements, bug fixes.
- REJECT and skip: marketing posts, webinars, case studies, customer stories,
  hiring/company/partnership news, pricing or plan announcements, generic
  "best practices" or "guide" blog articles, event/conference recaps.
- Skip entries whose title or description cannot be identified.
- Max 40 entries. If page contains no release notes, return [].`;
  const relaxedRules = `Rules:
- Extract EVERY product update entry listed on the page, in page order.
- Skip only obvious navigation, footer, pricing and careers content.
- Max 40 entries.`;
  const prompt = `You are extracting release notes from the ${productName} changelog page (${pageUrl}).

Return ONLY a JSON array (no prose, no markdown fences). Each entry has:
- title: short, imperative (e.g. "Add webhook retry policy")
- description: 1-2 sentence summary of the change
- date: ISO date "YYYY-MM-DD". Convert any date shown near the entry
  (e.g. "July 24, 2026") to ISO. Use null ONLY when no date appears at all.
- href: absolute URL to the entry if present, else null
- kind: one of "feature" | "api" | "enhancement" | "fix"

${relaxed ? relaxedRules : strictRules}

Page content:
${pageText.slice(0, 40000)}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You output ONLY a valid JSON array. No prose, no markdown fences." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`aiExtractChangelog ${productName} AI ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    let text = (json.choices?.[0]?.message?.content ?? "[]").trim();
    text = text.replace(/```json|```/g, "").trim();
    // Tolerate stray prose: slice from first "[" to last "]".
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r): ChangelogEntry | null => {
        if (!r || typeof r !== "object") return null;
        const o = r as Record<string, unknown>;
        const title = typeof o.title === "string" ? o.title.trim() : "";
        if (!title) return null;
        const description = typeof o.description === "string" ? o.description.trim() : "";
        const date = parseLooseDate(typeof o.date === "string" ? o.date : null);
        const href = typeof o.href === "string" ? safeHttpUrl(o.href) : null;
        const kind = typeof o.kind === "string" ? o.kind.toLowerCase() : "feature";
        return { title, description, date, href, kind };
      })
      .filter((r): r is ChangelogEntry => r !== null)
      .slice(0, 60);
  } catch (err) {
    console.warn(`aiExtractChangelog ${productName} failed`, err);
    return [];
  }
}

/**
 * Extract entries with the strict release-notes prompt; if the model rejects
 * the whole page (some vendors write updates in a narrative voice), retry once
 * with a relaxed prompt so real releases are not silently dropped.
 */
async function aiExtractChangelog(
  productName: string,
  pageUrl: string,
  pageText: string,
): Promise<ChangelogEntry[]> {
  const strict = await aiExtractChangelogOnce(productName, pageUrl, pageText, false);
  if (strict.length > 0) return strict;
  return aiExtractChangelogOnce(productName, pageUrl, pageText, true);
}

// Rough marketing filter as a belt-and-braces pass after the AI extraction,
// in case the model lets something slip through.
function looksLikeMarketing(title: string, description: string): boolean {
  const t = `${title} ${description}`.toLowerCase();
  return /\b(webinar|case study|customer story|guide to|best practice|hiring|we're hiring|partnership|acquires|acquisition|funding|series [abc]|ebook|whitepaper|conference|summit)\b/.test(
    t,
  );
}

export async function syncProductChangelog(
  productId: string,
  triggeredBy: "cron" | "manual",
): Promise<{ ok: boolean; upserted: number; error?: string; rateLimited?: boolean }> {
  if (triggeredBy === "manual" && !(await rateLimitCheck(productId))) {
    return { ok: false, upserted: 0, rateLimited: true, error: "Rate limited (max 5 syncs per 10 minutes)" };
  }
  const { data: product, error: pErr } = await supabaseAdmin
    .from("products")
    .select("id,name,feed_url")
    .eq("id", productId)
    .single();
  if (pErr || !product) return { ok: false, upserted: 0, error: pErr?.message ?? "Product not found" };
  const pageUrl = safeHttpUrl(product.feed_url);
  if (!pageUrl) return { ok: false, upserted: 0, error: "No changelog URL configured" };

  const { data: run } = await supabaseAdmin
    .from("sync_runs")
    .insert({ source: product.id, triggered_by: triggeredBy, status: "pending" })
    .select("id")
    .single();

  try {
    const res = await fetch(pageUrl, {
      headers: {
        // Some vendors (Mailgun, Mailjet) 403 non-browser UAs.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`Changelog ${pageUrl} ${res.status}`);
    const html = await res.text();
    const text = stripHtmlKeepDates(html);
    if (text.length < 500) {
      throw new Error(
        `Changelog page rendered too little text (${text.length} chars) — likely JS-only. Consider a different URL.`,
      );
    }

    const extracted = await aiExtractChangelog(product.name, pageUrl, text);
    const dateWindows = buildDateWindows(html);
    const items = extracted
      .filter((e) => !looksLikeMarketing(e.title, e.description))
      .map((e) => (e.date ? e : { ...e, date: resolveDateForTitle(e.title, dateWindows) }))
      .slice(0, 60);

    const { data: existingRows } = await supabaseAdmin
      .from("releases")
      .select("source_id, category")
      .eq("source", product.id);
    const existingMap = new Map((existingRows ?? []).map((r) => [r.source_id, r.category]));

    // Stable id from the title alone, so a later run that resolves a missing
    // date updates the existing row instead of creating a duplicate.
    const makeId = (e: ChangelogEntry) => normalizeTitle(e.title).slice(0, 120);

    const rows = items.map((e) => {
      const id = makeId(e);
      return {
        source: product.id,
        source_id: id,
        title: e.title,
        description: e.description.slice(0, 4000),
        summary: e.description.slice(0, 240),
        status: "Generally available",
        category: existingMap.get(id) ?? null,
        release_date: e.date,
        announced_date: e.date,
        source_url: e.href ?? pageUrl,
        platforms: [],
        audience: [e.kind],
        raw: e as never,
      };
    });

    let newItemsCount = 0;
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const newInChunk = chunk.filter((r) => !existingMap.has(r.source_id)).length;
      const { error } = await supabaseAdmin
        .from("releases")
        .upsert(chunk, { onConflict: "source,source_id" });
      if (error) throw new Error(`upsert failed: ${error.message}`);
      newItemsCount += newInChunk;
    }

    // Phase 2: reuse the generic categorizer to place items into the app's
    // taxonomy (Delivery / Auth / Templates / etc.).
    const needsAi = rows.filter((r) => !existingMap.get(r.source_id)).slice(0, 30);
    const AI_BATCH = 5;
    for (let i = 0; i < needsAi.length; i += AI_BATCH) {
      const batch = needsAi.slice(i, i + AI_BATCH);
      const cats = await Promise.all(
        batch.map((r) => aiCategorizeGeneric(product.name, r.title, r.description)),
      );
      await Promise.all(
        batch.map((r, idx) =>
          supabaseAdmin
            .from("releases")
            .update({ category: cats[idx] })
            .eq("source", product.id)
            .eq("source_id", r.source_id),
        ),
      );
    }

    await supabaseAdmin
      .from("sync_runs")
      .update({ finished_at: new Date().toISOString(), items_upserted: newItemsCount, status: "success" })
      .eq("id", run!.id);
    return { ok: true, upserted: newItemsCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("sync_runs")
      .update({ finished_at: new Date().toISOString(), error: msg, status: "failed" })
      .eq("id", run!.id);
    return { ok: false, upserted: 0, error: msg };
  }
}

/**
 * Dispatcher — pick the right adapter for a product id. Google/Microsoft
 * remain hard-coded (they have bespoke sources); everything else routes by
 * the product's `feed_kind` column.
 */
export async function syncProduct(
  productId: string,
  triggeredBy: "cron" | "manual",
): Promise<{ ok: boolean; upserted: number; error?: string; rateLimited?: boolean }> {
  if (productId === "google") return syncGoogle(triggeredBy);
  if (productId === "microsoft") return syncMicrosoft(triggeredBy);
  const { data: product } = await supabaseAdmin
    .from("products")
    .select("feed_kind")
    .eq("id", productId)
    .single();
  if (product?.feed_kind === "changelog_html") return syncProductChangelog(productId, triggeredBy);
  return syncProductRss(productId, triggeredBy);
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
    return { ok: false, upserted: 0, rateLimited: true, error: "Rate limited (max 5 syncs per 10 minutes)" };
  }
  const { data: product, error: pErr } = await supabaseAdmin
    .from("products")
    .select("id,name,feed_url,feed_kind")
    .eq("id", productId)
    .single();
  if (pErr || !product) return { ok: false, upserted: 0, error: pErr?.message ?? "Product not found" };
  if (!product.feed_url) return { ok: false, upserted: 0, error: "No feed_url for product" };

  try {
    new URL(product.feed_url);
  } catch {
    return { ok: false, upserted: 0, error: `Invalid feed URL: "${product.feed_url}". Set a full URL (starting with https://) for this product.` };
  }

  const { data: run, error: insertError } = await supabaseAdmin
    .from("sync_runs")
    .insert({ source: product.id, triggered_by: triggeredBy, status: "pending" })
    .select("id")
    .single();

  if (insertError || !run) {
    const errMsg = insertError?.message ?? "Failed to create sync_runs record";
    console.error(`${product.id} sync_runs INSERT failed:`, errMsg);
    return { ok: false, upserted: 0, error: errMsg };
  }

  try {
    const res = await fetch(product.feed_url, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": "PM Radar/1.0 (+https://calradar.app)",
      },
    });
    if (!res.ok) throw new Error(`Feed ${product.feed_url} ${res.status}`);
    const xml = await res.text();
    const allItems = parseFeed(xml);

    // Filter to only relevant blog posts (features, enhancements, announcements)
    // For products like Proton, Superhuman, Falstmail that have blog feeds
    // Skip filtering for Notion (official releases) and other known curated feeds
    const shouldFilterBlogPosts = !['notion'].includes(product.id);

    const items = allItems
      .filter(it => {
        if (!shouldFilterBlogPosts) return true; // Don't filter Notion items
        const cleanDescription = stripHtml(it.description);
        return isRelevantBlogPost(it.title, cleanDescription);
      })
      .slice(0, 100);

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
        source_url: safeHttpUrl(it.link),
        platforms: [],
        audience: [],
        raw: it as never,
      };
    });

    // Count only NEW items (not updates to existing items)
    let newItemsCount = 0;
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      // Count how many items in this chunk are actually new (not already in database)
      const newInChunk = chunk.filter((item) => !existingMap.has(item.source_id)).length;

      const { error } = await supabaseAdmin
        .from("releases")
        .upsert(chunk, { onConflict: "source,source_id" });
      if (error) {
        console.error(`[syncProductRss:${product.id}] upsert error`, error);
        throw new Error(`upsert failed: ${error.message}`);
      }
      newItemsCount += newInChunk;
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
      .update({ finished_at: new Date().toISOString(), items_upserted: newItemsCount, status: "success" })
      .eq("id", run.id);
    return { ok: true, upserted: newItemsCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (run?.id) {
      await supabaseAdmin
        .from("sync_runs")
        .update({ finished_at: new Date().toISOString(), error: msg, status: "failed" })
        .eq("id", run.id);
    }
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
    .limit(5); // Check last 5 syncs
  if (!data || data.length < 5) return true; // Allow if less than 5 recent syncs
  const oldest = new Date(data[4].started_at).getTime(); // 5th sync (oldest in last 5)
  return Date.now() - oldest > 10 * 60 * 1000; // 10 minutes
}

export async function syncMicrosoft(triggeredBy: "cron" | "manual"): Promise<{
  ok: boolean;
  upserted: number;
  error?: string;
  rateLimited?: boolean;
}> {
  if (triggeredBy === "manual" && !(await rateLimitCheck("microsoft"))) {
    return { ok: false, upserted: 0, rateLimited: true, error: "Rate limited (max 5 syncs per 10 minutes)" };
  }
  const { data: run, error: insertError } = await supabaseAdmin
    .from("sync_runs")
    .insert({ source: "microsoft", triggered_by: triggeredBy, status: "pending" })
    .select("id")
    .single();

  if (insertError || !run) {
    const errMsg = insertError?.message ?? "Failed to create sync_runs record";
    console.error("Microsoft sync_runs INSERT failed:", errMsg);
    return { ok: false, upserted: 0, error: errMsg };
  }

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

    // Count only NEW items (not updates to existing items)
    let newItemsCount = 0;
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      // Count how many items in this chunk are actually new (not already in database)
      const newInChunk = chunk.filter((item) => !existingMap.has(String(item.source_id))).length;

      const { error } = await supabaseAdmin
        .from("releases")
        .upsert(chunk, { onConflict: "source,source_id" });
      if (!error) newItemsCount += newInChunk;
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
      .update({ finished_at: new Date().toISOString(), items_upserted: newItemsCount, status: "success" })
      .eq("id", run.id);
    return { ok: true, upserted: newItemsCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (run?.id) {
      await supabaseAdmin
        .from("sync_runs")
        .update({ finished_at: new Date().toISOString(), error: msg, status: "failed" })
        .eq("id", run.id);
    }
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
    return { ok: false, upserted: 0, rateLimited: true, error: "Rate limited (max 5 syncs per 10 minutes)" };
  }
  const { data: run, error: insertError } = await supabaseAdmin
    .from("sync_runs")
    .insert({ source: "google", triggered_by: triggeredBy, status: "pending" })
    .select("id")
    .single();

  if (insertError || !run) {
    const errMsg = insertError?.message ?? "Failed to create sync_runs record";
    console.error("Google sync_runs INSERT failed:", errMsg);
    return { ok: false, upserted: 0, error: errMsg };
  }

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
    // Google Workspace Updates covers all products: Calendar, Gmail, Meet, Chat, Drive, Docs, Sheets, Slides, Forms, Workspace, etc.
    // Paginate via start-index (feed caps max-results at 150).
    const labels = [
      "Google Calendar",
      "Gmail",
      "Google Meet",
      "Google Meet Hardware",
      "Google Chat",
      "Google Drive",
      "Google Docs",
      "Google Sheets",
      "Google Slides",
      "Google Forms",
      "Google Workspace",
      "Google Keep",
      "Google Sites",
      "Google Tasks",
    ];
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
        let pageEntries: GEntry[] = [];
        try {
          const body = (await res.json()) as { feed?: { entry?: GEntry[] } };
          pageEntries = body.feed?.entry ?? [];
        } catch (parseErr) {
          console.warn(`Failed to parse Google feed (${label}) page ${page}:`, parseErr);
          break;
        }
        let added = 0;
        for (const e of pageEntries) {
          try {
            const id = e.id?.$t;
            if (!id) continue;
            if (seen.has(id)) continue;
            seen.add(id);
            entries.push(e);
            added++;
          } catch (entryErr) {
            console.warn(`Failed to process Google entry:`, entryErr);
            continue;
          }
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
    const mapped = entries.map((entry) => {
        try {
          const sourceId = entry.id?.$t;
          if (!sourceId) return null;
          const existing = existingMap.get(sourceId);
          const altLink = entry.link?.find((l) => l.rel === "alternate");
          const sourceUrl = altLink?.href ?? "";
          const text = stripHtml(entry.content?.$t ?? "");
          const title = entry.title?.$t ?? "(No title)";
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
            release_date: entry.published?.$t?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
            announced_date: entry.published?.$t?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
            source_url: safeHttpUrl(sourceUrl),
            platforms: [],
            audience,
            raw: entry as never,
          };
        } catch (mapErr) {
          console.warn(`Failed to map Google entry:`, mapErr);
          return null;
        }
      });
    const rows = mapped.filter(
      (r): r is NonNullable<(typeof mapped)[number]> => r !== null,
    );

    // Count only NEW items (not updates to existing items)
    let newItemsCount = 0;
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      // Count how many items in this chunk are actually new (not already in database)
      const newInChunk = chunk.filter((item) => !existingMap.has(item.source_id)).length;

      const { error } = await supabaseAdmin
        .from("releases")
        .upsert(chunk, { onConflict: "source,source_id" });
      if (!error) newItemsCount += newInChunk;
    }

    // Phase 2: AI-extract summary/status/category for a bounded set of new items.
    const needsAi = entries
      .filter((e) => {
        const id = e.id?.$t;
        return id && !existingMap.get(id)?.category;
      })
      .slice(0, 30);
    const AI_BATCH = 5;
    for (let i = 0; i < needsAi.length; i += AI_BATCH) {
      const batch = needsAi.slice(i, i + AI_BATCH);
      const results = await Promise.all(
        batch.map((entry) =>
          aiExtract(entry.title?.$t ?? "", stripHtml(entry.content?.$t ?? "")),
        ),
      );
      await Promise.all(
        batch.map((entry, idx) => {
          const sourceId = entry.id?.$t;
          if (!sourceId) return Promise.resolve();
          return supabaseAdmin
            .from("releases")
            .update({
              summary: results[idx].summary,
              status: results[idx].status,
              category: results[idx].category,
            })
            .eq("source", "google")
            .eq("source_id", sourceId);
        }),
      );
    }

    await supabaseAdmin
      .from("sync_runs")
      .update({ finished_at: new Date().toISOString(), items_upserted: newItemsCount, status: "success" })
      .eq("id", run.id);
    return { ok: true, upserted: newItemsCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (run?.id) {
      await supabaseAdmin
        .from("sync_runs")
        .update({ finished_at: new Date().toISOString(), error: msg, status: "failed" })
        .eq("id", run.id);
    }
    return { ok: false, upserted: 0, error: msg };
  }
}