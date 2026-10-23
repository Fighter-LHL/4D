# Relic synergies and growing routes — 2026-10-23

Native-web iteration after `b29b031`, on `codex/courtyard-risk-feedback`. Earlier artifacts are preserved. Checks below use the implemented rules; they are not human player acceptance or a subjective assessment of sound or enjoyment.

## Automated validation

- `npm test --prefix web`: **91/91 pass** — 32 model, 6 generation, 20 synergy, 22 audio, 11 scene tests.
- New tests cover complete downstream power, actual supported W entry, finite coil uses, travel/wave/gap exclusions, prism-to-coil chains, earned weave charges, remote planting through a live shadow, irreversible source claims, failure persistence, all vault-edge closures, parallel-edge selection and committed edge identity.
- Renderer checks use real generated snapshots; verify permanent flowers/bridges, correct W surfaces, finite drawing, bounded effects and reduced motion. Audio checks use a mocked Web Audio graph, including staged growth, committed world feedback after failure, pause/mute/reset cancellation and voice limits.
- Changed JavaScript syntax and `git diff --check` pass. The final CSS-only mobile correction was subsequently checked through real clicks at 320 px.

## Independent model audit

Run `node web/artifacts/synergies-20261023/independent-audit.mjs` from the repository root.

- 100 seeds × 3 rooms: **2,400 new-bridge endpoint support checks**, all four templates and all six W permutations.
- Each template: earn a seed, plant and traverse both directions, fail, retain the bridge, reject repeated-source recharging, complete mechanisms, close every vault edge during the hazard, finish the hazard, traverse the grown bridge and reach the exit.
- Pending growth survives a failure before stage 3 without bypassing the vault's original gate. Moving, standing on an ordinary platform, bouncing through an unsupported gap, or already waiting in a target layer cannot trigger coil.
- Same-seed route comparison: baseline bell → hub → relay; weave bell → relay; coil dew → hub, then a real W entry activates bell remotely before hub → relay.
- Shadow + weave acquired through actual room progression: remote planting requires a live ghost, remains after expiry, and coexisting temporary/permanent edges select the correct committed route.
- A separately reviewed exhausted-coil display bug was fixed: no new armed marks after the last use; the UI says the budget resumes next courtyard. This was also observed in the full browser run below.

These are sampled public model transitions, not an exhaustive proof over all seeds or continuous W/timing combinations.

## Real browser actions

All play used ordinary visible controls in the in-app browser at `http://127.0.0.1:4173/`, without injected state or hidden test APIs.

1. **Seed 0, complete three-courtyard run:** split → return → cascade, with chase → lock → single hazards. Chose weave → shadow → coil. Result: **39 banked, 3 successful adventures, 9 mechanism activations, 0 failures** (`07-three-build-completion.png`).
2. Split: survived both chase waves, earned a bridge seed, walked the new vault → relay flower path, activated the flower, planted its direct hub bridge and used it to return and bank (`04-planted-route.png`).
3. Return: completed the lock, left a shadow at the remote bell and returned to the relay; planted the bell → hub bridge remotely. The shadow expired and the planted bridge remained available and was used (`05-shadow-remote-weave.png`).
4. Cascade: after powering bell, returned to hub and changed to its actual W layer; coil activated bell without visiting it. Once its budget was spent, the flower did not auto-activate or show a misleading ready mark. Completed the single-wave hazard and planted another bridge. At 320×820, the warning and W controls remained usable (`06-mobile-challenge.png`).
5. An earlier partial seed 4260690400 run demonstrated remote coil activation, grown flower path and next-room synergy previews (`01`–`03`). Those screenshots precede the exhausted-coil mark cleanup; they are historical intermediate evidence, not the final state of that detail.
6. Mobile testing found an inherited grid rule stacking both active relic buttons into one cell. Fixed it. Fresh **seed 11**, second courtyard at **320×820**, clicked the real shadow button successfully; both buttons had distinct rectangles and their center hit tests resolved to their own IDs (`08-mobile-ability-buttons.png`). Then traversed the temporary shadow shortcut. A later lock attempt in this auxiliary run failed because the agent's next tool call arrived after the countdown; it is not included in the successful three-room run above.
7. Fresh **seed 4260690400** on final source: selected weave, activated dew/bell, completed the lock in its known safe layer, and waited for the flower path. From vault, relay showed **Ⅱ 花径**; from relay, vault also showed **Ⅱ 花径**, correctly using the actual bridge layer even though the vault node belongs to layer Ⅲ. Traversed the new bridge, activated flower, and clicked the real weave button at **320×820**: charge 1 → 0, one permanent planted bridge (`09-mobile-weave-click.png`).
8. Final 320 px check: document width equals viewport, with no horizontal overflow. Earlier 375 px inspection likewise had no horizontal overflow. Desktop returned to **1769×1224**, showing the grown gold flower path and green planted return bridge (`10-grown-courtyard.png`). Final warning/error console log inspection was empty.
9. Used the actual new-run confirmation and left the initial relic choice ready for play: seed **2984189531**, split → return → confluence, lock → single → chase. Viewport reset was verified at **1769×1224** with no horizontal overflow.

## Evidence and limits

`source-sha256.txt` binds the final source, tests and rule documentation. Screenshots 04–07 document the full run before the final destination-badge and mobile-button corrections; 08–10 document those fresh corrections. Still images show persistent geometry and state, not the complete timed animation or audible output.

Each courtyard's first eligible risk success grows one real route; subsequent risk success can replenish eligible relic resources without replaying the same world growth. Permanent planted bridges last for the current courtyard, not later rooms. All new routes retain their actual W layer and the exit still needs all three mechanisms. Local preview only; no public deployment. Human playtesting is still needed to assess readability, sound balance and motivation to attempt the next courtyard.
