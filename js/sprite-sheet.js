import { DIRECTIONS, ANIMATIONS } from "./prompts.js";

export function composeSheet({ frameSize, frames, animationOrder }) {
  const cols = animationOrder.reduce((sum, a) => sum + ANIMATIONS[a].frames, 0);
  const rows = DIRECTIONS.length;

  const canvas = document.createElement("canvas");
  canvas.width = cols * frameSize;
  canvas.height = rows * frameSize;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const json = {
    frames: {},
    meta: {
      app: "Walkcycle Sprite Sheet Generator",
      version: "1.0",
      image: "spritesheet.png",
      format: "RGBA8888",
      size: { w: canvas.width, h: canvas.height },
      scale: "1",
      frameTags: [],
    },
  };

  for (let r = 0; r < DIRECTIONS.length; r++) {
    const dir = DIRECTIONS[r];
    let colCursor = 0;
    for (const animKey of animationOrder) {
      const anim = ANIMATIONS[animKey];
      const dirAnimFrames = frames[dir.key]?.[animKey] ?? [];
      const startFrameIndex = r * cols + colCursor;
      const tagFrames = [];
      for (let i = 0; i < anim.frames; i++) {
        const frameCanvas = dirAnimFrames[i];
        const x = (colCursor + i) * frameSize;
        const y = r * frameSize;
        if (frameCanvas) ctx.drawImage(frameCanvas, x, y);
        const frameName = `${dir.key}_${animKey}_${i}`;
        json.frames[frameName] = {
          frame: { x, y, w: frameSize, h: frameSize },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: frameSize, h: frameSize },
          sourceSize: { w: frameSize, h: frameSize },
          duration: animKey === "walk" ? 100 : animKey === "idle" ? 250 : 90,
        };
        tagFrames.push(startFrameIndex + i);
      }
      json.meta.frameTags.push({
        name: `${dir.key}_${animKey}`,
        from: tagFrames[0],
        to: tagFrames[tagFrames.length - 1],
        direction: animKey === "walk" || animKey === "idle" ? "forward" : "forward",
      });
      colCursor += anim.frames;
    }
  }

  return { canvas, json };
}

export function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve) => canvas.toBlob(resolve, type));
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
