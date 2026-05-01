import { loadImage, imageToCanvas, applyColorKey, pixelSnap } from "./pixel-utils.js";

export async function splitFilmstrip(dataUrl, frameCount, { frameSize, colorKey = true, snapTo = 0 } = {}) {
  const img = await loadImage(dataUrl);
  const fullCanvas = imageToCanvas(img);

  const tileWidth = Math.floor(fullCanvas.width / frameCount);
  const tileHeight = fullCanvas.height;

  const targetSize = frameSize || Math.min(tileWidth, tileHeight);
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    const sx = i * tileWidth;
    const tile = document.createElement("canvas");
    tile.width = targetSize;
    tile.height = targetSize;
    const ctx = tile.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fullCanvas, sx, 0, tileWidth, tileHeight, 0, 0, targetSize, targetSize);

    let processed = tile;
    if (snapTo) processed = pixelSnap(processed, snapTo);
    if (colorKey) processed = applyColorKey(processed);

    frames.push(processed);
  }
  return frames;
}

export async function processReferenceImage(dataUrl, { frameSize, colorKey = true, snapTo = 0 } = {}) {
  const img = await loadImage(dataUrl);
  const src = imageToCanvas(img);
  const out = document.createElement("canvas");
  out.width = frameSize;
  out.height = frameSize;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const size = Math.min(src.width, src.height);
  const sx = Math.floor((src.width - size) / 2);
  const sy = Math.floor((src.height - size) / 2);
  ctx.drawImage(src, sx, sy, size, size, 0, 0, frameSize, frameSize);

  let processed = out;
  if (snapTo) processed = pixelSnap(processed, snapTo);
  if (colorKey) processed = applyColorKey(processed);
  return processed;
}
