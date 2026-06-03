// Generates the PWA PNG icons (192 / 512 / maskable) into /public from a
// path-based SVG, so no font is required at render time. Run once after
// changing the brand mark:
//
//   node scripts/generate-icons.mjs
//
// The resulting PNGs are committed; Vercel does not run this at build time.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BG = "#2D5F3F"; // forest — matches app/apple-icon.tsx + theme_color
const FG = "#FAFAF7"; // cream

// A blocky geometric "R" drawn as filled rectangles + a leg, in a 0..100
// coordinate space. Path-based (no <text>) so rendering needs no system font.
const R_PATH = [
  "M25,22 H39 V78 H25 Z", // stem (left vertical)
  "M25,22 H61 V34 H25 Z", // top bar
  "M49,22 H61 V50 H49 Z", // bowl right edge
  "M25,44 H61 V56 H25 Z", // middle bar (closes the bowl)
  "M39,54 L51,54 L67,78 L55,78 Z", // leg
].join(" ");

function svg(size, transform) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${BG}"/>
  <path d="${R_PATH}" fill="${FG}" transform="${transform}"/>
</svg>`;
}

const publicDir = join(process.cwd(), "public");
mkdirSync(publicDir, { recursive: true });

async function render(name, size, transform) {
  await sharp(Buffer.from(svg(size, transform)))
    .png()
    .toFile(join(publicDir, name));
  console.log(`wrote public/${name} (${size}x${size})`);
}

// "any" icons: R centred at natural size.
await render("icon-192.png", 192, "translate(4,0)");
await render("icon-512.png", 512, "translate(4,0)");
// maskable: R scaled into the central ~66% safe zone, full-bleed background.
await render("icon-maskable-512.png", 512, "translate(17,17) scale(0.66)");
