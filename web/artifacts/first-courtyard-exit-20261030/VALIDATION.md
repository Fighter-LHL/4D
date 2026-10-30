# 首庭离场衔接 / first-courtyard-exit — PASS

日期：2026-10-30。基线：`dccd78eb7782b5497bc3f15bb7b261dedb81f14c`。分支：`codex/4d-first-courtyard-exit-20261030`。

## 断点与修改

首庭三处机关完成后，原界面退回“庭门已开放”和不具名的“稳行”。远端折返庭（seed=7）的维度锚台仍需换层，此时没有可用主动作。本轮在 320px 重新走完四种首庭，复现了十个离场落脚点中的这一处缺失；其余九处虽能通行，也没有具名的下一步。[本轮基线收据](baseline-receipt.json)。

复用任务提供的已 PASS 参考补丁，只在 `web/src/main.js` 将现有首次入庭静态提示延续到三机关完成后的离场路线：需要换层时强调正确的层按钮，实际换层后显示“到归响台”等具名过桥动作，逐段衔接到庭门。目的地取自原模型；提示不自动换层、移动、启动或存入。

H 提示、主动选路、冒险、暂停、行进、回流、失稳和已有失败记录继续使用原有让出条件；下一庭与回访保留普通界面。没有增加演出拍次、计时器、声音、弹窗、存档字段、计分或房间几何。

31 个运行时文件中仅 `main.js` 改变，其余 30 个与基线逐字节相同。运行时代码、新离场脚本与锚台脚本均与任务参考文件逐字节相同；README 仅将验证链接指向本轮日期。[源码及参考指纹](source-manifest.json)。

## 本轮验证

| 检查 | 结果 | 收据 |
| --- | --- | --- |
| `npm test` | 315/315 PASS，0 失败、0 跳过 | [完整输出](unit-tests.txt) |
| `verify-first-exit` | 四种首庭 × 1280/390/320，12/12 PASS | [离场收据](exit-receipt.json) |
| `verify-first-anchor` | 四种首庭 × 三宽度，12/12 PASS | [锚台摘要](anchor-summary.json) |
| `verify-penpal` | 三宽度，3/3 PASS | [伙伴与供能摘要](penpal-summary.json) |
| 冻结基线对照 | 320px 四种首庭，4/4 PASS | [基线收据](baseline-receipt.json) |
| 语法与 diff | 三个改动 JS 的 `node --check`、`git diff --check` PASS | [静态检查](static-checks.json) |

浏览器为 Chromium `145.0.7632.6`，Playwright `1.58.1`，Node `v24.12.0`。所有浏览器收据的 warning/error/pageerror 数组均为空。[浏览器总表](browser-summary.json)与[执行环境及命令](verification-context.json)记录原始收据路径和摘要对应的 SHA-256。

每个离场案例都实际拖动、换层发现跳跳，从获得的入口进入庭院并完成机关；没有预写收藏、位置、机关或存档。验证内容包括：

- 唯一可用主动作、正确桥层、具名按钮单行、主动作在首屏、页面与控件无横向溢出。1280px 使用层按钮，390px 使用 Z/X/C 与 Space，320px 使用滑条和减少动态效果。
- 换层不改变位置、目标和机关；点击或 Space 才开始过桥。闲置 6.2 秒不移动、不换层、不改变回响、不新增演出。暂停冻结，H 独占提示，冒险及主动改选保留普通控件，显式重新选回也不强行接管。
- 四种首庭均实际到达庭门。入库严格等于原已存、出发前随身及最后一次稳行收益之和；遗物选择和缓落壳升阶正常。每例继续完成第二庭三处机关，再刷新回访，均不重复首次离场提示。
- 320px 十组同状态前后比较：`roomSignature`、落脚点、W、选择、机关、`canMove`、随身与入库回响完全相同，仅动作呈现改变。[比较记录](before-after.json)。

`verify-first-anchor.mjs` 只更新三机关完成后的锚台断言，检查唯一正确换层/过桥动作及完整文案；BASELINE 模式保留旧断言，其余原检查保留。本轮所有必需验证首轮通过，没有修改参考脚本以放宽检查。

## 本轮截图

远端折返庭，同种子、同进度的维度锚台：

| 基线 | 指明换层 | 换层后过桥 |
| --- | --- | --- |
| [320px 原界面](320-before.png) | [320px 换层动作](320-shift.png) | [320px 到归响台](320-bridge.png) |

[1280px 换层](1280-shift.png) · [390px 换层](390-shift.png) · [320px 归响台到庭门](320-gate.png)。已目视检查本轮三种宽度的关键动作与窄屏按钮。

## 复现与交付边界

验证服务仅监听 `127.0.0.1:4211`。Playwright 从本机 npm 缓存离线安装到此工作树，未修改 package 或 lockfile。完整步骤、截图与日志保留在 `/tmp/4d-first-courtyard-exit-20261030/verify-{exit,anchor,penpal,baseline}/` 及 ART 根目录；此目录镜像关键收据、带原始指纹的摘要和截图。

```sh
cd /tmp/4d-first-courtyard-exit-20261030-wt/web
# 如需重建验证依赖：npm install --no-save --package-lock=false playwright@1.58.1
PORT=4211 node serve.js
# 另一个终端，为每次运行使用新的 ARTIFACT_DIR。
npm test
BASE_URL=http://127.0.0.1:4211 ARTIFACT_DIR=/tmp/first-exit-new node scripts/verify-first-exit.mjs
BASE_URL=http://127.0.0.1:4211 ARTIFACT_DIR=/tmp/first-anchor-new node scripts/verify-first-anchor.mjs
BASE_URL=http://127.0.0.1:4211 ARTIFACT_DIR=/tmp/first-penpal-new node scripts/verify-penpal.mjs
```

基线运行额外设置 `BASELINE=1 BASELINE_MAIN=/tmp/4d-first-courtyard-exit-20261030/reference/main.js.base VERIFY_WIDTHS=320`，仍使用本工作树的 4211 服务，仅替换浏览器收到的 main.js。

证据属于本地浏览器自动化，不证明陌生玩家理解度或趣味性，未做真机触屏验收。交付仅限草稿 PR；未合并、未部署。Unity 未运行；FrontEDM、NAS、Cloud Agents 与 PR #46/#47 不在本轮操作范围。
