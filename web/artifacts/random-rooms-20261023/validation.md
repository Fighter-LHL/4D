# Random rooms and cross-layer feedback — 2026-10-23

Scope: native-web iteration after `f26dffe`. Prior Unity and web evidence is preserved. These are agent-run checks, not human player acceptance or a subjective audio/fun assessment.

## Automated validation

- `npm test --prefix web`: **58/58 pass**: 30 model, 6 generation, 16 audio, 6 renderer tests.
- Generation suite solves 100 seeds × 3 rooms without relic abilities; checks deterministic previews, all four templates, all six layer permutations, real XYZ projections, co-visible platform clearance, supported bridge endpoints, independent branches and AND prerequisites.
- Model tests cover failure/reward identities, all three hazard variants, second-wave failure with no partial reward, unsupported gaps, shell protection, once-only challenges, committed power, relic persistence and temporary-bridge expiry.
- Audio uses a mocked Web Audio graph, including model-clock warnings, stage replacement, short intermediate dodge cue, one full reward melody, tiered resolution, room cadence, cancellation and bounded voices. No subjective listening claim.
- Renderer tests draw actual generated snapshots with finite Canvas calls, independent input slots, two danger planes, unsupported-gap danger, delayed bridge resonance, cancellation, bounded effects and reduced motion.
- `node --check` for changed JavaScript and `git diff --check`: pass.

## Independent branch audit

Reproducible scripts in this folder use model actions and their own state traversal, not the model's route recommendation or template solution order:

```bash
node web/artifacts/random-rooms-20261023/reachability-audit.mjs
node web/artifacts/random-rooms-20261023/shadow-transit-audit.mjs
```

Final geometry-filtered source: 64 seeds × 3 rooms, **7,754 stable states**, four templates, 166 distinct signatures. Every enumerated state can reach an exit. Additional checks pass for 642 expired-shadow endpoint states, 116 committed crossings where the shadow expires mid-bridge, and 48 vault success/failure plus return cases. These checks sample stable layer centers and public gameplay transitions; they are not an exhaustive proof over continuous W, all seeds, or all timing interleavings.

## Real in-app browser

Normal buttons and Playwright locators at `http://127.0.0.1:4173/`; no injected model state or hidden test API.

1. Seed **4**: complete three-room route **confluence → return → cascade**, with chase → lock → single hazards. Selected prism, then added shadow, then shell. Interlude visibly retained earlier relics; final result **31 banked, 2 risk successes, 9 mechanism activations, 0 failures**. The single hazard in this run was skipped; it was separately exercised with seed 1. `03-persistent-build.png`, `04-three-room-completion.png`.
2. Confluence: activated one source and changed W at identical XYZ into the receiving bell. UI showed **1/2 power** and disabled activation. Visiting the second independent source enabled complete power; a charged prism later activated the bell from the matching-layer anchor.
3. Chase: first danger was tide; moved to echo. Second wave then made echo dangerous and required another switch to tide. No +6 after the first wave; complete success awarded +6 and one prism charge. `07-chase-second-wave.png`; `08/09/10-success-*.png` are consecutive early success frames, not a recording of the full timed effect.
4. Return: initiated the far bell, changed W at the same XYZ into its flower, and opened the origin-side exit. A shadow showed the configured flower-to-hub shortcut. Letting it expire still left the normal flower → relay → hub return. `02-return-room.png` shows the completed mechanisms and alternate geometry.
5. Lock: UI marked tide and bloom dangerous and echo as the only safe layer. Switching to echo awarded +5, then switching back to the entry layer restored return travel. Returned to the origin-layer gate and proceeded to the next room.
6. Cascade: activated source → same-position bell → remote flower; all three relics remained owned. A flower shadow opened the valid flower-to-exit shortcut and the run completed.
7. Seed **1**: fresh split room. Activated the supply bell first; the flower received power, but the hub-to-relay bridge was unavailable. Then activated the independent bridge pump, traversed the newly opened route and activated the flower. This checks the two necessary branches in reverse suggested order.
8. Seed 1 single vault: banked 8, entered the echo-layer chest, switched to tide and received +4 (carried 1 → 5, prism 0 → 1). At **320×820**, opening the hazard scrolled its scene and W buttons into view together. `05-mobile-wave.png`, `06-mobile-success.png`.
9. Width checks: document scrollWidth equals viewport at **320** and **375** pixels; at 375, all three W buttons fit within the viewport. Desktop restored to its original 1769×1224 viewport. Desktop controls and progress panel are visible together.
10. Fresh seed 4 replay showed the same plan and geometry. Clicking the actual new-run confirmation changed the URL seed to **4260690400** and produced cascade → confluence → return with lock → chase → single. The initial choice is left open for the user (`01-new-random-journey.png`). Warning/error browser logs were empty at final inspection.

## Boundaries

Four authored templates are randomly combined with layer permutations, valid transforms and three hazard rules. This adds repeatable variation, not unlimited unique maps. W remains authored XYZ/W section support and actual graph connectivity, not arbitrary 4D physics. Voice structure and timing were tested; subjective sound quality and whether players enjoy or understand the new challenges need human playtesting. Local preview only, no public deployment.
