const PUTER_SCRIPT_URL = "https://js.puter.com/v2/";
let puterReadyPromise = null;

export class PuterError extends Error {
  constructor(message, { retriable } = {}) {
    super(message);
    this.name = "PuterError";
    this.retriable = !!retriable;
  }
}

function loadPuter() {
  if (puterReadyPromise) return puterReadyPromise;
  puterReadyPromise = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.puter?.ai) {
      resolve(window.puter);
      return;
    }
    const script = document.createElement("script");
    script.src = PUTER_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.puter?.ai) resolve(window.puter);
      else reject(new PuterError("Puter.js loaded but window.puter.ai is missing"));
    };
    script.onerror = () => reject(new PuterError("Failed to load Puter.js script", { retriable: true }));
    document.head.appendChild(script);
  });
  return puterReadyPromise;
}

function isDataUrlImage(s) {
  return typeof s === "string" && /^data:image\//.test(s);
}

function isHttpImageUrl(s) {
  return typeof s === "string" && /^https?:\/\//.test(s);
}

async function urlToDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new PuterError(`Failed to fetch generated image (${res.status})`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function extractImageDataUrl(response) {
  if (!response) return null;

  if (response instanceof HTMLImageElement) {
    if (isDataUrlImage(response.src)) return response.src;
    if (isHttpImageUrl(response.src)) return await urlToDataUrl(response.src);
  }

  if (typeof response === "string") {
    if (isDataUrlImage(response)) return response;
    if (isHttpImageUrl(response)) return await urlToDataUrl(response);
  }

  const candidatesFromObject = (obj) => {
    const out = [];
    const seen = new WeakSet();
    const walk = (v) => {
      if (!v || (typeof v !== "object" && typeof v !== "string")) return;
      if (typeof v === "string") {
        if (isDataUrlImage(v) || isHttpImageUrl(v)) out.push(v);
        return;
      }
      if (seen.has(v)) return;
      seen.add(v);
      if (Array.isArray(v)) { for (const x of v) walk(x); return; }
      for (const k of Object.keys(v)) walk(v[k]);
    };
    walk(obj);
    return out;
  };

  const found = candidatesFromObject(response);
  for (const s of found) {
    if (isDataUrlImage(s)) return s;
  }
  for (const s of found) {
    if (isHttpImageUrl(s)) {
      try { return await urlToDataUrl(s); } catch { /* keep trying */ }
    }
  }
  return null;
}

export async function generateImage({ model = "gemini-2.5-flash-image", prompt, referenceImages = [] }) {
  const puter = await loadPuter();
  const modelId = model.startsWith("google/") ? model : `google/${model}`;

  const refs = referenceImages.filter((r) => isDataUrlImage(r) || isHttpImageUrl(r));

  const attempts = [];

  if (refs.length > 0) {
    attempts.push(async () => puter.ai.chat(prompt, refs[0], false, { model: modelId }));
    attempts.push(async () => puter.ai.chat(prompt, refs, { model: modelId }));
    attempts.push(async () => puter.ai.chat(prompt, refs[0], { model: modelId }));
  } else {
    if (puter.ai.txt2img) {
      attempts.push(async () => puter.ai.txt2img(prompt, { model: modelId }));
      attempts.push(async () => puter.ai.txt2img(prompt));
    }
    attempts.push(async () => puter.ai.chat(prompt, { model: modelId }));
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const response = await attempt();
      const dataUrl = await extractImageDataUrl(response);
      if (dataUrl) return dataUrl;
      lastError = new PuterError("Puter response contained no extractable image; tried next call shape.");
    } catch (err) {
      lastError = err;
      const msg = String(err?.message ?? err);
      if (/auth|sign|login/i.test(msg)) {
        throw new PuterError(`Puter sign-in needed: ${msg}`);
      }
    }
  }

  throw lastError ?? new PuterError("Puter returned no image and no error.");
}
