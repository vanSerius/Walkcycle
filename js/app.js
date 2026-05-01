import { loadSettings, saveSettings } from "./settings.js";
import { Pipeline, estimateCalls } from "./pipeline.js";
import { DIRECTIONS, ANIMATIONS } from "./prompts.js";
import { splitFilmstrip, processReferenceImage } from "./frame-splitter.js";
import { composeSheet, canvasToBlob, downloadBlob } from "./sprite-sheet.js";

const els = {
  dropzone: document.getElementById("dropzone"),
  dropzoneEmpty: document.getElementById("dropzone-empty"),
  fileInput: document.getElementById("file-input"),
  uploadPreview: document.getElementById("upload-preview"),
  frameSize: document.getElementById("frame-size"),
  pixelSnap: document.getElementById("pixel-snap"),
  colorKey: document.getElementById("color-key"),
  skipReferenceStage: document.getElementById("skip-reference-stage"),
  callEstimate: document.getElementById("call-estimate"),
  animToggles: document.querySelectorAll('.anim-toggles input[data-anim]'),
  generateBtn: document.getElementById("generate-btn"),
  progressPanel: document.getElementById("progress-panel"),
  progressFill: document.getElementById("progress-fill"),
  progressStatus: document.getElementById("progress-status"),
  progressLog: document.getElementById("progress-log"),
  previewPanel: document.getElementById("preview-panel"),
  previewGrid: document.getElementById("preview-grid"),
  exportPanel: document.getElementById("export-panel"),
  sheetCanvas: document.getElementById("sheet-canvas"),
  downloadPng: document.getElementById("download-png"),
  downloadJson: document.getElementById("download-json"),
  openSettings: document.getElementById("open-settings"),
  settingsDialog: document.getElementById("settings-dialog"),
  provider: document.getElementById("provider"),
  apiKeyField: document.getElementById("api-key-field"),
  apiKey: document.getElementById("api-key"),
  modelName: document.getElementById("model-name"),
  throttleMs: document.getElementById("throttle-ms"),
  refMaxDim: document.getElementById("ref-max-dim"),
  dryRun: document.getElementById("dry-run"),
  settingsSave: document.getElementById("settings-save"),
  settingsCancel: document.getElementById("settings-cancel"),
};

const state = {
  uploadDataUrl: null,
  pipeline: null,
  references: {},
  filmstrips: {},
  settings: loadSettings(),
};

function getAnimationKeys() {
  return Array.from(els.animToggles)
    .filter((cb) => cb.checked)
    .map((cb) => cb.dataset.anim);
}

function applySettingsToUI() {
  els.provider.value = state.settings.provider;
  els.apiKey.value = state.settings.apiKey;
  els.modelName.value = state.settings.modelName;
  updateProviderUI();
  els.throttleMs.value = state.settings.throttleMs;
  els.refMaxDim.value = state.settings.refMaxDim;
  els.dryRun.checked = state.settings.dryRun;
  els.frameSize.value = String(state.settings.frameSize);
  els.pixelSnap.checked = state.settings.pixelSnap;
  els.colorKey.checked = state.settings.colorKey;
  els.skipReferenceStage.checked = state.settings.skipReferenceStage;
  for (const cb of els.animToggles) {
    const key = cb.dataset.anim;
    if (state.settings.enabledAnimations[key] !== undefined) {
      cb.checked = state.settings.enabledAnimations[key];
    }
  }
}

function persistOptions() {
  const enabled = {};
  for (const cb of els.animToggles) enabled[cb.dataset.anim] = cb.checked;
  state.settings = saveSettings({
    frameSize: Number(els.frameSize.value),
    pixelSnap: els.pixelSnap.checked,
    colorKey: els.colorKey.checked,
    skipReferenceStage: els.skipReferenceStage.checked,
    enabledAnimations: enabled,
  });
}

