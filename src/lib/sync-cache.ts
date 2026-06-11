/**
 * Local cache for sync history - ensures public users can see sync status
 * even if database queries have delays or RLS issues
 */

interface SyncCacheEntry {
  timestamp: string;
  itemsUpserted: number;
  error?: string;
}

const SYNC_CACHE_PREFIX = "pmradar_sync_cache_";
const SYNC_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export function cacheSyncResult(productId: string, itemsUpserted: number, error?: string): void {
  if (typeof window === "undefined") return;

  const entry: SyncCacheEntry = {
    timestamp: new Date().toISOString(),
    itemsUpserted,
    error,
  };

  try {
    localStorage.setItem(`${SYNC_CACHE_PREFIX}${productId}`, JSON.stringify(entry));
  } catch (e) {
    // Silently fail if localStorage is full or unavailable
    console.warn("Failed to cache sync result:", e);
  }
}

export function getCachedSyncResult(productId: string): SyncCacheEntry | null {
  if (typeof window === "undefined") return null;

  try {
    const cached = localStorage.getItem(`${SYNC_CACHE_PREFIX}${productId}`);
    if (!cached) return null;

    const entry = JSON.parse(cached) as SyncCacheEntry;
    const cacheTime = new Date(entry.timestamp).getTime();
    const now = Date.now();

    // Return null if cache is older than TTL
    if (now - cacheTime > SYNC_CACHE_TTL) {
      localStorage.removeItem(`${SYNC_CACHE_PREFIX}${productId}`);
      return null;
    }

    return entry;
  } catch (e) {
    // Silently fail on parse errors
    console.warn("Failed to read cached sync result:", e);
    return null;
  }
}

export function clearSyncCache(productId?: string): void {
  if (typeof window === "undefined") return;

  if (productId) {
    localStorage.removeItem(`${SYNC_CACHE_PREFIX}${productId}`);
  } else {
    // Clear all sync cache entries
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(SYNC_CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }
}
