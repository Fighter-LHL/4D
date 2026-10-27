# First-session playable tighten round 2 — PASS

日期：2026-10-27。分支：`codex/play-first-session-tight2-20261027`。基线：`ee2d822f5fd67eeb89ee113f6d74f219bb9e5461`（main，#40 已合并）。工作树：`/tmp/4d-play-first-session-tight2-20261027-wt`。完整证据：`/tmp/4d-play-first-session-tight2-20261027`。

## 选择的断点

真实新存档在 Flatland 完成三次追逐、收藏跳跳、点击「去庭院」后，入口仍显示「随机旅程」「带一件，就出发」和五件同等权重的陌生遗物。默认键盘焦点落在需要冒险蓄能的回流棱镜上，没有接住刚获得的伙伴，也没有一个清楚的初次出发动作。

三宽度基线均实际复现：[基线收据](baseline-transition/receipt.json)；[1280](baseline-transition/choice-1280.png)、[390](baseline-transition/choice-390.png)、[320](baseline-transition/choice-320.png)。另有完整基线 penpal 三宽度 PASS，原始收据保留在 ART/baseline-penpal。

## 最小修改

- 仅在真实收藏、`from=discovery`、原有首进预算尚未消费时显示新选择页。标题使用实际伙伴名（本轮为「跳跳也来了。」），已有说明改为「带上缓落壳，先走一座桥。」
- 唯一主按钮为「带缓落壳出发」，原有缓落壳说明保留；默认焦点在此。玩家点击或按 Enter 才调用原有 `chooseRelic`，不自动装备、不自动开始。
- 其余四件遗物位于原生「换一件遗物」details 中，键盘和指针均可展开选择。全部五件遗物仍在，模型规则与能力没有更改。
- 同页面重开、刷新回访、普通入口、没有收藏的 discovery URL、下一庭选择都使用普通选择页。入口继续使用既有持久化预算，仅增加一次性的页面内选择页标志。
- 运行时只改 `src/main.js` 和六条 CSS 规则；[范围核对](scope-check.json) 验证 64 个受保护文件与基线逐字节一致，包括模型、房间、全部 Flatland 运行模块、momentum、供能反馈、音频、HTML、合同与单测。没有新增游玩提示、浮字、声音、计时器或第三拍。

## 验证

`verify-penpal` 与 `verify-top5`：**1280×900、390×844、320×844 六组全部 PASS**；两套 warning/error/pageerror 均为空。320 覆盖 reduced motion，TOP5 另覆盖静音。[浏览器汇总](browser-summary.json)；[penpal 原始收据](browser-penpal-attempt2/receipt.json)、[TOP5 原始收据](browser-top5-attempt2/receipt.json)。

| 实际路径 | 结果 |
| --- | --- |
| 首进选择，六组 | 真实伙伴名、唯一主动作；默认焦点正确；折叠/展开均无滚动，按钮不溢出 |
| 键盘选择 | Tab 定位，Enter 展开/收起，Shift+Tab 回主按钮，Enter 出发；浏览和等待不装备、不推进时间 |
| 替代遗物 | penpal 390 展开后实际点击留影扣，模型只装备 shadow；其余五组实际选择 shell |
| 原有首玩链路 | penpal 三宽度完成三机关和真实供能；第二拍后再等 6.2 秒，无第三拍、自动闲置提示或文字冲突 |
| H 与回访 | 保留三个阶段 H 打断、暂停、迟延兑现和安静回访；同页重开、刷新回访均恢复普通选择 |
| 下一庭 | penpal 三宽度真实过门，interlude 仍显示模型提供的全部五件选择，随后真实选取继续 |

已目视核对最终三宽度主选择页：[1280](browser-penpal-attempt2/courtyard-entry-choice-1280.png)、[390](browser-penpal-attempt2/courtyard-entry-choice-390.png)、[320](browser-top5-attempt2/courtyard-entry-choice-320.png)；另检查 [390 替代选择](browser-penpal-attempt2/courtyard-entry-alternatives-390.png)、[320 展开](browser-top5-attempt2/courtyard-entry-alternatives-320.png) 和 [320 首机关结束后安静](browser-penpal-attempt2/courtyard-second-beat-settled-320.png)。

三个修改的 JS/MJS 通过 `node --check`，`git diff --check` 通过。[静态检查](static-checks.json)；[验收源码 SHA-256](source-manifest.json)。最终浏览器运行期间四个修改文件保持一致。

单测：315/315 PASS，0 fail、0 skipped，[收据](test-summary.json)。本次为可逆选择页修改，新增覆盖放在真实浏览器中，没有添加镜像实现的单测。

新增浏览器断言覆盖：单一主动作与默认焦点；展开后五件可见；Tab / Enter / Shift+Tab 操作；折叠及展开均无需滚动且主按钮文字不溢出；等待与浏览不改变模型；缓落壳及替代留影扣均只装备实际所选遗物；首进预算、同页重开、回访和下一庭选择。[断言核对](assertion-audit.json) 确认没有删除原有断言行，新增 32 行断言。所有原有两拍时机、等待后兑现、H 中断、供能、单主 CTA、完整三机关链和安静回访断言继续保留。

[尝试记录](ATTEMPTS.json) 保留首轮失败与中断。新增下一庭检查曾错误地在自动过门后按 E，修正为等待真实 interlude 并继续断言选择数和阶段；未放松原有断言。首轮目视检查发现主按钮图标颜色对比不足，修正后重跑两套完整脚本。

## 复现与证据边界

Node v24.12.0，只读复用已有 Playwright 1.48.2 / Chromium 130.0.6723.31。服务仅绑定 `127.0.0.1:4202`。没有安装依赖或更改 package；本工作树临时 node_modules 符号链接在验收后删除。

```sh
cd /tmp/4d-play-first-session-tight2-20261027-wt/web
npm test
PORT=4202 node serve.js
# 另一个终端，使用可解析的本地 Playwright 与 Chromium；选择新目录保留历史证据。
BASE_URL=http://127.0.0.1:4202 ARTIFACT_DIR=/tmp/4d-tight2-rerun-penpal node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4202 ARTIFACT_DIR=/tmp/4d-tight2-rerun-top5 node scripts/verify-top5.mjs
```

脚本仅通过真实 UI 完成追逐、收藏、跳转、遗物选择、移动、换层和启动。观察器读取快照、DOM、Canvas 绘制与事件；没有注入模型、预写收藏或刷新首进预算。自动化证明行为和布局，不能证明陌生玩家理解度或趣味性。

原始日志、各次完整截图和基线脚本保留在 ART。仓库 `web/artifacts/play-first-session-tight2-20261027` 仅镜像摘要、收据和关键截图。提交后生成 ART/DONE 与 ART/PUBLICATION.json，记录精确提交、远端 SHA 和 PR URL；不纳入它们引用的提交。

未改 Unity，未使用 Cloud Agents，未创建 critique tree，未公网部署。PR 只打开，不合并。
