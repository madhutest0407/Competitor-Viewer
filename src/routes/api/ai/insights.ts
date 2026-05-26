import { createFileRoute } from "@tanstack/react-router";

interface InsightRequest {
  products: Array<{ name: string; color: string }>;
  releases: Array<{
    title: string;
    category: string;
    status: string;
    source: string;
  }>;
  quarter: string;
  variant: "timeline" | "gaps";
}

interface Insight {
  text: string;
  type: "threat" | "opportunity" | "trend";
}

interface InsightResponse {
  insights: Insight[];
  generatedAt?: string;
}

const cache = new Map<
  string,
  { insights: Insight[]; timestamp: number }
>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function getCacheKey(
  variant: string,
  products: string[],
  quarter: string,
) {
  return `insights_${variant}_${products.sort().join(",")}_.${quarter}`;
}

type AiResult =
  | { ok: true; insights: Insight[] }
  | { ok: false; status: number; message: string };

async function callLovableAI(prompt: string): Promise<AiResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    return { ok: false, status: 500, message: "AI is not configured for this project." };
  }

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
          {
            role: "system",
            content:
              "You are a product strategy analyst. Output ONLY valid JSON. No prose, no markdown, no extra text.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (res.status === 429) {
      return { ok: false, status: 429, message: "AI rate limit reached. Try again in a minute." };
    }
    if (res.status === 402) {
      return { ok: false, status: 402, message: "AI credits exhausted. Add credits in Workspace settings." };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, message: `AI gateway ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}` };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content ?? "[]";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return { ok: true, insights: [] };

    const insights = parsed.slice(0, 3).map((item: unknown) => {
      const obj = item as Record<string, unknown>;
      return {
        text: String(obj.text ?? "").slice(0, 200) || "",
        type: ["threat", "opportunity", "trend"].includes(
          String(obj.type),
        )
          ? (String(obj.type) as "threat" | "opportunity" | "trend")
          : "trend",
      };
    });
    return { ok: true, insights };
  } catch (err) {
    console.warn("callLovableAI failed", err);
    return {
      ok: false,
      status: 500,
      message: err instanceof Error ? err.message : "AI call failed",
    };
  }
}

function buildTimelinePrompt(
  products: Array<{ name: string }>,
  releases: Array<{ title: string; category: string; source: string }>,
  quarter: string,
): string {
  const categoryStats: Record<string, number> = {};
  const sourceStats: Record<string, number> = {};

  for (const r of releases) {
    categoryStats[r.category] = (categoryStats[r.category] ?? 0) + 1;
    sourceStats[r.source] = (sourceStats[r.source] ?? 0) + 1;
  }

  const topCategories = Object.entries(categoryStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, count]) => `${cat} (${count})`)
    .join(", ");

  const topSources = products
    .map((p) => `${p.name} (${sourceStats[p.name] ?? 0} releases)`)
    .join(", ");

  return `Analyze these Q${quarter} product releases and provide 2-3 strategic market insights.

Active Products: ${topSources}
Top categories this quarter: ${topCategories || "None"}
Sample releases: ${releases.slice(0, 5).map((r) => r.title).join("; ")}

Provide 2-3 insights (exactly one sentence each) about:
- Key competitive threats or opportunities
- Market investment trends (which areas competitors are focusing on)
- Notable strategic moves worth attention

Return JSON array with objects: { text: "insight (one sentence)", type: "threat" | "opportunity" | "trend" }`;
}

function buildGapsPrompt(
  releases: Array<{
    title: string;
    category: string;
    source: string;
  }>,
  products: Array<{ name: string }>,
): string {
  const categoryStats: Record<string, Set<string>> = {};

  for (const r of releases) {
    if (!categoryStats[r.category]) categoryStats[r.category] = new Set();
    categoryStats[r.category].add(r.source);
  }

  const strongCategories = Object.entries(categoryStats)
    .filter(([, sources]) => sources.size === products.length)
    .map(([cat]) => cat)
    .slice(0, 3)
    .join(", ");

  const weakCategories = Object.entries(categoryStats)
    .filter(([, sources]) => sources.size < products.length)
    .map(([cat]) => cat)
    .slice(0, 3)
    .join(", ");

  return `Based on competitor releases, provide 2-3 strategic recommendations.

Products: ${products.map((p) => p.name).join(", ")}
Where all competitors are strong: ${strongCategories || "None"}
Where gaps exist: ${weakCategories || "None"}

Provide 2-3 recommendations (exactly one sentence each) for:
- Feature categories to prioritize
- Competitive gaps worth addressing
- Market opportunities to capture

Return JSON array with objects: { text: "recommendation (one sentence)", type: "threat" | "opportunity" | "trend" }`;
}

export const Route = createFileRoute("/api/ai/insights")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as InsightRequest;

        const { products, releases, quarter, variant } = body;
        if (!variant || !["timeline", "gaps"].includes(variant)) {
          return Response.json(
            { error: "Missing or invalid variant" },
            { status: 400 },
          );
        }

        const productNames = products.map((p) => p.name);
        const cacheKey = getCacheKey(variant, productNames, quarter);
        const cached = cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          return Response.json({ insights: cached.insights });
        }

        let prompt: string;
        if (variant === "timeline") {
          prompt = buildTimelinePrompt(products, releases, quarter);
        } else {
          prompt = buildGapsPrompt(releases, products);
        }

        const result = await callLovableAI(prompt);
        if (!result.ok) {
          return Response.json(
            { insights: [], error: result.message },
            { status: result.status },
          );
        }
        if (result.insights.length > 0) {
          cache.set(cacheKey, { insights: result.insights, timestamp: Date.now() });
        }
        return Response.json({ insights: result.insights } as InsightResponse);
      },
    },
  },
});
