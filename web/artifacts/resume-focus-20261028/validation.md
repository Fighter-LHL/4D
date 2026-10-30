# Courtyard pause/resume keyboard handoff

- Base: `dccd78eb7782b5497bc3f15bb7b261dedb81f14c` (`main`, local and remote checked).
- Machine: `lvhanlindeMac-mini-48474.local`, user `lvhanlin`.
- Branch: `codex/courtyard-resume-focus-20261028`.
- Scope: restore the existing W-slider keyboard handoff when leaving the pause dialog. No model, geometry, W-range, scoring, content, audio or layout changes.
- Stop condition: the focused-control ordering fix plus regression verification and a draft PR; no follow-on feature changes, merge or deployment.

## Reproduction and rationale

Open `/?seed=10`, choose 回流棱镜, align the slice, click 暂停, wait at least one rendered frame, click 继续旅程, then press Space. On the base commit, the dialog closes with focus still on 暂停; Space reopens the pause dialog rather than crossing the bridge. See [baseline.json](baseline.json).

The frame loop disables the W slider while paused. `resumeGame()` previously tried to focus that disabled slider before the next frame re-enabled it. A disabled native input ignores the focus request. Calling the existing `updateUI()` before `.focus()` restores the intended input state synchronously.

## Acceptance and browser evidence

The candidate run in [browser-receipt.json](browser-receipt.json) passed all 12 recorded scenarios in local Chromium 130.0.6723.31, at 1280, 390 and 320 CSS-pixel widths. Each width exercises:

- Pointer pause/resume, followed immediately by Space to begin an accepted crossing.
- Three repeated journeys, with both pointer and native Enter activation of the resume button.
- Escape interruption during each crossing, frozen rule state/time for 1.4 seconds, Escape resumption and arrival at the original destination with three lives and zero failures.
- Native arrow adjustment of continuous W, layer hotkey and E activation after resumption.
- New-run pause/resume with fresh state.

The browser test uses normal click/key input. A response-appended read-only snapshot hook observes the real model and clock; it does not drive or mutate them. No synthetic blur events or OS app-switching claims are part of this verification. The run recorded no page or console errors. Desktop and 320px screenshots were visually inspected.

## Repeat locally

Run the existing static server on an available loopback port; this task uses 4175, leaving FrontEDM's 3000 reserved. The browser script uses the same locally installed Playwright dependency as the repository's existing browser scripts; it is not a runtime dependency of the game.

```sh
cd web
npm test
BASE_URL=http://127.0.0.1:4175 ARTIFACT_DIR=/tmp/4d-resume-new-run node scripts/verify-resume-focus.mjs
```

On the base source, `BASELINE=1` records and asserts the original failure. The unmodified final-head rerun is recorded in the draft PR and task delivery with its full SHA. Additional lightweight repository checks are `node --check` for the changed JS files, `git diff --check`, the legacy evidence-checker Python unit suite, and shell syntax validation. Unity compile/EditMode/PlayMode are not run for this web-only change. Narrow viewports are desktop Chromium emulation, not physical phone testing; subjective audio and native macOS window switching are not assessed.
