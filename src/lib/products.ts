import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type Product = {
  id: string;
  name: string;
  description: string | null;
  feed_kind: string;
  feed_url: string | null;
  default_enabled: boolean;
  color: string;
  sort_order: number;
};

export const MAX_ACTIVE = 4;
const LS_KEY = "calradar.activeProducts";

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

export function useUserProductPrefs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_product_prefs", user?.id ?? null],
    queryFn: async () => {
      if (!user) return [] as { product_id: string; enabled: boolean }[];
      const { data, error } = await supabase
        .from("user_product_prefs")
        .select("product_id, enabled");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

function readLs(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeLs(set: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(Array.from(set)));
}

// Module-level shared store for anonymous active product ids so every
// component instance (ActiveProductsBar, Timeline, Compare, Gaps) sees the
// same selection. Without this, each useState lived per-component and
// toggling in the bar did not update the page lanes.
type Listener = () => void;
let anonStore: Set<string> | null = null;
const listeners = new Set<Listener>();
function getAnonStore(): Set<string> {
  if (anonStore === null) anonStore = readLs();
  return anonStore;
}
function setAnonStore(next: Set<string>) {
  anonStore = next;
  writeLs(next);
  listeners.forEach((l) => l());
}
function subscribeAnon(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function snapshotAnon() {
  return getAnonStore();
}

/**
 * Active products: returns the set of product ids currently active for the
 * viewer. When authenticated, prefs are persisted to `user_product_prefs`
 * (and we toggle directly via supabase). When anonymous, prefs persist in
 * localStorage. `default_enabled` products are included on first load.
 */
export function useActiveProductIds() {
  const { user } = useAuth();
  const productsQ = useProducts();
  const prefsQ = useUserProductPrefs();
  const anonIds = useSyncExternalStore(subscribeAnon, snapshotAnon, snapshotAnon);

  // Seed anon defaults once products load and nothing has been picked yet.
  useEffect(() => {
    if (user || !productsQ.data) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(LS_KEY) !== null) return;
    setAnonStore(new Set(productsQ.data.filter((p) => p.default_enabled).map((p) => p.id)));
  }, [user, productsQ.data]);

  let active: Set<string> = new Set();
  if (user) {
    if (prefsQ.data && productsQ.data) {
      // Start from defaults, override with user pref rows.
      const map = new Map<string, boolean>();
      for (const p of productsQ.data) map.set(p.id, p.default_enabled);
      for (const pref of prefsQ.data) map.set(pref.product_id, pref.enabled);
      active = new Set([...map.entries()].filter(([, v]) => v).map(([k]) => k));
    }
  } else {
    active = anonIds;
  }

  const toggle = async (productId: string, next: boolean) => {
    if (next && active.size >= MAX_ACTIVE && !active.has(productId)) {
      return { ok: false as const, reason: "max" as const };
    }
    if (user) {
      const { error } = await supabase
        .from("user_product_prefs")
        .upsert(
          { user_id: user.id, product_id: productId, enabled: next },
          { onConflict: "user_id,product_id" },
        );
      if (error) return { ok: false as const, reason: error.message };
      await prefsQ.refetch();
    } else {
      const nextSet = new Set(getAnonStore());
      if (next) nextSet.add(productId);
      else nextSet.delete(productId);
      setAnonStore(nextSet);
    }
    return { ok: true as const };
  };

  return {
    activeIds: active,
    products: productsQ.data ?? [],
    isLoading: productsQ.isLoading || (!!user && prefsQ.isLoading),
    toggle,
  };
}

export function productColor(p: Product | undefined): string {
  return p?.color ?? "var(--vendor-default)";
}