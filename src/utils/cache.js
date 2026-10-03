const store = new Map();
export async function cached(key, ttlMs, loader) {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await loader(); store.set(key, { val, exp: Date.now() + ttlMs }); return val;
}
export const clearCache = (prefix = '') => { for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k); };
