# First-session playable tighten round 3 — PASS

日期：2026-10-27。基线：`33e833697989c06fd9f7ecac46c08025f3b214d0`（main，#41 已合并，远端已核对）。分支：`codex/play-first-session-tight3-20261027`。工作树：`/tmp/4d-play-first-session-tight3-20261027-wt`。完整证据：`/tmp/4d-play-first-session-tight3-20261027`。

## 选中的断点

真正完成 Flatland 三次追逐、收藏跳跳、进入庭院、带缓落壳出发，走过第一座桥并启动第一处机关后，说明退回「观察供能槽，切层或沿桥前往下一处机关」，主按钮只写「稳行」。在同位接力庭和分源架桥庭，下一步是原地换层，金色主按钮却仍强调返回归响台。

基线 penpal 三宽度 PASS。另用支持的 seed URL 固定四种首庭，逐次重新通过真实输入获得伙伴：10 同位接力、0 分源架桥、2 双源汇流、7 远端折返；1280／390／320 共 12 个新存档全部复现。没有预写收藏或修改模型。[基线专项收据](baseline-onward/receipt.json)；[320 同位接力基线](baseline-onward/320-cascade-handoff.png)。

## 小范围修正

- 首机关启动后的现有说明直接写下一步。原地换层：例如「原地换到Ⅰ 潮汐层 · 显现同位回声台」，只把对应的现有换层按钮静态强调，稳行按钮退为普通操作。桥上前进：说明和主按钮均点明实际目的地，例如「稳行到归响台」；窄屏快捷键提示缩为箭头，让目的地保持一行，Space 操作不变。
- 只在本次真实 discovery 首进、仍站在唯一已启动的机关、稳定且未冒险、未失误、无行进／回流／伙伴提示／有限光效，并且没有主动选路时使用现有模型路线。移动、换层、启动仍必须来自玩家输入；Space、Z/X/C、指针、W 连续滑条和其他路线照常可用。
- 离开首机关、启动第二处、主动选路、H 提示、暂停或回访时交还给现有界面。没有新增状态预算、计时器、第三拍、自动换层、自动选择、浮字或声音；换层按钮不闪烁。
- 运行时只修改 `web/src/main.js` 的呈现逻辑和 `web/style.css` 一条规则。71 个受保护文件与基线逐字节一致，包含模型、房间、所有 Flatland 模块、momentum、供能反馈、音频、HTML、全部单测及合同文档。[范围核对](scope-check.json)。

## 验证

- 单测：315/315 PASS，0 fail、0 skipped。[摘要](test-summary.json)。
- penpal 与 top5：1280×900、390×844、320×844 六组全部 PASS，warning/error/pageerror 均为空。保留真实三机关供能链、两拍时机、H 中断、长等待后的兑现、回访和下一庭验证。[penpal](browser-penpal-final/receipt.json)、[top5](browser-top5-final/receipt.json)。
- 首机关后专项：12/12 PASS，完成状态见 [浏览器汇总](browser-summary.json)。四种首庭 × 三宽度；包含 320 reduced motion。检查唯一强调动作、静态换层、按钮与说明无溢出、等待 6.2 秒不自动移动或新增提示、暂停／继续、冒险／稳行、H 让出提示、主动选路及回访。
- 专项按界面强调的按钮或 Z/X/C 真正行动：原地换层保持 XYZ 并改变 W，显现第二机关后实际按 E 启动；桥上前进实际返回归响台。320 分源架桥另选择返回路线，确认玩家的选择优先。专项没有调用寻路 helper 来替玩家挑下一步。
- 原有 280 行浏览器断言逐行保持不变；两个逐帧“最多一个主动作”观察器扩大检查范围，纳入换层按钮。[断言核对](assertion-audit.json)。
- 修改 JS/MJS 的 `node --check` 与 `git diff --check` 通过。[静态检查](static-checks.json)、[验收源码 SHA-256](source-manifest.json)。

专项新脚本的尝试完整保留：第一次同步检查暂停后的 DOM，早于既有动画帧刷新；现等待界面达到相同预期再断言。第二次在 320 宽把正常 CSS 换行误当成空格，改为空白规范化后仍严格要求「稳行 Space ↗」。此后 320 四种布局全部通过。最终目视发现 320 的目的地被快捷键提示挤成两行，移动按钮在窄屏将该提示缩为箭头，并新增名称单行断言；最终代码重新运行全部十二例以及 penpal/top5 两套三宽度。上述改动仅涉及新增验收脚本，运行时代码及 penpal/top5 原有断言未改变。[尝试记录](ATTEMPTS.json)。

目视核对了三宽度换层动作，以及桌面和 320 的过桥动作；对应前后截图随收据保留。自动化证明行为、布局与证据边界，不代表陌生玩家理解度或趣味性已经验证。

同 seed、同一首机关后的前后截图（修正后取静置 6.2 秒的安静状态）：

| 宽度 | 原地换层：基线 → 修正后 | 沿桥前进：基线 → 修正后 |
| --- | --- | --- |
| 1280 | [基线](baseline-onward/1280-cascade-handoff.png) → [换层动作](browser-onward-final/1280-cascade-quiet.png) | [基线](baseline-onward/1280-confluence-handoff.png) → [具名目的地](browser-onward-final/1280-confluence-quiet.png) |
| 390 | [基线](baseline-onward/390-cascade-handoff.png) → [换层动作](browser-onward-final/390-cascade-quiet.png) | [基线](baseline-onward/390-confluence-handoff.png) → [具名目的地](browser-onward-final/390-confluence-quiet.png) |
| 320 | [基线](baseline-onward/320-cascade-handoff.png) → [换层动作](browser-onward-final/320-cascade-quiet.png) | [基线](baseline-onward/320-confluence-handoff.png) → [具名目的地](browser-onward-final/320-confluence-quiet.png) |

## 复现与交付

Node v24.12.0；只读复用已有 Playwright 1.48.2 / Chromium 130.0.6723.31。服务仅绑定 `127.0.0.1:4203`。没有安装依赖、更改 package 或构建步骤。

```sh
cd /tmp/4d-play-first-session-tight3-20261027-wt
npm test --prefix web
cd web
PORT=4203 node serve.js
# 另一个终端，使用可解析的本地 Playwright；每次指定新的证据目录。
BASE_URL=http://127.0.0.1:4203 ARTIFACT_DIR=/tmp/4d-tight3-new-penpal node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4203 ARTIFACT_DIR=/tmp/4d-tight3-new-top5 node scripts/verify-top5.mjs
BASE_URL=http://127.0.0.1:4203 ARTIFACT_DIR=/tmp/4d-tight3-new-onward node scripts/verify-first-onward.mjs
# VERIFY_WIDTHS=320 可只复现 320 的四种布局；默认跑全部十二例。
```

仓库 `web/artifacts/play-first-session-tight3-20261027` 镜像验证记录、机器收据和关键截图。ART 保留全部截图、原始日志、基线脚本与失败尝试。最终提交、远端 SHA、PR URL 与 OPEN 状态写入 ART/PUBLICATION.json 和 ART/DONE，避免把自引用的提交号写入该提交。

未修改 Unity，未使用 Cloud Agents，未建立 critique tree，未公网部署。PR 只打开，不合并。
