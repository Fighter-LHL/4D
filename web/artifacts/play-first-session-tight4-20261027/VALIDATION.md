# First-session playable tighten round 4 — PASS

日期：2026-10-27。基线：`cc4179484f9559ca81afe15a326224002494934d`（main，#42 已合并，远端已核对）。分支：`codex/play-first-session-tight4-20261027`。工作树：`/tmp/4d-play-first-session-tight4-20261027-wt`。完整证据：`/tmp/4d-play-first-session-tight4-20261027`。

## 下一处断点

真实完成 Flatland 三次追逐并收藏跳跳，进入庭院，带缓落壳出发，完成 #42 的首机关交接后，返回归响台出现新的动作断点。双源汇流庭已有 1 处机关启动，分源架桥庭已有 2 处机关启动：下一站被自动选中，但桥在另一 W 层，稳行不可用；唯一强调的却是「存入随身回响」。说明只列出待启动的远方机关，没有指向当前需要的换层动作。同位接力庭、远端折返庭此处可直接过桥，但按钮仅写「稳行」。

基线通过支持的 seed URL 固定四种首庭：10 同位接力、0 分源架桥、2 双源汇流、7 远端折返；每例使用新浏览器上下文并通过实际移动、滑条与按钮取得伙伴，不预写存档或修改模型。四种首庭 × 1280／390／320 的返台专项 12/12 复现；#42 的原始 onward 专项 12/12 通过。返台基线由冻结的 `baseline-main.js` 提供（与 cc41794 对应文件一致），其他运行时文件与基线一致。

## 修正范围

- 复用 #42 已有呈现逻辑。在首次 discovery 入庭、归响台上且已启动 1–2 处机关时，说明点明下一座桥所在层，例如「换到Ⅱ 回声层 · 显现通往辉光源的桥」，只静态强调对应换层按钮。
- 玩家换层后，说明变成「到辉光源 · 沿桥稳行」，主按钮写「到辉光源」。下一座桥已经可走时，直接显示具名的过桥动作。存入回响仍可操作，也不改变路线。
- 仅读取既有路线与选择，不新增自动选路、换层、行走或启动。沿用 firstEntry 边界；行进、回流、失稳／失误、冒险、暂停、H 提示、主动选路时不接管控件，离开归响台、三机关完成、回访和下一庭交回原有界面。这是首次入庭期间的归响台提示，不是新增一次性演出预算。
- 运行时只改 `web/src/main.js`，没有新增状态、计时器、第三拍、弹窗、浮字或声音。模型、房间、Flatland、momentum、CSS、HTML、供能反馈、音频和单测保持基线内容。

## 验证状态

- 单测：315/315 PASS，0 fail、0 skipped。[测试摘要](test-summary.json)。
- penpal 与 top5：1280×900、390×844、320×844 共六组全部 PASS，warning/error/pageerror 均为空。包含原有真实三机关供能链、两拍时机、H 中断、长等待兑现、保存与回访、下一庭验证。[penpal](browser-penpal-final/receipt.json)、[top5](browser-top5-final/receipt.json)。
- onward：四种首庭 × 三宽度 12/12 PASS；#42 的首机关行动、换层后第二机关启动、H／暂停／风险／主动选路及回访继续通过。[onward 收据](browser-onward-final/receipt.json)。
- 新增返台专项：四种首庭 × 三宽度 12/12 PASS。每例重新真实发现伙伴，脚本从 Flatland 入场到归响台用时 13.52–17.01 秒；这只是熟悉路径的自动化输入时长，不是陌生玩家完成时间。[返台收据](browser-return-final/receipt.json)。
- 返台检查唯一可用主动作、静态换层强调、按钮名称单行、页面／说明无横向溢出、6.2 秒闲置不新增演出或改变位置／W／选择／机关；暂停继续、主动存入回响、H 提示与风险模式让出通道。390 使用 Z/X/C，其余使用指针操作。320 额外检查主动改选另一路和重新选回都保留普通控件。
- 按提示真实换层：XYZ 位置仍为归响台，仅 W 改变、桥显现；随后真实点击过桥，在辉光源按 E 启动第二源。到维度锚台则退出归响台提示。所有逐帧主动作与供能通道冲突记录为空；320 使用 reduced motion。
- 修改文件的 `node --check` 与 `git diff --check` 通过。[静态检查](static-checks.json)。63 个受保护文件逐字节一致；[范围核对](scope-check.json)、[源码 SHA-256](source-manifest.json)、[断言核对](assertion-audit.json)、[完整矩阵摘要](browser-summary.json)。

