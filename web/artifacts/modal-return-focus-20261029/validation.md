# Help and Restart cancellation return keyboard input to play

Base: `5642daf5141028e519cecda59e1a915d09b758f2` (PR46 head, not assumed merged).
Local branch: `codex/courtyard-help-restart-focus-20261028`.

On seed 10, choose 回流棱镜, align, open Help or Restart, dismiss/cancel, then press Space. The five paths (Help ×/Done/Escape; Restart Cancel/Escape) previously left the opener focused, so native Space reopened its dialog. The new browser regression reproduced all five before the production edit; the immutable phase1 evidence separately reproduced every path twice at 1280, 390 and 320 pixels.

Only `closeHelp()` and `cancelRestart()` change: after closing and restoring the existing pause/time/audio state, call `updateUI()` before focusing the enabled W slider with `preventScroll`. This follows the existing `resumeGame()` order. No model, shortcut handling, continuous W, layout, content, geometry, audio, confirmed restart or Pause/Resume implementation changes.

Candidate verification (local Chromium 130.0.6723.31):

- 39 repeated modal-return/crossing cycles passed across 1280×900, 390×900 and 320×900. All five dismissal paths return to enabled W; immediate Space starts the selected crossing without reopening a dialog. Buttons are exercised by pointer, native Enter and native Space; Escape paths repeat twice per width.
- Every cycle also interrupts a crossing for 1.4 seconds, verifies the entire cloned snapshot and model clock stay identical, and resumes the same journey. Seed, selection, W, carried rewards, lives and failure counts are preserved. Later repeats include nonzero carried rewards.
- Native range arrows and A/D preserve continuous W. Intentional native Enter on confirmed Restart produces a fresh seed, clears rewards, restores three lives and enters a playable new run at each width.
- Unchanged PR46 Pause/Resume browser assertions passed all 12 checks. Its launch wrapper only enables Chromium's sandbox.
- `npm test --prefix web`: 315/315, zero failed/skipped. `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -v`: 24/24 (synthetic evidence-checker fixtures, no Unity execution). Changed/existing regression JavaScript syntax, repository shell syntax and `git diff --check` passed.
- Desktop, 390px and 320px rendered screenshots inspected: dialogs/buttons legible, modal removed on return, resumed crossing visible and W control available. Existing 320px header wrapping remains unchanged.

The tests drive ordinary Playwright pointer/keyboard input with native browser activation. A clearly isolated response-appended observer returns cloned model state and time; it never mutates the model or advances time. The modal test verifies the served main module exactly matches the worktree before appending its observer. There are no synthetic DOM events or programmatic test focus calls. These are headless desktop Chromium narrow viewports, not physical mobile testing. No claim covers native macOS app switching, subjective audio, human playtesting or full-game correctness. No Unity run, GitHub CI, push, PR, merge or deployment is part of this follow-up.

Re-run with an existing local Playwright installation resolvable from `web`, a server on a verified free loopback port, and fresh output directories:

```sh
BASE_URL=http://127.0.0.1:4177 ARTIFACT_DIR=/tmp/4d-modal-new-run node web/scripts/verify-modal-return-focus.mjs
BASE_URL=http://127.0.0.1:4177 ARTIFACT_DIR=/tmp/4d-resume-new-run node web/scripts/verify-resume-focus.mjs
```

`BASELINE=1` asserts the original defect on the unchanged base. Phase2 external receipts, logs and screenshots live at `/Users/lvhanlin/Documents/Codex/2026-10-28/task-3/modal-focus-wave/`; `phase2-candidate-summary.json` records candidate results. After local commit, `phase2-final.md` and `phase2-final-summary.json` identify the full final HEAD and its fresh verification receipts. Original phase1 evidence is preserved.
