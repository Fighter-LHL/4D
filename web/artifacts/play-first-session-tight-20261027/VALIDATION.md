# First-session playable tighten — PASS

日期：2026-10-27。分支：`codex/play-first-session-tight-20261027`。基线：`c3517aa4b8b1da10b74567eed22757cbc218c874`（main，#39 已合并）。

## 找到的断点与本次修改

读取 #37–#39 的验收与当前源码，并通过真实浏览器走过发现伙伴、进入庭院、落台、启动机关。首进辉光指向一个目标，但底栏只写「稳行」，目标栏可能同时列两个待启动机关。辉光消退后，新玩家仍需自行把多处信息对应起来。[基线首进截图](../play-feedback-quiet-20261027/browser-penpal/courtyard-first-beat-invitation-1280.png) 保留了这一状态（该相对链接用于仓库内镜像；ART 中请查看现有 #39 产物）。

这次只收紧已有首进邀请与动作的对应关系：

- 已看到落台邀请时，现有目标栏改为「先到架桥泵 · 稳行过去」，现有唯一主按钮改为「到架桥泵」，两者使用邀请的真实目标。
- 辉光按原时长淡出；等待 6.5 秒后仍可从按钮读出目的地，没有再次闪光、旁白或浮字。
- 抵达即撤下前一步动作名，让落地完成辉光按原节奏结束。已有首机关邀请出现时，目标栏只写「启动脚下的架桥泵 · 按 E」。等待 6.2 秒后仍可兑现。
- 真实启动后立即撤掉简短指引，沿用既有完成反馈与供能效果，随后安静。H、转向、离层、冒险、失败、换庭和重开不会保留失效指引；回访不重播。

`CourtyardMomentum.firstAction()` 只读取已见邀请及其现有待兑现状态，不搜索路线，不移动、不启动、不改计分，也不新增计时器或节拍。运行时仅改 `src/courtyard-momentum.js` 与 `src/main.js`；另改一个单测文件和共享浏览器 helper。[范围核对](scope-check.json) 记录 31 个受保护文件与基线逐字节相同，包括模型、rooms、全部 Flatland 运行模块、scene、play-feedback、friend-guide、音频、HTML/CSS、package 和 serve.js。

## 验证

- `npm test`：**315/315 PASS**，0 fail、0 skipped；新增两个回归覆盖邀请消退后的动作关联、实际完成、即时撤回与中断不重播。[测试收据](test-summary.json)，完整输出在 ART 的 `npm-test.log`。
- `verify-penpal` 与 `verify-top5`：**1280×900、390×844、320×844 六组全部 PASS**；320 同时覆盖 reduced motion，TOP5 覆盖静音。两套 receipt 的 warning/error/pageerror 均为空。
- 四个修改的 JS/MJS 文件通过 `node --check`，`git diff --check` 通过。[静态检查](static-checks.json)、[源码 SHA-256](source-manifest.json)。已确认最终两套浏览器运行期间这四个文件未改变。

| 检查 | 浏览器实际观察 |
| --- | --- |
| 邀请 → 动作 | 目标栏、唯一主按钮与辉光指向同一真实平台；按钮内容未溢出，三宽度截图中主按钮仍在首屏 |
| 等待再行动 | 辉光消退后保留简短动作名；没有自动求助、额外 announcement 或提示重放 |
| 完成 → 安静 | 落台与启动分别撤掉已完成指引；首机关完成后再等 6.2 秒，cue 与 firstAction 均为空 |
| H | TOP5 分别在首机关邀请、落台完成、首进邀请中打断；penpal 390 在机关完成中打断；原有帮助仍可用 |
| #39 安静供能 | 部分供能只更新可见 slots；远端到齐只有既有单一提示；接收台的 E 不重复到齐文字；power/ring 保留 |
| 完整链路 | penpal 三宽度均真实启动三机关，至少一次完整供能；无供能文字冲突、无第三拍、无自动闲置求助 |
| 回访与其他回归 | 回访无首进重播；单主 CTA、访客、伙伴/花种、暂停、存档、afterglow、旁白互斥、320 details 与无横向溢出均通过 |

[浏览器汇总](browser-summary.json)；[penpal 原始 receipt](browser-penpal-attempt1/receipt.json)；[TOP5 原始 receipt](browser-top5-attempt1/receipt.json)。本次随机首进覆盖分源架桥、远端折返、同位接力和双源汇流四类房间。分源架桥的首机关只开桥，不虚构 power；最终完整链路仍验证真实供能。

已目视核对三宽度邀请，以及 320px 的等待、启动完成和安静结束：

- 目标一致：[1280](browser-penpal-attempt1/courtyard-first-beat-invitation-1280.png)、[390](browser-penpal-attempt1/courtyard-first-beat-invitation-390.png)、[320](browser-penpal-attempt1/courtyard-first-beat-invitation-320.png)。
- 脚下机关：[1280](browser-penpal-attempt1/courtyard-second-beat-invitation-1280.png)、[390](browser-penpal-attempt1/courtyard-second-beat-invitation-390.png)、[320](browser-penpal-attempt1/courtyard-second-beat-invitation-320.png)。
- 320：[辉光消退后动作仍清楚](browser-penpal-attempt1/courtyard-first-beat-idle-320.png)、[真实启动](browser-penpal-attempt1/courtyard-second-beat-complete-320.png)、[单机关结束后安静](browser-penpal-attempt1/courtyard-second-beat-settled-320.png)、[完整链路安静](browser-penpal-attempt1/courtyard-first-beat-full-power-chain-quiet-320.png)。

## 复现与证据边界

Node `v24.13.0`，只读复用本机已有 Playwright `1.48.2` / Chromium `130.0.6723.31`。独立服务仅绑定 `127.0.0.1:4201`；依赖未安装或升级，package 未改。验收后关闭本次服务并移除临时 node_modules 链接。

```sh
cd /tmp/4d-play-first-session-tight-20261027-wt/web
npm test
PORT=4201 node serve.js
# 在另一个终端执行；需要可解析的本地 Playwright 与 Chromium。
BASE_URL=http://127.0.0.1:4201 ARTIFACT_DIR=/tmp/4d-first-session-rerun-penpal node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4201 ARTIFACT_DIR=/tmp/4d-first-session-rerun-top5 node scripts/verify-top5.mjs
```

两套最终浏览器命令均首次运行通过，未弱化旧断言，也未改游戏时序。观察代码只记录快照、事件、DOM 与绘制；发现收藏、庭院入口、移动、换层及启动均通过真实 UI，无预写存档或模型注入。

初期探索性的 baseline-penpal 在开始实现后中止，未封存、未计作基线 PASS；最终 PASS 仅对应两套 `attempt1` 收据。新单测初次有一条错误地把累计失败数在同局归零；修正了测试前提，保留即时失效断言及既有真实失败/重开回归。[尝试记录](ATTEMPTS.json) 明确区分这些状态。

全部原始日志和截图保存在 `/tmp/4d-play-first-session-tight-20261027`；仓库 `web/artifacts/play-first-session-tight-20261027` 镜像摘要、原始 receipt 与十张关键截图，不复制整个日志目录。提交后生成 ART/DONE 与 ART/PUBLICATION.json，记录最终 tip、远端 SHA 和 PR URL；不进入它们引用的提交，避免 SHA 自引用。

未改 Unity，未使用 Cloud Agents，未创建 critique tree，未公网部署，PR 不合并。浏览器验收证明动作关联和回归检查通过；陌生玩家的理解度与趣味性仍需真人试玩。
