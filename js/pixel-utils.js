export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image`));
    img.src = src;
  });
}

export function imageToCanvas(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return canvas;
}

export function canvasToDataUrl(canvas, type = "image/png") {
  return canvas.toDataURL(type);
}

const MAGENTA_TARGET = { r: 255, g: 0, b: 255 };
const BG_TOLERANCE = 60;

export function applyColorKey(canvas, target = MAGENTA_TARGET, tolerance = BG_TOLERANCE) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - target.r;
    const dg = data[i + 1] - target.g;
    const db = data[i + 2] - target.b;
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 <= tolerance * tolerance) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function pixelSnap(canvas, gridSize) {
  if (!gridSize || gridSize <= 0) return canvas;
  const w = canvas.width;
  const h = canvas.height;
  const longest = Math.max(w, h);
  if (longest <= gridSize) return canvas;

  const scale = gridSize / longest;
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));

  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext("2d");
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, sw, sh);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = false;
  octx.drawImage(small, 0, 0, w, h);
  return out;
}

export function trimToSquare(canvas) {
  const size = Math.min(canvas.width, canvas.height);
  if (canvas.width === canvas.height) return canvas;
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d");
  const sx = Math.max(0, Math.floor((canvas.width - size) / 2));
  const sy = Math.max(0, Math.floor((canvas.height - size) / 2));
  ctx.drawImage(canvas, sx, sy, size, size, 0, 0, size, size);
  return out;
}

export async function downsampleDataUrl(dataUrl, maxDim, mimeType = "image/png") {
  if (!maxDim || maxDim <= 0) return dataUrl;
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const longest = Math.max(w, h);
  if (longest <= maxDim) return dataUrl;

  const scale = maxDim / longest;
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, tw, th);
  return canvas.toDataURL(mimeType);
}
