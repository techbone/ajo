// Regenerates every brand asset from one geometry definition. Run: node brand/build.mjs
//
// The mark is eight equal dots on a ring with one enlarged: the members of a
// circle, and whose turn it currently is. Everything else here is that shape
// at a different size, on a different background, or animated.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = (p) => join(root, p);

const INDIGO = "#3a44a8";
const BOX = 64;
const C = BOX / 2;
const RING = 21;
const DOT = 3.6;
const ACTIVE = 7.5;
const N = 8;
const REST = 0.5; // opacity of the members who are not up

// Dot centres, clockwise from the top.
const seats = Array.from({ length: N }, (_, i) => {
  const a = (-90 + (360 / N) * i) * (Math.PI / 180);
  return { x: +(C + RING * Math.cos(a)).toFixed(2), y: +(C + RING * Math.sin(a)).toFixed(2) };
});

/** The bare mark, painted in `currentColor`, with seat `active` enlarged. */
function markBody(active = 0) {
  return seats
    .map(({ x, y }, i) =>
      i === active
        ? `<circle cx="${x}" cy="${y}" r="${ACTIVE}"/>`
        : `<circle cx="${x}" cy="${y}" r="${DOT}" opacity="${REST}"/>`,
    )
    .join("\n    ");
}

/** The mark with the turn travelling around the ring once every `dur` seconds. */
function markBodyAnimated(dur = 4) {
  const keyTimes = "0;0.03;0.1;0.13;1";
  return seats
    .map(
      ({ x, y }, i) => `<circle cx="${x}" cy="${y}" r="${DOT}" opacity="${REST}">
      <animate attributeName="r" dur="${dur}s" begin="${((dur / N) * i).toFixed(2)}s"
        repeatCount="indefinite" values="${DOT};${ACTIVE};${ACTIVE};${DOT};${DOT}" keyTimes="${keyTimes}"/>
      <animate attributeName="opacity" dur="${dur}s" begin="${((dur / N) * i).toFixed(2)}s"
        repeatCount="indefinite" values="${REST};1;1;${REST};${REST}" keyTimes="${keyTimes}"/>
    </circle>`,
    )
    .join("\n    ");
}

const svg = (body, attrs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}" fill="none"${attrs}>\n  ${body}\n</svg>\n`;

// The mark alone, inheriting colour from its context. This is the one to import
// into the app; it is indigo on light, #8e97f0 on dark, white on indigo.
const mark = svg(`<g fill="currentColor">\n    ${markBody()}\n  </g>`);
const markLoop = svg(`<g fill="currentColor">\n    ${markBodyAnimated()}\n  </g>`);

/**
 * The mark on an indigo ground. `radius` 0 gives a full-bleed square, which is
 * what iOS and X want — they apply their own mask, and a pre-rounded tile just
 * gets its corners clipped twice.
 */
function tile(radius, { animated = false, active = 0 } = {}) {
  const shape = radius
    ? `<rect width="${BOX}" height="${BOX}" rx="${radius}" fill="${INDIGO}"/>`
    : `<rect width="${BOX}" height="${BOX}" fill="${INDIGO}"/>`;
  const body = animated ? markBodyAnimated() : markBody(active);
  // 0.85 keeps roughly a fifth of the tile as breathing room, so the mark still
  // clears the edge once a circular crop is applied.
  return svg(
    `${shape}\n  <g fill="#ffffff" transform="translate(${C} ${C}) scale(0.85) translate(-${C} -${C})">\n    ${body}\n  </g>`,
  );
}

const png = (source, size) =>
  sharp(Buffer.from(source)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

mkdirSync(out("brand"), { recursive: true });

// --- App icons -------------------------------------------------------------
writeFileSync(out("app/icon.svg"), tile(14));
writeFileSync(out("app/apple-icon.png"), await png(tile(0), 180));

// --- Reusable sources ------------------------------------------------------
writeFileSync(out("brand/mark.svg"), mark);
writeFileSync(out("brand/mark-loop.svg"), markLoop);
writeFileSync(out("brand/mark-loop-tile.svg"), tile(14, { animated: true }));

// --- X -------------------------------------------------------------------
writeFileSync(out("brand/x-avatar.png"), await png(tile(0), 400));

// The turn advancing, one seat per frame, as a GIF because X will not play an
// animated SVG.
const frames = await Promise.all(
  seats.map((_, i) => png(tile(0, { active: i }), 600)),
);
await sharp(frames, { join: { across: 1, animated: true } })
  .gif({ delay: 480, loop: 0 })
  .toFile(out("brand/x-loop.gif"));

// --- Header ----------------------------------------------------------------
// Chrome renders this one: it is the only asset with type in it, and the
// wordmark has to be the same Space Grotesk the app ships.
const font = readFileSync(
  out(".next/static/media/0c89a48fa5027cee-s.p.2cyn07wtgehh0.woff2"),
).toString("base64");

const header = `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: "Space Grotesk"; font-weight: 300 700; font-display: block;
    src: url(data:font/woff2;base64,${font}) format("woff2"); }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1500px; height: 500px; background: ${INDIGO}; overflow: hidden;
    font-family: "Space Grotesk", system-ui, sans-serif; color: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; }
  .lockup { display: flex; align-items: center; gap: 30px; }
  .lockup svg { width: 132px; height: 132px; }
  .wordmark { font-size: 112px; font-weight: 700; letter-spacing: -0.045em; line-height: 1; }
  .tagline { font-size: 30px; font-weight: 500; letter-spacing: 0.005em; color: #c3c8f4; }
  .tagline b { color: #fff; font-weight: 700; }
</style>
<div class="lockup">${tile(0).replace(`<rect width="${BOX}" height="${BOX}" fill="${INDIGO}"/>`, "").replace(' transform="translate(32 32) scale(0.85) translate(-32 -32)"', "")}<div class="wordmark">ajo</div></div>
<div class="tagline">A rotating savings circle on USDT. <b>Nobody holds the money.</b></div>`;

const tmp = out("brand/.header.html");
writeFileSync(tmp, header);
execFileSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless", "--disable-gpu", "--hide-scrollbars",
  "--window-size=1500,500",
  "--default-background-color=00000000",
  `--screenshot=${out("brand/x-header.png")}`,
  `file://${tmp}`,
], { stdio: "ignore" });

unlinkSync(tmp);

console.log("brand assets written");
