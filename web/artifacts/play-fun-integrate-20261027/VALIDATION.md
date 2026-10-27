# 4D 双线合流 · 2026-10-27

工作树 `/tmp/4d-integrate-20261027`，分支 `codex/play-fun-integrate-20261027`。
以 Top5 `9c062bfbc33d61420be42b30b796344e3cbce942` 为第一父提交，合入 scene-push `a75688e0870031e93af6ddfd9cad01b2d30933fa`；共同基线 `cf94c0c1dfb25f541ae53e90128e1f89155cbdd4`。使用真正的双父 merge commit，保留两条分支历史。

最终 UTC、tip SHA、推送与远端核对结果见本目录本机 `DONE`。它在提交后生成，不纳入自身提交，以免 SHA 自引用。[source-manifest.json](source-manifest.json) 绑定本轮验证的源码、测试和浏览器脚本。

## 保留内容与冲突处理

| 来源 | 合流保留内容 |
| --- | --- |
| Top5 | 首次伙伴／花种短音与短字；真实收藏新鲜度、重复发现不庆祝；靠近微高亮和短提示；主 HUD「花园 0/6」「本园花种 0/3」；暂停、静音、减少动态与进度持久化。 |
| scene-push | 可前往平台脉冲预览；稳行金边；双源未启动源弱脉冲及层名；已启动源空 E 指向「去辉光源」；底栏单主 CTA；访客戳球后 1.2 秒观察拍再显示下一步；越墙 4 秒短旁白。 |

- `src/flatland/main.js` 的唯一文本冲突位于 import：采用 `VisitorCueSequence`，同时保留 `DiscoveryHints`、`discoveryFeedback`。分别初始化一个实例；同一次 `model.drainEvents()` 的事件交给访客节拍、场景、音频及原有收藏处理。没有第二次排空、重复注册或重复发现通知；HUD 和逐帧接近提示仍保留。
- `src/play-feedback.js` 自动合并后逐段人工确认：Top5 发现函数与 scene-push 的 `missingSupplySources`、`courtyardActions`、`reachablePlatforms`、第二源文案均在。未用任意一方整文件覆盖另一方。
- 对两边其余非重叠改动做逐字节比对，除本轮适配的两个浏览器脚本外全部一致，两边各 6 项新增测试完整保留。证据：[scope-check.txt](scope-check.txt)。
- 本轮没有额外玩法或产品修补；实际回归没有发现需要新增修复的合流断点。脚本适配仅增加独立端口／输出目录、浏览器版本记录、警告捕获及两段合流冒烟。

## 自动化结果

- `npm test`：**279 / 279 通过，0 失败、0 取消、0 跳过**，即共同基线 267 + Top5 6 + scene-push 6。完整输出：[tests.txt](tests.txt)。
- 原有随机种子、三庭可解、供能、隐藏路线、探索／挑战、伙伴与风暴计分检查通过；两边新增的接近、音频、短字、种子新鲜度、单 CTA、双源、访客节拍、暂停／减少动态测试均通过。
- `git diff --check`、暂存差异检查、合流入口／反馈模块及浏览器脚本语法检查通过，无未解决冲突。
- 改动限定 `web/`。庭院 `model.js` / `rooms.js`、Flatland `model.js` / `levels.js` 与共同基线完全相同；没有改 Unity、合同语义、计分规则、FrontEDM，也没有公网部署。

## 浏览器验证

macOS、Node v24.12.0、npm 11.6.2、Chromium 130.0.6723.31。启动本树独立服务 `PORT=4188 node serve.js`，浏览器直接访问 `http://127.0.0.1:4188`，没有操作原有 4173／4187 服务。只读复用主 checkout 已有 Playwright 依赖，没有安装或写入主 checkout。

| 脚本 | 1280×900 | 390×844 | 320×844 | 收据 |
| --- | --- | --- | --- | --- |
| `verify-penpal.mjs` | 通过 | 通过 | 通过，减少动态 | [receipt.json](browser-penpal/receipt.json) |
| `verify-top5.mjs`，含合流冒烟 | 通过 | 通过 | 通过，减少动态＋静音 | [receipt.json](browser-top5/receipt.json) |

