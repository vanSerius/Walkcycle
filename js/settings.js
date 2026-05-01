const STORAGE_KEY = "walkcycle.settings.v1";

const DEFAULTS = {
  apiKey: "",
  modelName: "gemini-2.5-flash-image",
  throttleMs: 6500,
  dryRun: false,
  frameSize: 64,
  pixelSnap: true,
  colorKey: true,
  enabledAnimations: { idle: true, walk: true, attack: true },
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch) {
  const current = loadSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
