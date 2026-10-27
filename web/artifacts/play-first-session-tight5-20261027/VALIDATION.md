# First-session playable tighten round 5 — PASS

日期：2026-10-27。基线：`86fd2b4431ecfec3368714e97db4887939559506`（#43 已合并，远端 main 已核对）。分支：`codex/play-first-session-tight5-20261027`。工作树：`/tmp/4d-play-first-session-tight5-20261027-wt`。完整证据：`/tmp/4d-play-first-session-tight5-20261027`（ART）。

## 选中的一个断点

完成 Flatland 三次追逐、实际获得跳跳、进入庭院并带缓落壳出发，沿 #42/#43 的动作完成首机关交接和归响台具名过桥。到达 **维度锚台** 后，下一座桥在另一 W 层：稳行按钮禁用，原说明只列出「已供能待启动」的远方机关，没有指明换层动作，也没有主动作。

冻结 #43 的 `main.js`，四种首庭 × 三宽度真实走完首庭。每例新浏览器上下文，以支持的 seed URL 固定布局；没有预写伙伴、存档、机关或位置。基线 12/12 走查完成，无浏览器 warning/error/pageerror。

| 首庭 seed | 到锚台时 | 基线情况 |
| --- | --- | --- |
| 10 同位接力 | 2/3 机关，前往折光花 | 桥未显现、稳行禁用、主动作消失 |
| 0 分源架桥 | 2/3 机关，前往承光花 | 同上 |
| 7 远端折返 | 1/3 机关，前往远端回声台 | 同上 |
| 2 双源汇流 | 归响台先到辉光源；第一次到锚台已 3/3 | 对照：可启动源，完成后的锚台保留庭门路线 |

前三种 × 1280／390／320 共 9 例复现，第四种共 3 例对照。[基线断点收据](baseline-breakpoints.json)。自动化从 Flatland 入场到受影响锚台为 14.22–17.08 秒；这是熟悉路径的脚本输入时间，不是陌生玩家完成时间。完整走查、每一步截图、原始脚本和冻结源码均在 ART/baseline-walk 与 ART/walk-first-session.mjs。

## 最小运行时修改

只改 `web/src/main.js` 已有 onward 呈现的三个条件/标签表达式（另改两行注释）：把已有安全归响台范围延伸到维度锚台。仍只在真实首次 discovery 入庭、已启动 1–2 处机关时生效。

- 未换层：「换到Ⅱ 回声层 · 显现通往折光花的桥」，只静态强调已有换层按钮。
- 玩家实际换层后：「到折光花 · 沿桥稳行」，具名主按钮「到折光花」。XYZ、目的地与机关不变，仅 W 改变并显现真实桥梁。
- 抵达目标机关即交回已有「启动…」按钮；点击或按 E 才启动。三机关完成后的锚台、下一庭和回访沿用原界面。
- 原有暂停、行进、回流、失稳/失败、冒险、H 和主动选路边界全部保留。未增加路由选择、移动、换层、激活、状态、计时器、第三拍、浮字、声音或教程树。

模型、所有房间、Flatland、momentum、供能反馈、CSS、HTML、所有单测及原 penpal/top5/onward/共享观察器保持逐字节一致，共 70 个受保护文件。[范围核对](scope-check.json)、[运行时 SHA-256](source-manifest.json)。

## 验证

- 单测：315/315 PASS，0 fail、0 skipped。[摘要](test-summary.json)。修改文件语法与 git diff --check PASS。[静态检查](static-checks.json)。
- penpal、top5：1280×900、390×844、320×844 各 3/3 PASS，包含真实供能链、既有两拍、H 中断、等待、保存、回访和下一庭。[penpal](browser-penpal-final/receipt.json)、[top5](browser-top5-final/receipt.json)。
- onward、return：四种首庭 × 三宽度，各 12/12 PASS；#42/#43 的既有换层、归响台存入、具名过桥、H/暂停/风险/主动选路边界继续通过。[onward](browser-onward-final/receipt.json)、[return](browser-return-final/receipt.json)。
- 新 anchor 专项：12/12 PASS，9 个受影响锚台 + 3 个双源汇流对照；每例真实发现伙伴、走过 #43 的具名桥、最终完成三机关并到达庭门，核对 interlude、回响入库、下一庭与回访。[anchor](browser-anchor-final/receipt.json)。受影响路径到锚台脚本时间为 11.74–12.68 秒。
- 锚台核对：唯一可用正确主动作、目标层静态强调、说明和按钮无溢出、目标名称单行、主动作在首屏；暂停冻结、6.2 秒闲置不改变位置/W/选择/机关、不增加演出；H、冒险、主动改选和重新选回保持普通控件。1280 点换层按钮、390 使用 Z/X/C、320 使用原 W 滑条（320 reduced motion）。随后真实过桥并按 E 启动，无模型/存档注入。
- 三机关完成后的锚台保持原有说明和控件；下一庭及重载不再使用首入提示。逐帧主动作冲突、供能通道冲突及所有 browser warning/error/pageerror 均为空。[完整矩阵](browser-summary.json)。
- 9 组前后比对在相同 roomSignature、node、W、selected、activated、canMove 下，基线主动作为空，修正后是唯一正确换层按钮；改变 W 后才显示具名过桥动作。[同状态前后比较](before-after.json)。
- 目视核对了 1280/390/320 的换层说明与按钮、320 长目的地的过桥按钮，以及三机关完成后的原有锚台界面。

