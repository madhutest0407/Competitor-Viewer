import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FilterState } from "@/components/Filters";

export type Release = {
  id: string;
  source: "google" | "microsoft";
  source_id: string;
  title: string;
  description: string | null;
  summary: string | null;
  status: string | null;
  category: string | null;
  release_date: string | null;
  announced_date: string | null;
  source_url: string | null;
  platforms: string[] | null;
  audience: string[] | null;
  updated_at: string;
};

export function useReleases() {
  return useQuery({
    queryKey: ["releases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("releases")
        .select(
          "id,source,source_id,title,description,summary,status,category,release_date,announced_date,source_url,platforms,audience,updated_at",
        )
        .order("release_date", { ascending: true, nullsFirst: false })
        .limit(1000);
      if (error) throw new Error(error.message);
      return (data ?? []) as Release[];
    },
  });
}

export function applyFilters(rows: Release[], f: FilterState): Release[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (r.source === "google" && !f.vendor.google) return false;
    if (r.source === "microsoft" && !f.vendor.microsoft) return false;
    if (r.status && !f.statuses.has(r.status)) return false;
    if (r.category && !f.categories.has(r.category)) return false;
    if (q && !(r.title.toLowerCase().includes(q) || (r.summary ?? "").toLowerCase().includes(q)))
      return false;
    return true;
  });
}

export function quarterOf(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${q} ${d.getUTCFullYear()}`;
}

export function quartersWindow(): string[] {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const out: string[] = [];
  for (let i = -4; i <= 4; i++) {
    const totalQ = q + i;
    const yr = now.getUTCFullYear() + Math.floor(totalQ / 4);
    const qq = ((totalQ % 4) + 4) % 4;
    out.push(`Q${qq + 1} ${yr}`);
  }
  return out;
}