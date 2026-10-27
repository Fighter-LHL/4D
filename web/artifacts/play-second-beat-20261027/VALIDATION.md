# 庭院第二拍：启动脚下的第一个机关

日期：2026-10-27。分支：`codex/play-fun-second-beat-20261027`。基线：`1e3f8fbff7d56d34622916c0ac5502188835fdbb`（#37）。工作树：`/tmp/4d-play-second-beat-20261027/web`。

首次携真实收藏进庭、首拍 invitation 被看到、玩家安全到达且 follow 完整淡出后，留出 0.45 秒安静间隔，再让脚下可启动的首个机关亮一次。邀请持续 2.1 秒，底栏沿用唯一 E 主 CTA；真实启动后复用 0.85 秒 follow 辉光及模型原有启动／供能反馈，随后安静。过期邀请允许稍后真实兑现，但不重复提示，不追加第三拍，不恢复首进闲置求助，H 始终保留。

第二拍绑定首拍实际抵达的机关，不寻找或推进下一条路线。接力／汇流／折返庭里这是未供能下游的首个供能源；分源架桥庭里这是打开通路的首个机关，按现有模型以成功启动为兑现，不虚构发送能量。双源汇流的一路到达仍是部分供能，不声称下游完成。

首拍未完成、H 中断、失败、转向、冒险、离开切片、离开平台、换庭或重开都不会补发第二拍。首拍 follow 尚在播放或安静间隔内已自行启动机关，也不追发多余邀请。入口继续复用现有真实收藏和 `wslice-courtyard-welcome` 预算；回访不重播。

## 验证结果

- `npm test`：**309/309 PASS**，0 fail、0 skipped。[测试收据](test-summary.json)。新增／更新用例覆盖正常与过期后启动、全部四种房间模板、静置无续拍、暂停冻结、模型不被提示修改，以及 H、早启动、失败、离层、冒险、离开平台、重开和换庭。
- 必需的 `verify-penpal`、`verify-top5`：**1280×900、390×844、320×844 六组全部 PASS**。浏览器 Chromium `130.0.6723.31`；两个收据的 console warning/error 和 pageerror 均为空。
- 六个改动的 JS/MJS 文件 `node --check`、`git diff --check` 通过。[验收源码 SHA-256](source-manifest.json)。
- [范围核对](scope-check.json)：67 个受保护文件与基线逐字节相同，包括模型、房间、全部 Flatland 运行模块、main、friendGuide、play-feedback、音频、HTML/CSS、package 和合同等。运行时代码只改 `courtyard-momentum.js` 及 `scene.js` 中复用 follow 绘制的一行；计分、rooms 几何、#36 Flatland 提示参数、Unity 和 visitor-next-beat 未改。

| 浏览器路径 | 1280 | 390 | 320 |
| --- | --- | --- | --- |
| penpal 真实发现 → 庭院 | 第二拍启动并安静结束 | 第二拍启动；反馈中 H 即时让位 | 第二拍启动并安静结束；reduced motion |
| TOP5 真实发现 → 庭院 | 第二拍邀请中 H；启动后不补反馈 | 首拍 follow 中 H；不发第二拍 | 首拍邀请中 H；不发第二拍 |
| 回访 | 无两拍重播 | 无两拍重播 | 无两拍重播 |

[第二拍汇总](second-beat-summary.json) 记录逐帧观察：首拍 follow 完全消失后，第二拍首次出现的间隔为 **0.4500–0.4666 秒**。penpal 三个宽度均故意等待第二拍邀请后 **6.2 秒**才按 E：期间没有自动闲置提示，随后仅一次真实 `activate(via=touch)` 和一次 mechanism-follow。正常接力／折返供能事件按模型到达；分源架桥启动不伪造 power。启动后继续等待 **6.2 秒**无第三拍。逐帧检查主 CTA 唯一且可用、glint 与 friendGuide 互斥；Canvas stroke observer 确认两拍实际绘制。暂停冻结邀请和兑现。

两套脚本均从隔离新档用真实指针、键盘、按钮和原生 range input/change 完成发现、收集、庭院入口和启动；没有预写收藏、清除入口预算或注入模型。观察代码仅在验收脚本中追加，未写进运行时。原有普通入口 landing/onward、状态化 CTA、供能反馈、访客下一拍、Flatland 旁白互斥与靠近提示、SFX、afterglow、存档、静音、reduced motion、HUD 无横向溢出等回归仍通过。

已目视检查三个宽度的第二拍邀请和兑现截图：平台辉光与名称分开，E 对应脚下机关，无新增 HUD 长文。截图与原始浏览器收据：

- [1280 邀请](browser-penpal/courtyard-second-beat-invitation-1280.png)／[兑现](browser-penpal/courtyard-second-beat-complete-1280.png)
- [390 邀请](browser-penpal/courtyard-second-beat-invitation-390.png)／[兑现](browser-penpal/courtyard-second-beat-complete-390.png)
- [320 邀请](browser-penpal/courtyard-second-beat-invitation-320.png)／[兑现](browser-penpal/courtyard-second-beat-complete-320.png)
- [第二拍 H 让位](browser-top5/courtyard-second-beat-help-1280.png)
- [penpal 收据](browser-penpal/receipt.json)、[TOP5 收据](browser-top5/receipt.json)

## 环境与复现

两套浏览器脚本第一次启动使用另一个已有 Playwright 1.50.0 安装，其浏览器 executable 缺失，未开始任何页面检查。改用主仓已安装的 Playwright 1.48.2 只读依赖链接后，两套完整检查首次运行全部通过；未改 package 或下载依赖。启动失败收据保存在 `browser-penpal-launch-failed/receipt.json`，完整启动输出和测试输出以本地 `.txt` 保存，不纳入提交。验收服务为本工作树 `http://127.0.0.1:4198`；结束后关闭服务并移除依赖链接。

在可解析 Playwright 1.48.2 及其 Chromium 的环境中，以新输出目录复现，保留本轮证据：

```sh
cd /tmp/4d-play-second-beat-20261027/web
npm test
PORT=4198 node serve.js
BASE_URL=http://127.0.0.1:4198 ARTIFACT_DIR=artifacts/play-second-beat-20261027/browser-penpal-rerun node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4198 ARTIFACT_DIR=artifacts/play-second-beat-20261027/browser-top5-rerun node scripts/verify-top5.mjs
```

提交前的源码清单与验收证据进入提交。提交／推送／PR 后生成本机 `DONE`、`PUBLICATION.json`，记录精确 tip、远端 SHA 与 PR URL，并把关键收据镜像到主仓指定 artifacts 目录；这两个后置收据不纳入所引用的提交，避免 SHA 自引用。CODEX_TASK、pid、log、原始文本日志不提交。

本轮不合并 main，不公网部署，不使用 Cloud Agents。仍建议真人试玩；自动验收未验证陌生玩家的理解度或完成感。