目视检查了 1280／390／320 的换层提示，以及 320 的长目的地按钮。前后截图取同 seed、同进度的归响台状态：

| 宽度 | 双源汇流：基线 → 指明桥所在层 → 玩家换层后的过桥动作 |
| --- | --- |
| 1280 | [基线](baseline-return-all/1280-confluence-back-at-hub.png) → [换层](browser-return-final/1280-confluence-quiet.png) → [过桥](browser-return-final/1280-confluence-bridge-ready.png) |
| 390 | [基线](baseline-return-all/390-confluence-back-at-hub.png) → [换层](browser-return-final/390-confluence-quiet.png) → [过桥](browser-return-final/390-confluence-bridge-ready.png) |
| 320 | [基线](baseline-return-all/320-confluence-back-at-hub.png) → [换层](browser-return-final/320-confluence-quiet.png) → [过桥](browser-return-final/320-confluence-bridge-ready.png) |

[320 分源架桥基线](baseline-return-all/320-split-back-at-hub.png) → [指明下一座桥](browser-return-final/320-split-quiet.png)；[320 长目的地单行](browser-return-final/320-cascade-quiet.png)。

## 断言变更与尝试记录

penpal、top5 和共享 courtyard-first-beat 的原始脚本保持逐字节一致。onward 仅修改离开首机关后的两条通用退出断言：离开后不在归响台，仍要求取消换层强调和交接说明；在归响台，则严格检查模型已选目的地、唯一可用的正确动作以及完整换层／过桥文案。风险模式的原断言保持不变。原断言文本全部保留，改变适用范围明示于 `assertion-audit.json`。

新增返台专项第一次在 320 同位接力庭发现「稳行到维度锚台」分成两行，严格单行断言失败。运行时将归响台的按钮缩为「到维度锚台」，仍保留「沿桥稳行」说明；单行断言保留，并把按钮名称检查加强为完整文本匹配。`browser-return-attempt1` 保留这次失败、无浏览器错误的收据和截图。修正后重跑最终矩阵。

## 复现

Node v24.12.0；只读复用已有 Playwright 1.48.2 / Chromium 130.0.6723.31。服务只监听 `127.0.0.1:4204`，未安装依赖或引入构建步骤。

```sh
cd /tmp/4d-play-first-session-tight4-20261027-wt
npm test --prefix web
cd web
PORT=4204 node serve.js
# 另一个终端，Playwright 已可在本地解析；每次使用新的证据目录。
BASE_URL=http://127.0.0.1:4204 ARTIFACT_DIR=/tmp/tight4-new-penpal node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4204 ARTIFACT_DIR=/tmp/tight4-new-top5 node scripts/verify-top5.mjs
BASE_URL=http://127.0.0.1:4204 ARTIFACT_DIR=/tmp/tight4-new-onward node scripts/verify-first-onward.mjs
BASE_URL=http://127.0.0.1:4204 ARTIFACT_DIR=/tmp/tight4-new-return node scripts/verify-first-return.mjs
# 两个首程专项默认检查四种首庭 × 三宽度；VERIFY_WIDTHS=320 可只复现 320。
```

浏览器自动化验证输入、运行行为、布局与证据边界；未进行陌生玩家对理解度、趣味性的验证。没有修改 Unity、使用 Cloud Agents、建立 critique tree 或公网部署。仅打开 PR，不合并。

仓库 `web/artifacts/play-first-session-tight4-20261027` 镜像验证记录、机器收据与关键截图；ART 保留全部截图、基线源码、原始日志和失败尝试。最终提交、远端 SHA、PR URL 与 OPEN 状态记录于 ART/PUBLICATION.json 和 ART/DONE。