function updateCallEstimate() {
  const animationKeys = getAnimationKeys();
  const skip = els.skipReferenceStage.checked;
  const calls = estimateCalls({ animationKeys, skipReferenceStage: skip });
  const refCalls = skip ? 0 : 8;
  const filmstripCalls = 8 * animationKeys.length;
  const fits = calls <= 20 ? "fits in 20-RPD free tier" : "exceeds 20-RPD free tier";
  els.callEstimate.textContent =
    animationKeys.length === 0
      ? "Pick at least one animation."
      : `~${calls} API calls (${refCalls} ref + ${filmstripCalls} filmstrip) — ${fits}.`;
  els.callEstimate.style.color = calls <= 20 ? "var(--good)" : "var(--bad)";
}

function setGenerateEnabled() {
  const animsOn = getAnimationKeys().length > 0;
  els.generateBtn.disabled = !state.uploadDataUrl || !animsOn;
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  state.uploadDataUrl = await readFileAsDataUrl(file);
  els.uploadPreview.src = state.uploadDataUrl;
  els.uploadPreview.hidden = false;
  els.dropzoneEmpty.hidden = true;
  setGenerateEnabled();
}

function setupDropzone() {
  els.dropzone.addEventListener("click", () => els.fileInput.click());
  els.dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.fileInput.click(); }
  });
  els.fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
  els.dropzone.addEventListener("dragover", (e) => { e.preventDefault(); els.dropzone.classList.add("dragover"); });
  els.dropzone.addEventListener("dragleave", () => els.dropzone.classList.remove("dragover"));
  els.dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    els.dropzone.classList.remove("dragover");
    handleFile(e.dataTransfer.files[0]);
  });
}

function setupSettings() {
  els.openSettings.addEventListener("click", () => {
    applySettingsToUI();
    els.settingsDialog.showModal();
  });
  els.settingsCancel.addEventListener("click", () => els.settingsDialog.close());
  els.settingsSave.addEventListener("click", () => {
    const model = els.modelName.value.trim() || "gemini-2.5-flash-image";
    state.settings = saveSettings({
      provider: els.provider.value,
      apiKey: els.apiKey.value.trim(),
      modelName: model,
      throttleMs: Math.max(0, Number(els.throttleMs.value) || 0),
      refMaxDim: Math.max(0, Number(els.refMaxDim.value) || 0),
      dryRun: els.dryRun.checked,
    });
    els.settingsDialog.close();
  });

  els.provider.addEventListener("change", updateProviderUI);
}

function updateProviderUI() {
  const provider = els.provider.value;
  els.apiKeyField.style.display = provider === "gemini-direct" ? "" : "none";
}

function setupOptions() {
  els.frameSize.addEventListener("change", persistOptions);
  els.pixelSnap.addEventListener("change", persistOptions);
  els.colorKey.addEventListener("change", persistOptions);
  els.skipReferenceStage.addEventListener("change", () => {
    persistOptions();
    updateCallEstimate();
  });
  for (const cb of els.animToggles) {
    cb.addEventListener("change", () => {
      persistOptions();
      setGenerateEnabled();
      updateCallEstimate();
    });
  }
}

function logProgress(message, kind = "") {
  const li = document.createElement("li");
  li.textContent = message;
  if (kind) li.className = kind;
  els.progressLog.appendChild(li);
  els.progressLog.scrollTop = els.progressLog.scrollHeight;
}

function setProgress(completed, total) {
  const pct = total ? Math.round((completed / total) * 100) : 0;
  els.progressFill.style.width = `${pct}%`;
  els.progressStatus.textContent = `${completed} / ${total} (${pct}%)`;
}

