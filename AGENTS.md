# AGENTS.md

## Mainline
- The browser game in `web/geometry-lab/` is the mainline. `WSliceProto/` (Unity) is archival only; Unity is not installed on the dev machine.
- Keep the game dependency-free and static: no npm packages, CDN, or build step. Served by `./scripts/preview-geometry-lab.sh` at http://127.0.0.1:4175 (`LAB_PORT` overrides).

## Verify
- Tests: `node --test web/geometry-lab/tests/*.test.mjs` (Node 18+). The BFS test proves each walking level needs a mid-route W change; add new levels to `levels.mjs` and they are covered automatically.
- Syntax: `for f in web/geometry-lab/*.mjs; do node --check $f; done`
- Browser: `?level=<id>` opens a level directly. Playwright scripts used for end-to-end checks have lived in `/tmp/wslice-check` (uses local Chrome via `executablePath`).

## Design rules
- Collision comes only from the current 3D section (`geometry.mjs`), never from authored W ranges or graphs.
- W changes that would engulf the token must be refused (`wChangeEngulfs`).
- Chapters 0 and 1 share (x, z, W) layouts on purpose; chapter 2 hides the W map (peeks are counted). Every W aid (rail red zones, W-tinted floor outlines) goes through `wAids()` in `app.mjs`: it follows `mapVisible()`, so in chapter 2 it only shows while peeking, except that a refused W change briefly reveals just the bodies that refused it.
- Rail red zones, the W map's red token line and sphere floor outlines all derive from `blockedWIntervals` / `exclusionRadius`; never re-approximate them in a shader.
- Browser check harness: `/tmp/wslice-check` (`npm i playwright-core@1.47.2`; headless Chrome needs `--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL).
- Idle pages must not request animation frames.
- Scripted playthroughs are not evidence of player understanding (G0–G4 need real playtests).
