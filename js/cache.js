const STORAGE_PREFIX = "walkcycle.cache.v1.";

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function uploadHash(uploadDataUrl) {
  const hash = await sha256Hex(uploadDataUrl);
  return hash.slice(0, 16);
}

function key(hash, label) {
  return `${STORAGE_PREFIX}${hash}.${label}`;
}

export function cacheGet(hash, label) {
  try { return localStorage.getItem(key(hash, label)); } catch { return null; }
}

export function cacheSet(hash, label, dataUrl) {
  try {
    localStorage.setItem(key(hash, label), dataUrl);
    return true;
  } catch (err) {
    console.warn(`Cache write failed for ${label}: ${err.message}. Pruning oldest entries.`);
    pruneCache(hash);
    try {
      localStorage.setItem(key(hash, label), dataUrl);
      return true;
    } catch {
      return false;
    }
  }
}

export function cacheCountForUpload(hash) {
  if (!hash) return 0;
  let n = 0;
  const prefix = `${STORAGE_PREFIX}${hash}.`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) n++;
  }
  return n;
}

export function cacheKeysForUpload(hash) {
  const out = [];
  const prefix = `${STORAGE_PREFIX}${hash}.`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) out.push({ key: k, label: k.slice(prefix.length) });
  }
  return out;
}

export function cacheClearForUpload(hash) {
  const keys = cacheKeysForUpload(hash);
  for (const { key } of keys) localStorage.removeItem(key);
  return keys.length;
}

export function cacheClearAll() {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX)) toRemove.push(k);
  }
  for (const k of toRemove) localStorage.removeItem(k);
  return toRemove.length;
}

function pruneCache(keepHash) {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
    if (keepHash && k.startsWith(`${STORAGE_PREFIX}${keepHash}.`)) continue;
    toRemove.push(k);
  }
  for (const k of toRemove) localStorage.removeItem(k);
  return toRemove.length;
}
