# 4D 提示手感细打磨 · 2026-10-27

工作树：`/tmp/4d-play-feel-20261027`；分支：`codex/play-fun-feel-20261027`；基线：`1aa03a121645221bd81fe0b57972cb141ffdd604`。

本轮完成以下 **4 项**后停止。最终 UTC、tip SHA、推送和远端核对结果见本机同目录 `DONE`；该文件在提交后生成，不纳入自身提交，避免 SHA 自引用。[source-manifest.json](source-manifest.json) 绑定本轮验证的 61 个源码、页面、测试及脚本文件。

## 改动

1. **越墙到达旁白与靠近提示互斥。** `VisitorCueSequence.arrivalActive()` 统一提供原有 4 秒游戏时间窗口；窗口内 `DiscoveryHints` 不发射 `discovery_near`，因此 Canvas 和 ARIA announce 都不会接收到靠近提示。被抑制时不消耗区域记录或冷却；暂停冻结窗口。旁白结束后，仍符合靠近条件的区域可正常提示一次。
2. **靠近提示收紧。** 未收藏伙伴从距离 `<2` 收紧为 `<1.7`，并要求真实 `visible` 或 `peeking`，仅有跨层 `trace` 不再触发。花苞／花垫提示半径从 `<2` 改为 `<1`：seed=42 出生点距花垫 1.1，避免旁白结束后站桩接着弹花垫提示。靠近环起始 alpha 从 0.35 降到 0.22。保留每区域一次、重试／回访不重复；未修改模型的可见性、接触判定或收藏规则。
3. **首次发现音符相对增益。** fresh `friend_found` gain：0.06 → 0.075（+25%）；fresh `garden_seed`：0.055 → 0.07（约 +27%）。时长、旋律、非 fresh 分支不变，master 仍为 0.6；`friend_hop` 仍为 0.05，切片 chirp 仍为 0.03 或最高 0.055。此处是代码振幅变化，**未做真人听感**，不代表感知响度或庆祝感已经验证。
4. **窄画布短字更快消退。** 实际 Canvas CSS 宽度 ≤480px 时，靠近短字 2.2s → 1.3s，伙伴／花种发现短字 1.8s → 1.35s。桌面时长保留；暂停冻结、减少动态、离开真实提示层时清除、发现替换靠近短字的行为保留。

可选第 5 项未做，庭院 friendGuide 保持基线。没有新玩法、自动解谜或教程。

## 自动化

- `npm test`：**281 / 281 通过；0 失败、0 取消、0 跳过**。基线 279 条保留，新增 2 条：到达旁白延后首次 cue（含暂停、重试）；站桩／跨层踪迹安静，显出并接近后一次 cue。完整输出：[tests.txt](tests.txt)。
- 原有藏匿／俯视测试适配新可见性条件；现有音频测试增加相对于 hop／最强 chirp 的增益与 master 检查；现有渲染测试覆盖桌面和两种窄画布的时长、暂停、消退及减少动态。针对性测试 37 / 37：[focused-tests.txt](focused-tests.txt)。
- `git diff --check`、本轮修改文件的 JavaScript 语法检查通过。
- [scope-check.json](scope-check.json)：9 个改动的代码／测试／脚本文件全部在本 worktree `web/`。庭院 `model.js`、`rooms.js`，Flatland `model.js`、`levels.js`、`discoveries.js`、`companions.js`，庭院伙伴模块及 `verify-penpal.mjs` 与基线逐字节相同。

## 浏览器实测

macOS；Node v24.12.0；npm 11.6.2；Chromium 130.0.6723.31。使用本树 `PORT=4192 node serve.js`，URL 为 `http://127.0.0.1:4192`。未操作 :4173／:4180／:4191 服务；只读复用预先存在的 `node_modules` 链接。

| 脚本 | 1280×900 | 390×844 | 320×844 | 证据 |
| --- | --- | --- | --- | --- |
| verify-penpal | 通过 | 通过 | 通过，减少动态 | [收据](browser-penpal/receipt.json)、[日志](browser-penpal.txt) |
| verify-top5 | 通过 | 通过 | 通过，减少动态＋发现期间静音 | [收据](browser-top5/receipt.json)、[日志](browser-top5.txt) |

