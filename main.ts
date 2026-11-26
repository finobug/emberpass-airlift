// Emberpass Airlift — the hand-in program (Node 22, standard library only).
//
// The game itself is the game/ folder beside this file: plain static files
// a desktop browser opens offline (game/index.html and its ES modules, no
// library, no network). This program hands it in: it copies game/ and
// screenshots/ into the output directory and writes dossier.json — the
// summary the judge reads — with the vendored make.fun library.
//
// Run it the way the grader does, or locally with an output directory:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with:  node serve.ts   (then http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (its gate refuses anything larger), so the
// dossier is built inside them: at most 4 screenshots of 256 KiB, at most
// 993 game files and 48 MiB of game in all, no game path over 1000 bytes.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
