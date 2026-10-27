# Codex：4D 首局可体验 · 庭院一个清晰节拍（web only）

工作目录：本 worktree 的 `web/`（分支 `codex/play-fun-courtyard-beat-20261027`，基线 `origin/main` ≈ a08e210，已含首局提示层 #36）。
目标：新档平面国发现一次 → **进庭院后完成一个清晰节拍**，陌生玩家不靠说明书也能感到「这一拍做完了」。

## 背景
- 提示层摩擦（旁白互斥、靠近半径、fresh SFX、窄屏短字）已在 tip `a08e210`，**不要重做、不要回退**。
- afterglow / onward glint / landing E / momentum / friendGuide 稳行收口已在基线，可微调衔接，勿大改教程树。
- VALIDATION 仍建议真人试玩；本轮把「庭院首拍」从「有多种微反馈」收敛成**一个可读完的节拍**。

## 必做（3–4 项即停）
1. **首进庭院只强调一个主节拍**：首次携收藏进庭院后，在约 1–3 秒内让玩家明确「下一步只做这一件事」（优先复用已有落地轻亮 / 单主 CTA / 可达平台 pulse，不要新增大段文案或第二常驻 HUD）。验收：verify-penpal 庭院段能看到单一主 affordance；静置不刷第二提示。
2. **节拍兑现一次正反馈**：玩家真正走到/启动被强调的下一步点时，给一次短促正反馈（既有音效/辉光/访客拍通道择一），然后该主强调消退或降级；未跟随则安静，不要催促字。
3. **与既有互斥保持**：落地后 friendGuide 收起、H 求助即时让位、旁白/短字互不叠抢；回访庭院不重播首拍强调。
4. （有余量）若首拍兑现后下一拍仍空，最多再给一次既有「下一来源/访客」轻提示；不要新教程树。

## 不要动
合同/计分/房间几何、Unity、公网部署、Cloud Agents、选择弹窗大改、visitor-next-beat 大逻辑重写、平面国发现提示层（#36）已调参数。

## 验收
1. `npm test` 全绿；跑 verify-penpal + verify-top5（1280/390/320）。
2. commit + push 本分支；`gh pr create` 打到 `main`（标题写明庭院首拍/首局可体验）。
3. 在 `web/artifacts/play-courtyard-beat-20261027/` 写 `DONE`（tip SHA、PR URL、测试数）与 `VALIDATION.md`。
4. 仍建议真人试玩一句即可。

写完后结束。
