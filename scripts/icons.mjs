/*
 * Draws the logo once and writes every raster the extension and the site
 * need. Run with `npm run icons` after changing anything below.
 *
 * The mark is three tiles in a column on a rounded plate, with the outer two
 * running off the top and bottom edges. Cropping them is what lets the tiles
 * be large: the middle tile, the only one carrying meaning, is 64% wider than
 * it would be if all three had to fit inside the canvas. That is the
 * difference between a legible hole and a grey smudge at 16px.
 *
 * Requires ImageMagick (`brew install imagemagick`). Its built-in SVG
 * renderer silently drops stroked shapes, which is why the middle tile's ring
 * is drawn as a filled tile with a plate-coloured tile knocked out of it
 * rather than as a stroke. The two are geometrically identical here because
 * the plate is always opaque.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(ROOT, 'node_modules', '.cache', 'icons');

/* ---- Geometry ------------------------------------------------------------
   All of it derives from two ratios taken off the original drawing, so the
   crop can be retuned without redrawing anything: GAP is the 3-unit gap on an
   8-unit tile, and CROP is the fraction of each outer tile pushed off the
   canvas. Tile size is then whatever satisfies

     (1-CROP)·T + G + T + G + (1-CROP)·T = 32,  with G = GAP·T

   which is the line below. Corner radius and ring thickness are the original
   2.5 and 1.8 on an 8-unit tile, carried along as ratios so they scale with
   the tile instead of being re-guessed. */
const V = 32; // viewBox, and the unit everything below is expressed in
const GAP = 0.375;
const CROP = 0.65;

const T = V / (3 - 2 * CROP + 2 * GAP);
const G = GAP * T;
const R = 0.3125 * T; // tile corner radius
const SW = 0.225 * T; // ring thickness
const X = (V - T) / 2; // tiles are centred horizontally
const MID = (V - T) / 2; // and the middle one vertically
const TOP = MID - G - T;
const BOT = MID + T + G;

/* The hole in the middle tile. A stroke straddles its path, so a ring of
   thickness SW on a tile of size T leaves a hole of T - 2·SW, inset by SW,
   and its corner radius is the tile's radius less the same SW. */
const HOLE = T - 2 * SW;
const HOLE_XY = X + SW;
const HOLE_R = R - SW;

const PLATE_R = 7; // 21.9% of the canvas, near enough to iOS's own mask

const n = (v) => Number(v.toFixed(4));
const tile = (y, fill) =>
  `<rect x="${n(X)}" y="${n(y)}" width="${n(T)}" height="${n(T)}" rx="${n(R)}" fill="${fill}"/>`;

/**
 * The artwork. `plate` and `mark` are colours, or CSS variables when the
 * favicon needs to resolve them per theme. `plateRadius` drops to 0 for the
 * Apple touch icon, which iOS masks itself.
 */
function art({ plate, mark, plateRadius = PLATE_R }) {
  return `<g>
    <rect width="${V}" height="${V}" rx="${n(plateRadius)}" fill="${plate}"/>
    ${tile(TOP, mark)}
    ${tile(MID, mark)}
    <rect x="${n(HOLE_XY)}" y="${n(HOLE_XY)}" width="${n(HOLE)}" height="${n(HOLE)}" rx="${n(HOLE_R)}" fill="${plate}"/>
    ${tile(BOT, mark)}
  </g>`;
}

/* Everything outside the plate is clipped, so the outer tiles stop at the
   canvas edge and the plate's rounded corners stay rounded. */
