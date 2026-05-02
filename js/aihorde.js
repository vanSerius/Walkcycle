const HORDE_BASE = "https://stablehorde.net/api/v2";
const CLIENT_AGENT = "WalkcycleSpriteSheet:1.0:github.com/vanSerius/Walkcycle";
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

let modelsCache = null;
let modelsCachedAt = 0;

export class HordeError extends Error {
  constructor(message, { status, retriable } = {}) {
    super(message);
    this.name = "HordeError";
    this.status = status;
    this.retriable = !!retriable;
  }
}

function dataUrlToBase64(dataUrl) {
  const m = /^data:image\/[^;]+;base64,(.*)$/.exec(dataUrl);
  if (!m) throw new HordeError("Reference image is not a base64 data URL");
  return m[1];
}

function clampMultipleOf64(n, min = 64, max = 3072) {
  const v = Math.round(n / 64) * 64;
  return Math.max(min, Math.min(max, v));
}

async function submit({ apiKey, prompt, sourceImage, model, width, height, denoise, steps }) {
  const params = {
    sampler_name: "k_euler_a",
    cfg_scale: 7,
    height: clampMultipleOf64(height),
    width: clampMultipleOf64(width),
    steps: steps ?? 25,
    n: 1,
    karras: true,
  };
  if (sourceImage) params.denoising_strength = denoise ?? 0.65;

  const body = {
    prompt,
    params,
    models: model ? [model] : ["stable_diffusion"],
    nsfw: false,
    trusted_workers: false,
    slow_workers: true,
    r2: true,
    shared: false,
  };
  if (sourceImage) {
    body.source_image = sourceImage;
    body.source_processing = "img2img";
  }

  const res = await fetch(`${HORDE_BASE}/generate/async`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: apiKey || "0000000000",
      "Client-Agent": CLIENT_AGENT,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const retriable = res.status === 429 || res.status >= 500;
    throw new HordeError(`AI Horde submit ${res.status}: ${text.slice(0, 300)}`, {
      status: res.status,
      retriable,
    });
  }
  return res.json();
}

async function check(id) {
  const res = await fetch(`${HORDE_BASE}/generate/check/${id}`, {
    headers: { "Client-Agent": CLIENT_AGENT },
  });
  if (!res.ok) {
    throw new HordeError(`Check ${res.status}`, { status: res.status, retriable: true });
  }
  return res.json();
}

async function status(id) {
  const res = await fetch(`${HORDE_BASE}/generate/status/${id}`, {
    headers: { "Client-Agent": CLIENT_AGENT },
  });
  if (!res.ok) {
    throw new HordeError(`Status ${res.status}`, { status: res.status });
  }
  return res.json();
}

async function urlToDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new HordeError(`Image fetch ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function getActiveModels() {
  if (modelsCache && Date.now() - modelsCachedAt < MODELS_CACHE_TTL_MS) {
    return modelsCache;
  }
  const res = await fetch(`${HORDE_BASE}/status/models?type=image`, {
    headers: { "Client-Agent": CLIENT_AGENT },
  });
  if (!res.ok) return [];
  const list = await res.json();
  list.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  modelsCache = list;
  modelsCachedAt = Date.now();
  return list;
}

function isLikelyGeminiModel(name) {
  return !name || /gemini|nano-?banana|flash-image|imagen/i.test(name);
}

async function pickModel(requested) {
  const active = await getActiveModels();
  if (!active.length) return requested || "stable_diffusion";

  if (!isLikelyGeminiModel(requested)) {
    const exact = active.find((m) => m.name.toLowerCase() === requested.toLowerCase());
    if (exact) return { picked: exact.name, fallback: false };
    const partial = active.find((m) => m.name.toLowerCase().includes(requested.toLowerCase()));
    if (partial) return { picked: partial.name, fallback: false };
  }

  const top = active[0];
  return { picked: top.name, fallback: true, reason: requested };
}

export async function generateImage({
  apiKey,
  model = "stable_diffusion",
  prompt,
  referenceImages = [],
  width = 512,
  height = 512,
  onPoll,
  onInfo,
}) {
  const sourceImage = referenceImages.length > 0 ? dataUrlToBase64(referenceImages[0]) : null;

  const choice = await pickModel(model);
  const usedModel = typeof choice === "string" ? choice : choice.picked;
  if (typeof choice !== "string" && choice.fallback && onInfo) {
    onInfo({ message: `Model "${choice.reason}" not available on AI Horde — falling back to "${choice.picked}".` });
  }

  const submitResp = await submit({ apiKey, prompt, sourceImage, model: usedModel, width, height });
  const id = submitResp.id;
  if (!id) throw new HordeError(`AI Horde returned no job id: ${JSON.stringify(submitResp).slice(0, 200)}`);

  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new HordeError("AI Horde polling timeout (5 min) — the queue may be empty or workers offline.");
    }
    await sleep(POLL_INTERVAL_MS);
    const c = await check(id);
    if (c.faulted) throw new HordeError("AI Horde reports faulted job. The worker had an error.");
    if (c.is_possible === false) {
      throw new HordeError("AI Horde says no worker can fulfil this request right now (model unavailable?).");
    }
    if (onPoll) onPoll({ queuePosition: c.queue_position, waitTime: c.wait_time, processing: c.processing });
    if (c.done) break;
  }

  const s = await status(id);
  const gen = s.generations?.[0];
  if (!gen?.img) {
    throw new HordeError("AI Horde finished but returned no image.");
  }

  if (/^https?:\/\//.test(gen.img)) return await urlToDataUrl(gen.img);
  return `data:image/webp;base64,${gen.img}`;
}
