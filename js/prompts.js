export const DIRECTIONS = [
  { key: "N",  label: "North (away from camera)",            phrase: "facing directly away from camera, viewed from behind" },
  { key: "NE", label: "North-East (back-right 3/4)",         phrase: "facing the back-right at a 45 degree angle, viewed from behind-right" },
  { key: "E",  label: "East (right profile)",                phrase: "in right-side profile, facing right" },
  { key: "SE", label: "South-East (front-right 3/4)",        phrase: "facing the front-right at a 45 degree angle" },
  { key: "S",  label: "South (toward camera)",               phrase: "facing directly toward the camera (front view)" },
  { key: "SW", label: "South-West (front-left 3/4)",         phrase: "facing the front-left at a 45 degree angle" },
  { key: "W",  label: "West (left profile)",                 phrase: "in left-side profile, facing left" },
  { key: "NW", label: "North-West (back-left 3/4)",          phrase: "facing the back-left at a 45 degree angle, viewed from behind-left" },
];

export const ANIMATIONS = {
  idle:   { key: "idle",   frames: 4, label: "idle (subtle breathing)",
            actionPhrase: "a subtle idle breathing animation, very gentle vertical bob, arms relaxed at sides" },
  walk:   { key: "walk",   frames: 8, label: "walk cycle",
            actionPhrase: "a smooth walk cycle: contact, down, pass, up for left leg, then mirrored right leg, with natural arm swing opposite to legs" },
  attack: { key: "attack", frames: 4, label: "attack swing",
            actionPhrase: "an attack animation: wind-up, swing, impact, recovery" },
};

const BG_INSTRUCTION =
  "Pure flat magenta background color (#FF00FF), absolutely no other background details, no shadows on background.";

const STYLE_INSTRUCTION =
  "Maintain the EXACT same pixel art style, color palette, proportions, hairstyle, clothing, and accessories as the reference. Crisp pixel edges, no anti-aliasing, no smoothing, no painted shading. The character must be clearly the same person in every output.";

export function referencePosePrompt(direction) {
  return [
    "You are generating a pixel-art character reference pose.",
    `Pose: standing idle (T-pose acceptable), ${direction.phrase}.`,
    "Single character, centered, full body visible, head to feet inside the frame with small even margin.",
    STYLE_INSTRUCTION,
    BG_INSTRUCTION,
    "Output a single image, square aspect ratio, character centered, no labels, no text, no border.",
  ].join(" ");
}

export function filmstripPrompt(direction, animation, frameSize) {
  const w = animation.frames * frameSize;
  return [
    `Generate a horizontal pixel-art filmstrip of ${animation.frames} evenly-sized frames showing ${animation.actionPhrase}.`,
    `Each frame is exactly ${frameSize}x${frameSize} pixels, frames placed side-by-side left to right with no gaps, no separators, no borders, no numbering.`,
    `Total image size: ${w}x${frameSize} pixels.`,
    `Character orientation: ${direction.phrase}. The character must remain in this orientation in EVERY frame.`,
    "Use the provided reference image to lock the character's identity and exact appearance.",
    "Frame 1 and the last frame should connect smoothly so the animation loops.",
    STYLE_INSTRUCTION,
    BG_INSTRUCTION,
    "Output a single horizontal filmstrip image only. No labels, no text, no UI chrome.",
  ].join(" ");
}
