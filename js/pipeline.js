import { DIRECTIONS, ANIMATIONS, referencePosePrompt, filmstripPrompt } from "./prompts.js";
import { generateImage as geminiGenerate, GeminiError } from "./gemini.js";
import { generateImage as puterGenerate, PuterError } from "./puter.js";
import { downsampleDataUrl } from "./pixel-utils.js";
import { uploadHash, cacheGet, cacheSet } from "./cache.js";

const MAX_RETRIES = 2;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function estimateCalls({ directions = DIRECTIONS.length, animationKeys, skipReferenceStage = false }) {
  const refs = skipReferenceStage ? 0 : directions;
  return refs + directions * animationKeys.length;
}

export class Pipeline {
  constructor({ provider = "gemini-direct", apiKey, model = "gemini-2.5-flash-image", throttleMs = 6500, dryRun = false, frameSize = 64, animationKeys, refMaxDim = 384, skipReferenceStage = false, onProgress }) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model;
    this.throttleMs = throttleMs;
    this.dryRun = dryRun;
    this.frameSize = frameSize;
    this.animationKeys = animationKeys;
    this.refMaxDim = refMaxDim;
    this.skipReferenceStage = skipReferenceStage;
    this.onProgress = onProgress ?? (() => {});
    this.completed = 0;
    this.total = estimateCalls({ animationKeys, skipReferenceStage });
    this.lastCallAt = 0;
    this.references = {}; // direction.key -> dataUrl
    this.filmstrips = {}; // direction.key -> animKey -> dataUrl
    this.cancelled = false;
  }

  cancel() { this.cancelled = true; }

  _emit(type, payload) {
    this.onProgress({ type, completed: this.completed, total: this.total, ...payload });
  }

  async _throttle() {
    const since = Date.now() - this.lastCallAt;
    const wait = this.throttleMs - since;
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
  }

  async _call(prompt, referenceImages = [], { label, bypassCache = false }) {
    if (this.cancelled) throw new Error("Cancelled");

    if (!bypassCache && this.uploadHashId) {
      const cached = cacheGet(this.uploadHashId, label);
      if (cached) {
        this._emit("cached", { label });
        return cached;
      }
    }

    if (this.dryRun) {
      await sleep(120);
      const out = placeholderDataUrl(label);
      if (this.uploadHashId) cacheSet(this.uploadHashId, label, out);
      return out;
    }
    const slimRefs = await Promise.all(
      referenceImages.map((r) => downsampleDataUrl(r, this.refMaxDim))
    );
    await this._throttle();
    let attempt = 0;
    while (true) {
      try {
        const out = this.provider === "puter"
          ? await puterGenerate({ model: this.model, prompt, referenceImages: slimRefs })
          : await geminiGenerate({ apiKey: this.apiKey, model: this.model, prompt, referenceImages: slimRefs });
        if (this.uploadHashId) cacheSet(this.uploadHashId, label, out);
        return out;
      } catch (err) {
        const retriable = (err instanceof GeminiError && err.retriable) || (err instanceof PuterError && err.retriable);
        if (!retriable || attempt >= MAX_RETRIES) throw err;
        const backoff = 2000 * Math.pow(2, attempt);
        this._emit("retry", { label, attempt: attempt + 1, message: err.message, waitMs: backoff });
        await sleep(backoff);
        attempt++;
      }
    }
  }

  async run(uploadDataUrl) {
    this.uploadHashId = await uploadHash(uploadDataUrl);
    this._emit("start", { uploadHash: this.uploadHashId });

    if (!this.skipReferenceStage) {
      for (const direction of DIRECTIONS) {
        const label = `ref:${direction.key}`;
        try {
          this._emit("step", { label, message: `Reference pose ${direction.key}` });
          const out = await this._call(
            referencePosePrompt(direction),
            [uploadDataUrl],
            { label }
          );
          this.references[direction.key] = out;
          this.completed++;
          this._emit("ok", { label, dataUrl: out });
        } catch (err) {
          this.completed++;
          this._emit("err", { label, message: err.message });
        }
      }
    }

    for (const direction of DIRECTIONS) {
      const ref = this.references[direction.key];
      for (const animKey of this.animationKeys) {
        const animation = ANIMATIONS[animKey];
        const label = `${direction.key}:${animKey}`;
        try {
          this._emit("step", { label, message: `${animation.label} for ${direction.key}` });
          const out = await this._call(
            filmstripPrompt(direction, animation, this.frameSize),
            ref ? [ref] : [uploadDataUrl],
            { label }
          );
          if (!this.filmstrips[direction.key]) this.filmstrips[direction.key] = {};
          this.filmstrips[direction.key][animKey] = out;
          this.completed++;
          this._emit("ok", { label, dataUrl: out, direction: direction.key, animation: animKey });
        } catch (err) {
          this.completed++;
          this._emit("err", { label, message: err.message, direction: direction.key, animation: animKey });
        }
      }
    }

    this._emit("done", {});
    return { references: this.references, filmstrips: this.filmstrips };
  }

  async regenerate({ direction, animation, uploadDataUrl }) {
    if (!this.uploadHashId) this.uploadHashId = await uploadHash(uploadDataUrl);
    const dir = DIRECTIONS.find((d) => d.key === direction);
    if (!dir) throw new Error(`Unknown direction ${direction}`);

    if (animation === "reference") {
      const out = await this._call(referencePosePrompt(dir), [uploadDataUrl], { label: `ref:${direction}`, bypassCache: true });
      this.references[direction] = out;
      return { kind: "reference", direction, dataUrl: out };
    }

    const anim = ANIMATIONS[animation];
    if (!anim) throw new Error(`Unknown animation ${animation}`);
    const ref = this.references[direction] ?? uploadDataUrl;
    const out = await this._call(filmstripPrompt(dir, anim, this.frameSize), [ref], { label: `${direction}:${animation}`, bypassCache: true });
    if (!this.filmstrips[direction]) this.filmstrips[direction] = {};
    this.filmstrips[direction][animation] = out;
    return { kind: "filmstrip", direction, animation, dataUrl: out };
  }
}

function placeholderDataUrl(label) {
  const w = 256;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FF00FF";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `hsl(${stringHash(label) % 360}, 70%, 55%)`;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(i * 64 + 16, 16, 32, 32);
  }
  ctx.fillStyle = "#000";
  ctx.font = "10px monospace";
  ctx.fillText(label, 4, 12);
  return canvas.toDataURL("image/png");
}

function stringHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
