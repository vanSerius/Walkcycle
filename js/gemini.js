const ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiError extends Error {
  constructor(message, { status, retriable } = {}) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.retriable = !!retriable;
  }
}

function dataUrlToInlineData(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
  if (!m) throw new Error("Reference image is not a base64 data URL");
  return { mimeType: m[1], data: m[2] };
}

export async function generateImage({ apiKey, model = "gemini-2.5-flash-image", prompt, referenceImages = [] }) {
  if (!apiKey) throw new GeminiError("API key is missing. Open Settings and paste your key.");

  const parts = [{ text: prompt }];
  for (const ref of referenceImages) {
    parts.push({ inlineData: dataUrlToInlineData(ref) });
  }

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  };

  const endpoint = `${ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent`;
  let response;
  try {
    response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GeminiError(`Network error: ${err.message}`, { retriable: true });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const retriable = response.status === 429 || response.status >= 500;
    throw new GeminiError(
      `Gemini API ${response.status}: ${text.slice(0, 400)}`,
      { status: response.status, retriable }
    );
  }

  const data = await response.json();
  const candidates = data?.candidates ?? [];
  for (const cand of candidates) {
    const parts = cand?.content?.parts ?? [];
    for (const p of parts) {
      const inline = p.inlineData ?? p.inline_data;
      if (inline?.data) {
        const mime = inline.mimeType ?? inline.mime_type ?? "image/png";
        return `data:${mime};base64,${inline.data}`;
      }
    }
  }

  throw new GeminiError("Gemini returned no image. Check prompt or API quota.", {
    retriable: false,
  });
}
