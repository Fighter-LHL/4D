# Build-exclusive routes and the rift trial — 2026-10-23

Native-web iteration after `6383e3e`, branch `codex/courtyard-risk-feedback`. Prior implementation and evidence remain in the synergy/random-room folders. These are agent-run checks, not human player acceptance or subjective listening tests.

## Automated checks

`npm test --prefix web`: **120/120 pass** — 32 model, 6 generation, 20 existing synergy, 16 hidden-route, 30 audio and 16 scene tests. Full output is in `tests.txt`.

New coverage includes all three build recipes through real room progression, their actual action prerequisites, ordered supported W entries, wrong-order resets, no gap/idle/transit seal farming, persistent seals and unlocked bridges, irreversible trial payment, every wave's fresh-entry requirement, partial failure, shell protection after payment, one-time rewards, committed ascension, three-mechanism exit gating, pause/reset, isolated snapshots, correct W surfaces, capped/reduced-motion effects and audio cancellation.

The final renderer regression checks the distinction between being in the safe layer and having actually entered it during the current rift wave. Canvas and the warning panel both remain dangerous until `wave.entered` is true; leaving the actual safe layer makes both dangerous again.

JavaScript syntax checks and `git diff --check` passed. No external runtime package or network asset was added.

## Independent model audit

Run from the repository root:

```bash
node web/artifacts/hidden-routes-20261023/independent-audit.mjs
```

This uses its own snapshot graph search and public model commands, not the model's recommended route or the new unit-test helpers. `rooms-before-hidden.mjs` is the prior committed room module from `6383e3e`, retained solely to check seed compatibility. Results are in `independent-audit.json`:

- **300 courtyards** complete via the basic route without relic abilities.
- **300 courtyards** retain their original seed signature, orientation and pre-existing node coordinates.
- **2,400 new-edge endpoint checks** confirm actual support and geometry clearance.
- **3 recipes × 4 templates** complete real acquisition, required actions, W seals, hidden round trip, trial and exit. Repeating seals or previously rewarded directed crossings adds no currency.
- Seven further cases cover leaving safety after entry, gaps, same-layer gap bouncing, second-wave failure with no partial reward, return and normal completion after failure, shell retaining only post-payment holdings, preserved seals without travel/respawn replay, and recovery to safety before the deadline.
- **467,846 simulation steps**. These samples do not exhaust every seed or every continuous W/timing interleaving.

## Actual browser play

Used visible controls in the in-app browser at `http://127.0.0.1:4173/`, without injected model state or hidden test APIs.

### Run A: coil → prism → coil upgrade, seed 0

1. Completed split courtyard with coil. Chose prism at the second courtyard, return. Activated the source, returned to hub, then switched W to remotely activate bell with coil.
2. Reached relay. The visible ritual required **Ⅱ → Ⅲ → Ⅰ**. Arrival while already in Ⅱ did not count; left it, entered all three seals, and opened the relay → rift route in layer Ⅰ (`01-seal-ready.png`, `02-hidden-trial-entry.png`).
3. Entered with 4 carried, paid 2, switched to the three displayed safe layers **Ⅲ → Ⅰ → Ⅱ**. Full success left 11 carried. Growth reached stage 3, but the exit stayed locked at **2/3 mechanisms** (`03-ascension-gate-locked.png`).
4. Returned along the hidden bridge to relay and spent the prism charge earned by the trial to activate the flower remotely. The ascension bridge then opened at the exit's layer Ⅱ (`04-ascension-route-open.png`). Walked it to the third courtyard, with **17 banked** (`05-hidden-path-next-courtyard.png`). This combination completed the remote mechanism chain without visiting bell or flower in that courtyard.
5. Upgraded coil to rank II. In the third courtyard, actual W entries remotely activated both downstream mechanisms. Repeated the new courtyard's ritual **Ⅰ → Ⅲ → Ⅱ**, and reached rift with 4 carried.
6. At **320×820**, paid 2 and passed wave 1. Deliberately stayed in the now-dangerous layer during wave 2: failed, received no partial reward, carried became 0, lives 3 → 2, no ascension, no retry. The hidden return bridge reopened. All three W controls were simultaneously visible, document width was 320 (`06-mobile-rift-warning.png`, `07-failed-trial-return.png`).
7. Returned to relay and used the ordinary gate. Full three-room result: **19 banked, 1 adventure success, 9 mechanisms, 1 deliberate failure** (`08-three-room-completion.png`).

Screenshots 01–08 precede the final Canvas fresh-entry safety correction, shortened coordinate formatting and minor wording changes. They document those actions, not the final rendering of those details.

### Run B: weave → shadow, fresh final renderer, seed 0

1. Reloaded after the renderer fixes, completed the first courtyard, and selected shadow at return courtyard. Activated the three mechanisms and succeeded at the layer-Ⅱ-safe lock challenge to earn a bridge seed.
2. At the remote bell, clicked the real shadow button. Returned to relay and clicked weave while its ghost was alive. The permanent bell → hub bridge appeared. Returned to hub after the ghost expired: eligibility remained and **Ⅲ → Ⅰ → Ⅱ** seals were shown next to the actual W buttons (`09-mobile-shadow-seals.png`).
3. Completed the seals and traversed hub → rift in layer Ⅱ. This entry differs from Run A's relay entrance. Both active relic buttons worked on the 320 px layout.
4. Deliberately stood in the first safe layer Ⅲ **before** opening rift. Paid 2 (14 → 12). Canvas ring and warning remained dangerous and explicitly required a new entry, matching the fixed rule (`10-rift-needs-new-entry.png`). Paused, performed independent checks, resumed, switched out and back in, then completed **Ⅲ → Ⅰ → Ⅱ**. Pause did not consume the countdown.
5. Full success left **21 carried**, with 3 lives intact, and produced the final persistent shrine wings/halo, three canopy connections, tall pillars and the gold ascension bridge (`11-mobile-success-route.png`, `12-final-ascended-courtyard.png`). Checked the updated help and returned to the scene. Console warning/error inspection was empty.

The second run verifies two-room acquisition plus hidden trial completion, not another full three-room run. The third recipe, shell + weave, was exercised through the automated and independent real-progression model paths across all four templates, rather than separately played in the browser.

Finally loaded the latest source at the root URL and left the initial choice ready for the player: seed **697373058**, cascade → return → confluence. Verified the restored **1769×1224** viewport, matching document width, and empty warning/error logs.

## Evidence boundaries

`source-sha256.txt` binds final runtime, tests, documentation and audit sources. Screenshots 09–12 use the final renderer and model. One later UI-only wording adjustment makes an existing flower path say it is temporarily retracted during a wave, rather than implying missing prerequisites; its normal successful-state appearance is unchanged.

These are three authored, build-gated entrances to one optional shrine per courtyard, not three new room templates or unlimited generated maps. Seals and new bridges last for the current courtyard. All bridges still require their actual W slice, and every exit still requires the three ordinary mechanisms. Screenshots show persistent results, not a full animation or sound recording. Audio scheduling and bounds were tested; subjective sound balance, understanding and motivation need human playtesting. Local preview only; no public deployment.