两套脚本的 console warning / error、pageerror 均为空。分别使用隔离的新档，未预写收藏、未修改游戏模型状态；操作通过实际 DOM／Canvas 点击、键盘、原生滑条事件完成。只读观察快照、事件和 Web Audio 音符调度；路线参考代码，因此属于功能回归，不是陌生玩家盲玩。

- Penpal：遗物选择 → 平台预览 → 稳行 → 穿越中 E 灰显 → 第一源启动 → 供能 1/2 → 空 E 指向辉光源 → 经归响台换层 → 第二源启动／供能到齐 → 三类帮助；随后访客戳球、暂停／恢复、下一拍、越墙旁白及消退。庭院每帧检查没有多个或禁用的主 CTA。
- Top5：默认越墙 → 接近提示／暂停 → 追踪跳跳／首次短音短字 → 发现短字暂停／消退 → 访客 → 使用跳跳碰花苞／真实拾取花种 → HUD 0/6、1/3 → 刷新／同题重来持久化 → 计分挑战隐藏花园 HUD。桌面与 390px 观察到首次旋律调度；320px 静音无新增音符。
- **合流冒烟 1**：同一事件链完成访客戳球的观察拍和下一拍，然后实际拾取花种；下一拍未被发现事件重置，场景只有一条发现短字，首次伙伴与花种各只消费一次。
- **合流冒烟 2**：同一新档带着刚获得的收藏进入庭院；稳行是唯一主 CTA，穿越时无主 CTA且 E 禁用，落地切到 E 主 CTA，启动后空 E 仍指向辉光源。
- 目视检查了桌面、390px、320px 的发现／HUD、庭院预览、双源指向与越墙到达截图；未见访客主提示抢占发现短字，没有横向溢出。短字与已有物体标签在窄屏仍较密，其可读性保留真人验证边界。

关键截图：[桌面发现与访客下一拍](browser-top5/1280-seed-found.png)、[390px 花种](browser-top5/390-seed-found.png)、[320px 花种与 HUD](browser-top5/320-seed-found.png)、[390px 稳行预览](browser-penpal/courtyard-preview-390.png)、[320px 第二源指向](browser-penpal/courtyard-second-source-320.png)、[320px 越墙旁白与接近短字](browser-penpal/escape-arrival-320.png)、[320px 收藏后庭院 CTA](browser-top5/320-discovery-to-courtyard.png)。执行日志：[Penpal](browser-penpal.txt)、[Top5](browser-top5.txt)。

重现命令（先启动本树服务）：

```sh
PORT=4188 node serve.js
npm test
BASE_URL=http://127.0.0.1:4188 ARTIFACT_DIR=artifacts/play-fun-integrate-20261027/browser-penpal-rerun node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4188 ARTIFACT_DIR=artifacts/play-fun-integrate-20261027/browser-top5-rerun node scripts/verify-top5.mjs
```

## 仍建议真人试玩

1. 真机手指操作下，320／390px 的短字和平台脉冲是否够清楚；提示同时出现时是否影响观察。
2. 用扬声器／耳机判断首次发现音效的响度和满足感。本轮只验证调度和静音，没有真人听感结论。
3. 陌生玩家是否能自然完成第一次稳行、找到第二源、从戳球转向探索。收据的毫秒耗时是脚本速度，不能作为真人 30 秒／20 秒目标的证据。
4. 本轮收集跳跳和一枚花种，未重跑六园全收集，也不宣称理解度或「已经好玩」。

## 交付边界

提交包括合流源码、两边测试、适配脚本及验证产物。原有 `CODEX_TASK.md` / `codex.pid` 和本地 `node_modules` 链接不纳入提交；旧分支验证产物保留。推送前在当前命令环境取消 `HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy`，推送及远端 SHA 证据见本机 `git-push.txt`、`remote-head.txt`、`DONE`。
