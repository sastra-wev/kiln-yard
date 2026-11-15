// Kiln Yard — a threejs-fps-01 entry (Node 22, standard library only).
//
// The game is this directory's game/ folder: plain static files the browser loads as ES modules,
// three.js 0.187.0 vendored beside them and reached through an import map. This program hands
// the game in: it copies game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json — the summary the judge reads — with the vendored make.fun library, so
// the dossier on disk is byte for byte the one the scorer builds again from the same files.
//
// Play it locally by serving game/ with any static file server and opening index.html, or run
// the demo (attract mode, bots versus bots) with ?demo=1 and a staged scene with
// ?shot=start|play|plant|end&seed=1.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps, passed to the dossier builder so an entry the scorer would refuse
// (too many files, an oversize screenshot) fails here first, at the maker's desk.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
process.stdout.write(`kiln yard: handed in game/ and screenshots/ with a fresh dossier.json under ${out}\n`);
