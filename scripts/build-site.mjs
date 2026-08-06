// Produces the deployable copy of site/public.
//
// site/public is the source of truth and keeps every comment; the comments in
// index.html carry the reasoning behind the layout and the rail animation and
// are worth more than the bytes they cost. They are worth nothing to a visitor
// though, so they are stripped on the way out: about 30 KB of CSS comments,
// which is roughly 10 KB gzipped, or 39% of what the document currently
// transfers.
//
// Nothing here writes back into site/public. Run it, then deploy the output.
//
//   node scripts/build-site.mjs [outputDir]

import { cp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'html-minifier-terser';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'site', 'public');
const output = resolve(process.argv[2] ?? join(root, 'site', '.build'));

// Deliberately conservative. Comment removal and CSS/JS minification are where
// all of the saving is; collapsing HTML whitespace is worth a few hundred bytes
// and can change how inline elements render, so it stays off.
const options = {
  removeComments: true,
  minifyCSS: true,
  minifyJS: true,
};

async function htmlFilesIn(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlFilesIn(path)));
    else if (entry.name.endsWith('.html')) found.push(path);
  }
  return found;
}

if (output === source) {
  throw new Error('refusing to build over site/public, which is the source');
}

await rm(output, { recursive: true, force: true });
await cp(source, output, { recursive: true });

for (const path of await htmlFilesIn(output)) {
  const original = await readFile(path, 'utf8');
  const minified = await minify(original, options);
  await writeFile(path, minified);

  const name = relative(output, path);
  const was = gzipSync(Buffer.from(original), { level: 9 }).length;
  const now = gzipSync(Buffer.from(minified), { level: 9 }).length;
  const saved = Math.round(((was - now) / was) * 100);
  console.log(
    `${name}: ${(was / 1024).toFixed(1)} KB -> ${(now / 1024).toFixed(1)} KB gzipped (-${saved}%)`
  );
}

console.log(`\nbuilt to ${relative(process.cwd(), output) || output}`);
await stat(join(output, 'index.html'));