function ensurePreviewSkeleton(animationKeys, includeReference) {
  els.previewGrid.innerHTML = "";

  const corner = document.createElement("div");
  corner.className = "preview-row-label";
  corner.textContent = "Direction";
  els.previewGrid.appendChild(corner);

  if (includeReference) {
    const refHeader = document.createElement("div");
    refHeader.className = "preview-col-label";
    refHeader.textContent = "Reference";
    els.previewGrid.appendChild(refHeader);
  }

  for (const animKey of animationKeys) {
    const h = document.createElement("div");
    h.className = "preview-col-label";
    h.textContent = ANIMATIONS[animKey].label;
    els.previewGrid.appendChild(h);
  }

  const cols = (includeReference ? 1 : 0) + animationKeys.length;
  els.previewGrid.style.gridTemplateColumns = `120px ${"1fr ".repeat(cols).trim()}`;

  for (const dir of DIRECTIONS) {
    const rowLabel = document.createElement("div");
    rowLabel.className = "preview-row-label";
    rowLabel.textContent = dir.key;
    els.previewGrid.appendChild(rowLabel);

    if (includeReference) {
      const refCell = createCell({ label: `ref:${dir.key}`, kind: "ref", direction: dir.key });
      els.previewGrid.appendChild(refCell);
    }

    for (const animKey of animationKeys) {
      const cell = createCell({ label: `${dir.key}:${animKey}`, kind: "filmstrip", direction: dir.key, animation: animKey });
      els.previewGrid.appendChild(cell);
    }
  }
}

function createCell({ label, kind, direction, animation }) {
  const cell = document.createElement("div");
  cell.className = "preview-cell empty";
  cell.dataset.label = label;
  cell.dataset.kind = kind;
  cell.dataset.direction = direction;
  if (animation) cell.dataset.animation = animation;
  cell.textContent = "(pending)";
  return cell;
}

function fillCell(label, dataUrl) {
  const cell = els.previewGrid.querySelector(`[data-label="${cssEscape(label)}"]`);
  if (!cell) return;
  cell.classList.remove("empty");
  cell.innerHTML = "";
  const img = document.createElement("img");
  img.src = dataUrl;
  img.className = cell.dataset.kind === "ref" ? "ref" : "filmstrip";
  img.title = "Click to regenerate";
  img.addEventListener("click", () => regenerateCell(cell));
  cell.appendChild(img);

  const btn = document.createElement("button");
  btn.className = "regen";
  btn.type = "button";
  btn.textContent = "Regenerate";
  btn.addEventListener("click", () => regenerateCell(cell));
  cell.appendChild(btn);
}

function markCellError(label, message) {
  const cell = els.previewGrid.querySelector(`[data-label="${cssEscape(label)}"]`);
  if (!cell) return;
  cell.classList.add("empty");
  cell.innerHTML = `<span title="${cssEscape(message)}">error - click to retry</span>`;
  cell.style.cursor = "pointer";
  cell.onclick = () => regenerateCell(cell);
}

