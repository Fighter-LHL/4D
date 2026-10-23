# W-Slice web spatial/build validation — 2026-10-23

Scope: the second native-web iteration after baseline `4b6216c`. Unity artifacts and first-web evidence are unchanged. This is agent execution evidence, not independent player acceptance or a subjective fun/audio evaluation.

## Automated checks

- `npm test --prefix web`: **41/41 pass** (29 model, 12 audio).
- `node --check web/src/main.js`, `node --check web/src/scene.js`, and `git diff --check`: pass.
- Model checks cover same-XYZ W transfer with no reward, continuous section support, delayed power surviving ordinary collapse, locked graph order, late W arrival rejection, risk correction across frame rates, bank/claim identity, relic accumulation/upgrades, wave deadlines/gaps/once-only rewards, retained committed ghost bridge, and all three rooms solvable with each starting relic without ability use.
- Added regression for a real softlock: a dew ghost cannot open bell→relay before bell activation. Waiting for its expiry still leaves the baseline route completable.
- Audio tests use a mocked Web Audio graph and real model events: distinct layer cues, rapid-switch cancellation, bounded voices, model-clock warning beats, pause/resume and slow frames, mute/reset/failure cancellation, same-frame received power plus failure, and no duplicate reward melody on evade.
- Renderer agent drove 36 W/viewport/reduced-motion mock states and actual-model routes. Checked finite drawing calls, save/restore balance, effect caps, same-position hit targets, unsupported target rejection and committed edge retention.

## Real browser controls

Used in-app browser at http://127.0.0.1:4173/, normal buttons/keys/locators; no injected model state or hidden test API.

1. Full three-room run, seed suffix `532B5`: first pick shadow, then add prism, then add shell. UI showed 1→2→3 owned relics; banked score and lives carried across rooms. Final result: **17 banked, 1 risk success, 9 mechanisms, 2 failures**. `three-room-complete.png` records this run before the final targeted review fixes (which received fresh automated and targeted browser checks).
2. Tide pump at XYZ `-4,0,0`, W `.18`; after switch, echo bell at identical XYZ and W `.50`. Pump power enabled bell; bell latched hub→relay and powered bloom. The two `*-same-position.png` images show the physical and path changes.
3. Shadow left on tide source opened the bell→relay route after bell activation; arrived on stable relay, changed to bloom and opened the exit. Bloom shadow separately opened bloom→exit.
4. Vault optional branch: activated chest in echo layer; changed to tide before deadline. Carried increased by 4, combo increased, prism charge became 1. Returned through echo bridge; at relay in bloom layer spent prism charge to activate powered bloom and unlock exit without visiting it.
5. Shell consumed its room protection on unsupported W shift; lives and carried currency retained. A later unprotected vault failure lost 4 carried and reduced lives 3→2; banked 14 stayed unchanged. Vault could not be reopened. Wave failure remains on the permanent vault pedestal and the return bridge reopens.
6. Fresh final audio-clock integration: paused an active wave at visible **2.1**; after independent work the DOM countdown remained **2.1**. Resume and tide switch succeeded. Real subjective listening was not performed; mocked audio timing checks and browser error logs are the audio verification boundary.
7. Final 320×812 browser pass: fresh reload, early dew shadow then echo displayed only the valid hub destination while bell remained inactive. After activating bell, took normal route to vault. Opening chest automatically scrolled the canvas top to **0**, layer buttons bottom to **378**, and document width/scrollWidth were both **320**. `mobile-warning.png` captures the danger and controls together. Subsequent tide switch succeeded (+4).
8. Renderer agent also checked 375-pixel width, no horizontal overflow. Root restored the temporary viewport override. Root final tab warning/error logs were empty.

## Review corrections

- Layer buttons no longer accidentally include the body's `data-layer` attribute in their selection loop.
- Ability/destination controls are not replaced each frame; model events set renderer state before spawning effects.
- Passive power arrival and shadow expiry respect an explicitly chosen valid destination.
- Help/pause/restart confirmation cancel old sound tails and freeze rules. Automatic choice/result dialogs freeze play but allow the new outcome melody to finish. Visibility change synchronizes audio immediately even during a result.
- Hazard sound follows model time, not wall-clock scheduling. Actual power feedback survives an ordinary same-frame failure.
- Text reflects current layer, consumed chest, first-time direction rewards, and locked early shadow routes.

## Remaining scope

Three rooms reuse one authored topology, with later bridge-width variation and accumulated builds. No random maps, enemy roster, meta progression, arbitrary four-dimensional geometry engine, or human playtest result is claimed. The web implementation evaluates authored XYZ/W section support and graph connectivity. Local-only preview, no public deployment.
