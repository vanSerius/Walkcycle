# Walkcycle Sprite-Sheet Generator

A static web app that turns a single front-view T-pose pixel-art character into a full 8-direction sprite sheet with idle, walk, and attack animations. Runs entirely in the browser — no backend, no server. Hostable on GitHub Pages.

## How it works

1. **Upload** a front-view T-pose pixel-art character.
2. The app prompts **Gemini 2.5 Flash Image (Nano Banana)** to generate 8 directional reference poses (N, NE, E, SE, S, SW, W, NW).
3. For each direction the app generates a horizontal **filmstrip** image per animation (idle / walk / attack), using the reference pose as image input for character consistency.
4. The filmstrips are split into individual frames on the client (Canvas API) and composited into a final sprite sheet PNG plus a JSON metadata file with frame coordinates.

Total: ~32 Gemini API calls per character — fits inside the AI Studio free-tier daily quota.

## Setup

1. Get a free Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Open the deployed app (or run locally with `python3 -m http.server 8000`).
3. Paste the API key in the settings panel — it is stored in your browser's `localStorage` and sent only to Google's API.
4. Upload your character and click **Generate**.

## GitHub Pages deployment

The app is pure static HTML/CSS/JS with ES modules. To deploy:

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Build and deployment → Deploy from a branch**.
3. Select branch `main` (or whichever branch is current), folder `/ (root)`.
4. Wait for the page to build, then open the live URL.

`.nojekyll` is included so GitHub Pages skips Jekyll processing.

## Local development

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

No build step. No npm install. Edit files and refresh.

## Output format

- `spritesheet.png` — full sheet, rows = directions (in N→NW order), columns grouped by animation (idle → walk → attack).
- `spritesheet.json` — Aseprite-compatible JSON-Hash format with `frames`, `meta.frameTags` for each direction × animation, and `meta.size`.

The JSON works directly with Phaser, PixiJS and many other game engines, or as an import target for Aseprite / Godot.

## Known limitations

- The Gemini free tier has a daily quota and ~10 requests-per-minute rate limit. The app throttles automatically (~6 s between calls), so a full character takes ~3 minutes.
- Pixel-art consistency from Nano Banana is good but not perfect for very small sprites. The optional **Pixel Snap** post-processing helps for 32×32 / 64×64 outputs.
- Your API key is stored in `localStorage` and sent directly from your browser to Google. Do not deploy a shared key — every user must bring their own.
- Filmstrip layout follows the prompt most of the time. If a frame is misaligned, click it in the preview grid to regenerate that single direction × animation.

## Files

```
index.html              UI shell
style.css               Layout + theming
.nojekyll               GitHub Pages: skip Jekyll
js/
  app.js                Main controller, UI wiring
  settings.js           localStorage for API key + options
  gemini.js             Nano Banana fetch wrapper
  pipeline.js           Stage 1 + 2 orchestration, throttle, retry
  prompts.js            Direction + animation prompt templates
  frame-splitter.js     Canvas: filmstrip → frame array
  sprite-sheet.js       Canvas: frames → sheet PNG + JSON
  pixel-utils.js        Pixel-snap + color-key transparency
```

## License

MIT — do whatever you like.