function cssEscape(s) {
  return String(s).replace(/"/g, '\\"');
}

async function regenerateCell(cell) {
  if (!state.pipeline) return;
  const direction = cell.dataset.direction;
  const animation = cell.dataset.kind === "ref" ? "reference" : cell.dataset.animation;
  cell.innerHTML = "(regenerating...)";
  cell.classList.add("empty");
  try {
    const result = await state.pipeline.regenerate({
      direction,
      animation,
      uploadDataUrl: state.uploadDataUrl,
    });
    fillCell(cell.dataset.label, result.dataUrl);
    if (result.kind === "reference") {
      state.references[direction] = result.dataUrl;
    } else {
      if (!state.filmstrips[direction]) state.filmstrips[direction] = {};
      state.filmstrips[direction][animation] = result.dataUrl;
    }
    await rebuildSheet();
  } catch (err) {
    markCellError(cell.dataset.label, err.message);
  }
}

async function rebuildSheet() {
  const animationKeys = getAnimationKeys();
  const frameSize = Number(els.frameSize.value);
  const splitOpts = {
    frameSize,
    colorKey: els.colorKey.checked,
    snapTo: els.pixelSnap.checked ? frameSize : 0,
  };

  const frames = {};
  for (const dir of DIRECTIONS) {
    frames[dir.key] = {};
    for (const animKey of animationKeys) {
      const dataUrl = state.filmstrips[dir.key]?.[animKey];
      if (!dataUrl) continue;
      try {
        frames[dir.key][animKey] = await splitFilmstrip(dataUrl, ANIMATIONS[animKey].frames, splitOpts);
      } catch (err) {
        console.warn(`Failed to split filmstrip ${dir.key}/${animKey}:`, err);
      }
    }
  }

  const { canvas, json } = composeSheet({ frameSize, frames, animationOrder: animationKeys });
  const target = els.sheetCanvas;
  target.width = canvas.width;
  target.height = canvas.height;
  target.getContext("2d").drawImage(canvas, 0, 0);
  state.lastSheetCanvas = canvas;
  state.lastSheetJson = json;
  els.exportPanel.hidden = false;
}

async function runGeneration() {
  if (!state.uploadDataUrl) return;

  persistOptions();
  const animationKeys = getAnimationKeys();
  if (animationKeys.length === 0) return;

  if (state.settings.provider === "gemini-direct" && !state.settings.apiKey && !state.settings.dryRun) {
    alert("Please set your Gemini API key in Settings (or switch provider to Puter.js, or enable Dry-run).");
    els.openSettings.click();
    return;
  }

  els.generateBtn.disabled = true;
  els.progressPanel.hidden = false;
  els.previewPanel.hidden = false;
  els.progressLog.innerHTML = "";
  state.references = {};
  state.filmstrips = {};
  const skipReferenceStage = els.skipReferenceStage.checked;
  ensurePreviewSkeleton(animationKeys, !skipReferenceStage);

  state.pipeline = new Pipeline({
    provider: state.settings.provider,
    apiKey: state.settings.apiKey,
    model: state.settings.modelName,
    throttleMs: state.settings.throttleMs,
    refMaxDim: state.settings.refMaxDim,
    dryRun: state.settings.dryRun,
    frameSize: Number(els.frameSize.value),
    animationKeys,
    skipReferenceStage,
    onProgress: (event) => {
      setProgress(event.completed, event.total);
      if (event.type === "step") {
        els.progressStatus.textContent = `${event.completed} / ${event.total} - ${event.message}`;
      } else if (event.type === "ok") {
        logProgress(`OK ${event.label}`, "ok");
        fillCell(event.label, event.dataUrl);
        if (event.label.startsWith("ref:")) {
          state.references[event.label.slice(4)] = event.dataUrl;
        } else if (event.direction && event.animation) {
          if (!state.filmstrips[event.direction]) state.filmstrips[event.direction] = {};
          state.filmstrips[event.direction][event.animation] = event.dataUrl;
        }
      } else if (event.type === "err") {
        logProgress(`ERR ${event.label}: ${event.message}`, "err");
        markCellError(event.label, event.message);
      } else if (event.type === "retry") {
        logProgress(`retry ${event.label} (#${event.attempt}, wait ${event.waitMs}ms): ${event.message}`);
      } else if (event.type === "done") {
        els.progressStatus.textContent = "Done.";
      }
    },
  });

  try {
    await state.pipeline.run(state.uploadDataUrl);
    await rebuildSheet();
  } catch (err) {
    logProgress(`Pipeline error: ${err.message}`, "err");
  } finally {
    els.generateBtn.disabled = false;
  }
}

function setupExport() {
  els.downloadPng.addEventListener("click", async () => {
    if (!state.lastSheetCanvas) return;
    const blob = await canvasToBlob(state.lastSheetCanvas, "image/png");
    downloadBlob(blob, "spritesheet.png");
  });
  els.downloadJson.addEventListener("click", () => {
    if (!state.lastSheetJson) return;
    const blob = new Blob([JSON.stringify(state.lastSheetJson, null, 2)], { type: "application/json" });
    downloadBlob(blob, "spritesheet.json");
  });
}

function init() {
  applySettingsToUI();
  setupDropzone();
  setupSettings();
  setupOptions();
  setupExport();
  els.generateBtn.addEventListener("click", runGeneration);
  setGenerateEnabled();
  updateCallEstimate();
}

init();