function doc(body, { size = V, canvas = V } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" width="${size}" height="${size}">
  <defs><clipPath id="plate"><rect width="${V}" height="${V}" rx="${n(PLATE_R)}"/></clipPath></defs>
  ${body}
</svg>
`;
}

/* ---- Colour --------------------------------------------------------------
   One variant, not a light and dark pair. The opaque plate is what makes that
   work: the icon supplies its own background, so it never has to contrast
   with the surface behind it, only sit on it. An ink plate is legible on a
   pale toolbar and on a dark one, where it reads as a black chip with pale
   marks rather than disappearing the way a bare ink glyph would.

   That also removes the only part of this that could not be done
   declaratively. Manifest icons are static and a service worker has no
   matchMedia, so a themed pair could only ever have been swapped at runtime
   by the popup, and only once the user opened it.

   The pair is the dark hero's feed rail, sampled and then stated flatly. On
   the page those colours are an effect rather than values: pale marks blended
   over a near-black card that indigo and violet fields drift under, so the
   column keeps shifting hue. An icon has no fields to sit in and no blend to
   run, so it takes one moment of that and fixes it, which is why the plate is
   an indigo-tinted near-black instead of the page's own --bg and the mark is
   periwinkle instead of --fg's off-white. */
const INK = '#262838';
const PAPER = '#a2a8dc';
const COLORS = { plate: INK, mark: PAPER };

const clipped = (opts) => `<g clip-path="url(#plate)">${art(opts)}</g>`;

/* ---- Rasterising ---------------------------------------------------------
   Every PNG comes down from one 1024px master rather than being rendered at
   its final size, so the small ones get a proper filtered downsample instead
   of whatever the renderer does with a 16px canvas. */
mkdirSync(TMP, { recursive: true });

function master(name, svg) {
  const src = join(TMP, `${name}.svg`);
  const out = join(TMP, `${name}.png`);
  writeFileSync(src, svg);
  execFileSync('magick', ['-background', 'none', src, '-resize', '1024x1024', `png32:${out}`]);
  return out;
}

function png(from, size, to) {
  mkdirSync(dirname(to), { recursive: true });
  execFileSync('magick', [from, '-filter', 'Lanczos', '-resize', `${size}x${size}`, '-strip', `png32:${to}`]);
  console.log(`  ${to.replace(ROOT + '/', '')}`);
}

/* ---- Outputs ------------------------------------------------------------- */
console.log('Rendering icons');

const main = master('icon', doc(clipped(COLORS), { size: 1024 }));

// The extension's own icons. WXT reads public/icon/{size}.png straight into
// the manifest.
for (const size of [16, 32, 48, 96, 128, 512]) {
  png(main, size, join(ROOT, 'public/icon', `${size}.png`));
}

// The site. favicon.svg is the one that actually gets used; the PNGs are
// there for anything that will not take an SVG icon, and icon.png keeps its
// name because older links point at it.
const SITE = join(ROOT, 'site/public');
png(main, 16, join(SITE, 'favicon-16.png'));
png(main, 32, join(SITE, 'favicon-32.png'));
png(main, 32, join(SITE, 'icon.png'));

/* iOS applies its own rounded mask and does not honour transparency, so this
   one is drawn square and full-bleed and left for the system to round. */
const touch = master(
  'touch',
  doc(art({ ...COLORS, plateRadius: 0 }), { size: 1024 }),
);
png(touch, 180, join(SITE, 'apple-touch-icon.png'));

/* The Chrome Web Store listing wants the artwork inside a 96px area of a
   128px canvas, floating in transparent padding. A full-bleed icon is fine
   in the toolbar and wrong there, so it gets its own cut: the same master
   shrunk to 96 and centred on a transparent 128 canvas. Padding the raster
   rather than transforming the SVG keeps the two in step, since the padding
   is a property of that one file and not of the drawing. This is uploaded by
   hand in the dashboard, not shipped in the build. */
const storeOut = join(ROOT, 'assets/store-icon-128.png');
mkdirSync(dirname(storeOut), { recursive: true });
execFileSync('magick', [
  main, '-filter', 'Lanczos', '-resize', '96x96',
  '-background', 'none', '-gravity', 'center', '-extent', '128x128',
  '-strip', `png32:${storeOut}`,
]);
console.log(`  ${storeOut.replace(ROOT + '/', '')}`);

/* The vector the site actually serves. It needs no theme handling: the plate
   is opaque, so the icon looks the same wherever it lands. */
writeFileSync(join(SITE, 'favicon.svg'), doc(clipped(COLORS)));
console.log(`  ${join(SITE, 'favicon.svg').replace(ROOT + '/', '')}`);

rmSync(TMP, { recursive: true, force: true });
console.log('Done');