## 前后证据

同 seed、同进度，修正后截图取静置 6.2 秒后的安静状态：

| 宽度 | 同位接力：基线 → 指明桥所在层 → 玩家换层后 |
| --- | --- |
| 1280 | [基线](baseline-walk/1280-cascade-4-relay-2.png) → [换层](browser-anchor-final/1280-cascade-quiet.png) → [过桥](browser-anchor-final/1280-cascade-bridge-ready.png) |
| 390 | [基线](baseline-walk/390-cascade-4-relay-2.png) → [换层](browser-anchor-final/390-cascade-quiet.png) → [过桥](browser-anchor-final/390-cascade-bridge-ready.png) |
| 320 | [基线](baseline-walk/320-cascade-4-relay-2.png) → [换层](browser-anchor-final/320-cascade-quiet.png) → [过桥](browser-anchor-final/320-cascade-bridge-ready.png) |

[320 分源架桥基线](baseline-walk/320-split-5-relay-2.png) → [指明承光花桥层](browser-anchor-final/320-split-quiet.png)。[320 远端折返基线](baseline-walk/320-return-2-relay-1.png) → [指明远端回声台桥层](browser-anchor-final/320-return-quiet.png) → [长目的地按钮](browser-anchor-final/320-return-bridge-ready.png)。[320 双源汇流对照](browser-anchor-final/320-confluence-after-hub-crossing.png)、[三机关完成后的原有锚台界面](browser-anchor-final/320-confluence-three-complete-anchor.png)。

## 断言与尝试记录

原 penpal、top5、onward 及 courtyard-first-beat 脚本未变。return 中原先“离开 hub 后一律无提示”的两条断言只在锚台分支替换为更具体的契约：目的地与模型现有选择一致、唯一正确且可用的换层/过桥按钮、完整具名文案。其他落脚点保留原断言，全部原 hub 检查保留。[断言核对](assertion-audit.json)。

新增 anchor 专项前三次未通过均是新脚本的假设错误，未改运行时来迎合测试：① H 隐藏说明，应检查不可见与 textContent，不能读取可见 innerText；② 庭门 phase 实为 interlude，不是 choosing，已检查原结算与下一庭选择；③ 下一庭 firstEntry 在既有动画帧更新中重置，现等待实际状态再断言。三个失败目录和日志全部保留；第四次 320 四布局 PASS 后才跑最终全矩阵。初次环境准备把已在 web 的 cwd 又拼接了 web，文件读取失败；改回工作树根后启动成功，没有覆盖既有文件。

## 复现与交付

Node v24.12.0；只读复用已有 Playwright 1.48.2 / Chromium 130.0.6723.31。服务只监听 `127.0.0.1:4205`；没有安装依赖或改 package。Playwright 由本地已有模块路径解析。

```sh
cd /tmp/4d-play-first-session-tight5-20261027-wt
npm test --prefix web
cd web
PORT=4205 node serve.js
# 另一个终端；每套指定新的 ARTIFACT_DIR。
BASE_URL=http://127.0.0.1:4205 ARTIFACT_DIR=/tmp/tight5-new-penpal node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4205 ARTIFACT_DIR=/tmp/tight5-new-top5 node scripts/verify-top5.mjs
BASE_URL=http://127.0.0.1:4205 ARTIFACT_DIR=/tmp/tight5-new-onward node scripts/verify-first-onward.mjs
BASE_URL=http://127.0.0.1:4205 ARTIFACT_DIR=/tmp/tight5-new-return node scripts/verify-first-return.mjs
BASE_URL=http://127.0.0.1:4205 ARTIFACT_DIR=/tmp/tight5-new-anchor node scripts/verify-first-anchor.mjs
# 三个专项默认四种首庭 × 三宽度；VERIFY_WIDTHS=320 可只复现窄屏。
```

浏览器自动化证明真实输入、布局与行为回归，不证明陌生玩家理解或觉得有趣；**仍建议真人试玩**。其他第二机关后的泛化说明、三机关后的庭门引导不是本轮修复结论。未改 Unity、未用 Cloud Agents、未建立 critique tree、未公网部署、不合并 PR。

仓库 `web/artifacts/play-first-session-tight5-20261027` 镜像验证记录、机器收据和关键截图。ART 保留全部原始证据和失败尝试。最终 tip SHA、远端 SHA、PR URL 与 OPEN 状态写入 ART/PUBLICATION.json 和 ART/DONE。
