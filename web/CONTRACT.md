# Web implementation contract

Standalone browser game, no Unity runtime. Vanilla ES modules, Canvas2D, WebAudio; zero network assets/dependencies. Model is sole rule authority. Three short courtyards, choice of one relic each room. Keyboard and pointer controls. World coordinate system 1000 × 650; renderer scales preserving aspect ratio.

## model.js

Exports `GameModel`, `RELICS` (array {id,name,description}), `ROOM_NAMES` (3 strings), `NODES` (array {id,name,x,y,kind,center}). Node ids: `hub` (500,390), `dew` (230,300; center .28), `bell` (720,255; .72), `bloom` (670,510; .52), `exit` (440,125; .5). Kinds hub/mechanism/exit. Coordinates fixed; room variation in range centers by small seeded offsets; all centers supplied in snapshot nodes, never hardcoded by view.

`new GameModel(seed=number)` starts phase choose. Methods: `chooseRelic(id)` (start initial/next room), `setW(number)`, `setRisk(boolean)`, `select(nodeId)`, `move()`, `interact()` (activate mechanism at current node, bank at hub), `useAbility()`, `restart(seed?)`, `update(dtSeconds)`, `drainEvents()`, `snapshot()`. Rejected actions return false; accepted true. dt clamped/substepped; no background wall-clock jumps.

Snapshot plain data:
`{phase:'choose'|'playing'|'interlude'|'won'|'lost', seed, room:0..2, roomName, nodes:[...], node, selected, w, riskMode, range:{min,max,center}|null, canMove, availableNodes:[id], travel:null|{from,to,progress,duration,risky,stability}, carried, banked, lives, combo, relic, charge:0|1, shield:boolean, activated:[id], shortcut:boolean, shadowRemaining:number, abilityAvailable:boolean, abilityLabel:string, stats:{risks,failures,chains}, roomScore:number}`.

Hub connects to 3 mechanisms. Exit unlocked only when all 3 activated. Active shortcut links outer mechanisms. Source/destination center comes from outer endpoint (exit .5); shortcut uses destination. Safe halfwidth .105, duration 1.35s. Risk halfwidth .048, duration 2.5s, center oscillates smoothly by .075 during traversal; base center starts same as safe to allow immediate choice. Out-of-range drains stability in .65s; safe travel also fails if W changed outside accepted range. Inside restores slowly. Failure returns to source, removes unbanked claims/currency, combo reset, lives --, unless unused shell protects currency+claims and life; pulse always lost. Already banked claims never pay twice. Reward once per directed edge: safe 1/risk 3. Loss clears only unbanked claims so can reearn; risk pulse generation direction tracked separately, never farmed by loss. Novel rewarded risk success combo max3.

interact at mechanism activates once and emits 3 timed chain events, authoritative activation immediately persists; third opens real exit. Bank only hub (interact), deposits carried and marks claims banked. Enter exit auto-banks and advances interlude or won. chooseRelic in interlude sets up next room; banked/lives/stats persist, per-room ledgers reset. Relics: prism stores one pulse after novel risk success; use at hub spends pulse and activates one dormant mechanism through events, opens permanent outer shortcut. shadow at hub spends 1 carried once/room to open outer shortcut for 7s; committed segments finish even when expired. shell once/room protection. useAbility availability clear. Already entered bridge never collapses solely because shortcut timeout expired.

Events plain objects `{type, node?, from?, to?, value?, tier?, protected?, ...}` types select, move, risk, reward, activate, chain, unlock, bank, fail, shield, ability, room, win, lose, restart. `chain` node/from/to emitted at successive times (0,.25,.5), max bounded. Reset/room/failure cancel pending success cues. No DOM/window access.

## scene.js

Exports `SceneRenderer`. `new SceneRenderer(canvas,{onSelect})`, `setState(snapshot)`, `pushEvents(events)`, `render(dtSeconds)`, `destroy()`. Own canvas sizing/ResizeObserver, pointer hit-testing, particles, easing, event feedback. State rules exclusively supplied by model. Respect prefers-reduced-motion. Pointer selection callback only. World polished floating stone garden, pale parchment atmosphere, teal water/light, amber risky energy; rich layered geometry and vegetation, paths appear/disappear with W; connectors reflect actual available rules, shortcut and exit lock. No giant text overlays; compact labels and state symbols, player orb, real per-event rings and cascades. Keep game legible on small width. Canvas accessible name supplied by HTML; DOM alternative nodes supplied by main.

## audio.js

Exports `GameAudio`. `new GameAudio()`, `async unlock()` on user gesture, `setEnabled(boolean)`, `handle(events)` and `dispose()`. Starts enabled preference but no audio until actual gesture/start. Synthesize short spatial-ish warm tones/impact layers, success combo layered chords, fail cancel voices then down sound, bank resolution, unlock/win arpeggio. Prevent stacking, cap voices, cancel scheduled success on fail/restart/room. No auto looping music. UI button is responsible toggle and localStorage (main). Handle unavailable AudioContext gracefully. Sound not needed for rules.

## main.js / style.css / index.html

Integrates model/renderer/audio, DOM UI and all input. Controls: native W range (0..1 step .005), arrow/A/D fine adjustment; 1/2/3/4 select adjacent destinations; Space/Enter move; E interact; Q ability; Escape pause. Preserve native range arrows and focused button activation; other game shortcuts remain available on the range. Paused or hidden tab freezes model dt; modal choice safe. Status and ranges, reduced motion delegated to system preference. Relic choice intro overlay, result screens, restart button; explain real consequences briefly, feedback driven by scene/audio. Save only best banked result, no run resume this first browser version. Update button descendants only when their content changes, preserving click targets across animation frames.