两套脚本的 console warning / error、pageerror 均为空。隔离的新档，未预写收藏，未直接修改游戏模型；使用真实 DOM、Canvas 指针、键盘、原生 range input/change 事件。只读观察事件、快照、浮字及 Web Audio oscillator start。这是参考代码路线的功能回归，不是陌生玩家盲玩。

`verify-top5` 新增检查：

- seed=42 越墙开局站桩至游戏时间 ≥4.2s，所有 `discovery_near` 为零。
- 同题重来后，主动将 S 调到 4.7 显出近处伙伴；在旁白内确认无近处事件／announce，暂停后窗口不推进；恢复后第一次 cue 分别在 **4.0104 / 4.0113 / 4.0117s** 出现，均已结束旁白。
- 每帧检查旁白是否与 near popup 或其 announce 共存，违规为零；伙伴区域只提示一次，未推进追逐步骤。
- 桌面靠近短字消退观测约 2.1921s；390／320 约 **1.2930／1.2927s**（按游戏时间、包含同帧首次老化），消退时伙伴仍在原处。两种窄屏伙伴／花种发现 duration 均为 1.35s，暂停和消退检查通过。
- 保留首次伙伴与花种各一次、静音无新增音符、存档／同题重来、HUD、挑战切换、访客观察拍＋下一拍与发现共存、携新收藏进入庭院的单主 CTA 冒烟。

`verify-penpal` 原样通过三宽度：遗物选择、平台预览／稳行、穿越中 E 灰显、双源启动及「去辉光源」、三类帮助、访客戳球／暂停／下一拍、越墙旁白和消退。

目视检查桌面、390、320 的旁白／靠近、消退与发现截图。旁白窗口内未出现靠近短字；靠近短字与伙伴本体错开，随后按短时长消退，无横向溢出。320px 花种短字出现的一瞬仍会与已有物体标签靠得很近，本轮通过缩短停留减轻遮挡，没有宣称彻底消除所有叠字。

关键截图：[320 旁白内显出伙伴](browser-top5/320-arrival-visible-friend.png)、[320 靠近](browser-top5/320-approach.png)、[320 靠近消退](browser-top5/320-approach-cleared.png)、[390 靠近](browser-top5/390-approach.png)、[390 首次伙伴](browser-top5/390-friend-found.png)、[320 伙伴短字消退](browser-top5/320-friend-found-cleared.png)、[320 花种](browser-top5/320-seed-found.png)、[桌面旁白](browser-top5/1280-arrival-visible-friend.png)。

复现（使用可用的独立端口；再次验证请另建输出目录以保留本轮证据）：

```sh
PORT=4192 node serve.js
npm test
BASE_URL=http://127.0.0.1:4192 ARTIFACT_DIR=artifacts/play-feel-20261027/browser-penpal-rerun node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4192 ARTIFACT_DIR=artifacts/play-feel-20261027/browser-top5-rerun node scripts/verify-top5.mjs
```

## 交付与仍需验证

提交仅包含本工作树 `web/` 的四项改动、测试／脚本与本轮验证产物。原有 CODEX_TASK.md、LAUNCHED.txt、codex.pid、codex-exec.log 和 node_modules 链接不纳入提交。推送命令取消 `HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy`；推送及远端 SHA 结果见本机 `git-push.txt`、`remote-head.txt`、`DONE`。

本轮没有写主 checkout 源码，未改 Unity、合同语义、计分或 rooms 几何，未操作 FrontEDM、Cloud Agents 或公网部署。

仍建议真人使用手机／桌面试玩，判断更近的提示是否容易错过、1.3／1.35 秒是否足够阅读；使用扬声器和耳机判断首次发现相对于日常 chirp 的声音层次。未做真人听感、真机触控或陌生玩家理解度验证，未重跑六园全收集，也不宣称「已经好玩」。
