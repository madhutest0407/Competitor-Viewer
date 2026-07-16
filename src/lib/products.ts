import { useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Product = {
  id: string;
  name: string;
  description: string | null;
  feed_kind: string;
  feed_url: string | null;
  default_enabled: boolean;
  color: string;
  sort_order: number;
  category: SectionId;
};

export type SectionId = "collaboration" | "transactional_email";
export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "collaboration", label: "Collaboration Products" },
  { id: "transactional_email", label: "Transactional Email" },
];

const LS_ACTIVE_KEY = "calradar.activeProducts";
const LS_SECTION_KEY = "calradar.activeSection";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Product[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ---------- Shared stores ----------
// Per-section active-product ids so switching sections keeps each side's picks.
type SectionMap = Record<SectionId, Set<string>>;
type Listener = () => void;

function emptyMap(): SectionMap {
  return { collaboration: new Set(), transactional_email: new Set() };
}

function readActiveLs(): SectionMap {
  if (typeof window === "undefined") return emptyMap();
  try {
    const raw = window.localStorage.getItem(LS_ACTIVE_KEY);
    if (!raw) return emptyMap();
    const parsed = JSON.parse(raw);
    // migrate old flat array format → collaboration section
    if (Array.isArray(parsed)) {
      return { collaboration: new Set(parsed as string[]), transactional_email: new Set() };
    }
    return {
      collaboration: new Set(parsed?.collaboration ?? []),
      transactional_email: new Set(parsed?.transactional_email ?? []),
    };
  } catch {
    return emptyMap();
  }
}
function writeActiveLs(m: SectionMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    LS_ACTIVE_KEY,
    JSON.stringify({
      collaboration: Array.from(m.collaboration),
      transactional_email: Array.from(m.transactional_email),
    }),
  );
}

let activeStore: SectionMap | null = null;
const activeListeners = new Set<Listener>();
function getActive(): SectionMap {
  if (activeStore === null) activeStore = readActiveLs();
  return activeStore;
}
function setActive(next: SectionMap) {
  activeStore = next;
  writeActiveLs(next);
  activeListeners.forEach((l) => l());
}
function subscribeActive(l: Listener) {
  activeListeners.add(l);
  return () => activeListeners.delete(l);
}
function snapshotActive() {
  return getActive();
}

// Active section shared store
function readSectionLs(): SectionId {
  if (typeof window === "undefined") return "collaboration";
  const v = window.localStorage.getItem(LS_SECTION_KEY);
  return v === "transactional_email" ? "transactional_email" : "collaboration";
}
let sectionStore: SectionId | null = null;
const sectionListeners = new Set<Listener>();
function getSection(): SectionId {
  if (sectionStore === null) sectionStore = readSectionLs();
  return sectionStore;
}
function setSection(next: SectionId) {
  sectionStore = next;
  if (typeof window !== "undefined") window.localStorage.setItem(LS_SECTION_KEY, next);
  sectionListeners.forEach((l) => l());
}
function subscribeSection(l: Listener) {
  sectionListeners.add(l);
  return () => sectionListeners.delete(l);
}
function snapshotSection() {
  return getSection();
}

/** Read + set the currently-viewed section. Persisted in localStorage. */
export function useActiveSection() {
  const section = useSyncExternalStore(subscribeSection, snapshotSection, snapshotSection);
  return { section, setSection };
}

/**
 * Active products, scoped to the currently-selected section. Preferences are
 * persisted in localStorage per section, so switching between Collaboration
 * and Transactional Email preserves each side's picks.
 */
export function useActiveProductIds() {
  const productsQ = useProducts();
  const section = useSyncExternalStore(subscribeSection, snapshotSection, snapshotSection);
  const activeMap = useSyncExternalStore(subscribeActive, snapshotActive, snapshotActive);
  const activeIds = activeMap[section];

  // Seed defaults once products load and nothing has been picked yet for a section.
  useEffect(() => {
    if (!productsQ.data) return;
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(LS_ACTIVE_KEY);
    // Only seed on the very first visit (nothing stored yet)
    if (raw !== null) return;
    const map = emptyMap();
    for (const p of productsQ.data) {
      if (p.default_enabled) map[p.category].add(p.id);
    }
    setActive(map);
  }, [productsQ.data]);

  const sectionProducts = (productsQ.data ?? []).filter((p) => p.category === section);

  const toggle = async (productId: string, next: boolean) => {
    const current = getActive();
    const bucket = new Set(current[section]);
    if (next) bucket.add(productId);
    else bucket.delete(productId);
    setActive({ ...current, [section]: bucket });
    return { ok: true as const };
  };

  return {
    activeIds,
    products: sectionProducts,
    allProducts: productsQ.data ?? [],
    section,
    isLoading: productsQ.isLoading,
    toggle,
  };
}

export function productColor(p: Product | undefined): string {
  return p?.color ?? "var(--vendor-default)";
}