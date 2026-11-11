# 剧场布局与庭院触感 — 验证记录（2026-11-11）

## 运行内容

- 单元测试：`cd web && npm test` → **tests 386 / pass 386 / fail 0**（duration ≈ 4.6s）。
- 剧场浏览器验证：`cd web && ARTIFACT_DIR=artifacts/theater-feel-20261111/verify node scripts/verify-theater-feel.mjs` → receipt `status: passed`，37 项检查、0 page/console 错误，Playwright Chromium 145.0.7632.6，BASE_URL `http://127.0.0.1:4173`，种子 `?seed=123&ferry=first`。
  - 返修轮（手机悬浮条 / 单行顶栏 / 弹层与抽屉避让 / 摆渡读数）后重跑同一脚本：每个截图步骤附带悬浮断言（任意两芯片不相交、覆盖画布 ≤15%（桌面）/≤25%（手机）、不遮主角落点）、手机顶栏单行（≤56px 且全部控件在视口内）、桌面抽屉不遮层钮（`elementFromPoint` 命中）、摆渡读数无哨兵 `99`。总数与比例与初验相同。
  - 4 视口 × 9 检查（layout / drawer / dial / ferry / cast-shadow / cast-weave / cast-prism / feel / ambient），390×844 另含触摸滚动守卫（cast 落点 `defaultPrevented === true`、空白处 `false`），320×640 以 `reducedMotion: 'reduce'` 运行。
  - 1440×900 额外截图：astral 与 paper 主题各两张（开/关抽屉）。
  - 抽屉检查含 1280×720 的花匣预警关闭抽屉路径；画布矩形在抽屉开合前后 ±0.5px 不变，模型时间在抽屉打开时继续前进。
  - 施法检查先做空放（所有状态不变）再做真实拖拽吸附；种子 123 的第一庭 prism 只有 1 个合法目标（`targets: 1`，已按单目标断言并记录在 receipt）。
  - 顿帧：真实 `harmonic_burst` 帧循环路径下记录到 accepted hit-stop 且 `feel.frozen` 至少一帧为真，总冻结 ≤ 35ms；减少动态效果下全部 trigger `accepted === false`、`feel.value('camera') === 0`。
- 旧浏览器检查回归（经典布局，各脚本上下文注入 `localStorage['wslice-theater']='classic'`），命令形如 `ARTIFACT_DIR=artifacts/theater-feel-20261111/regression/<script> node scripts/<script>.mjs`。

## 世界面积占比（`scene.scale² × 1000 × 650 / 视口面积`，来自 verify receipt）

| 视口 | 目标 | 剧场 | 经典 |
| --- | --- | --- | --- |
| 1440×900 | ≥ 0.55 | **0.6606** | 0.2094 |
| 1280×720 | ≥ 0.50 | **0.5348** | 0.1235 |
| 390×844 | ≥ 0.27 | **0.3004** | 0.2882 |
| 320×640 | ≥ 0.27 | **0.3250** | 0.2856 |

桌面两档无纵向文档滚动（`scrollHeight ≤ innerHeight + 1`），全部视口无横向溢出。

## 旧检查回归

| 脚本 | 结果 |
| --- | --- |
| verify-first-anchor | 通过（3 检查） |
| verify-first-exit | 通过（12 检查） |
| verify-first-feedback | 通过（12 检查） |
| verify-first-onward | 通过（12 检查） |
| verify-first-return | 通过（3 检查） |
| verify-onboarding-load | 通过（22/22） |
| verify-penpal | 通过（3 检查） |
| verify-top5 | 通过（3 视口全项） |

8 个可运行检查全部在工作树上通过（courtyard-first-beat.mjs 为共享运行器，由 verify-first-* 调用），因此未需要 `git worktree` 干净 HEAD 对照。

## 工件

- 截图与 receipt：`web/artifacts/theater-feel-20261111/verify/`（61 个文件，含 `<视口>-layout/-drawer-*`、`-dial-mid`、`-ferry-*`、`-cast-*-mid`、`-classic`、1440×900 `-astral/-astral-drawer/-paper/-paper-drawer`、`-final`）。
- 回归工件：`web/artifacts/theater-feel-20261111/regression/<script>/`。
- 2a 阶段冒烟图：`web/artifacts/theater-feel-20261111/smoke-2a/`。

## 限度

以上均为自动化断言与人工截图检查。它们证明几何目标、抽屉行为、拖放施法、顿帧参数、声床生命周期与旧流程在经典布局下不回归，但**不证明主观手感、动效观感或声音质量**；环境声床只验证了其启停与事件绑定，未验证听觉效果。种子 123 第一庭 prism 合法目标数为 1，未在本局验证双目标择取路径。
