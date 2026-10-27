# 2026-10-27 游玩性打磨：基线与阻塞记录

状态：**未完成；浏览器实测前置条件被工具访问权限阻塞。** 本文件不是改进完成或趣味性验收证明。

## 版本与范围

- 仓库分支：`codex/courtyard-risk-feedback`。
- 基线及当前 tip：`995a84cd98e12cdf7896f3ce514aee16641f3d52`。
- 本次仅新增此记录及 `baseline-tests.txt`，没有修改游戏源码、Unity、历史验证记录，也未部署公网。
- 此目录原已有 `CODEX_TASK_PLAY_FUN.md`、`codex.pid` 和 `codex-exec-20261027-083639.log`，保持原样。

## 已执行验证

- 在 `web/` 执行 `npm test`：**258 tests / 258 pass / 0 fail / 0 skipped**。完整可复查输出见 [baseline-tests.txt](baseline-tests.txt)。
- 执行 `npm start`，当前执行沙箱拒绝监听：`Error: listen EPERM: operation not permitted 127.0.0.1:4173`。
- 只读检查发现本机已有 Node 进程 PID `15194` 监听 `127.0.0.1:4173`，其工作目录为此仓库的 `web/`。未停止或替换该服务；尚未通过浏览器验证其页面。
- Computer Use 应用清单可读，但获取 Safari 返回 `Computer Use was not approved to use Safari`；获取 Chrome 返回 `Computer Use was not approved to use Google Chrome`。
- 内置浏览器后备入口返回 `Browser is not available: iab`。

## 真实试玩与改动状态

- 平面国新档「访客 → 越墙」：未实测。
- 庭院默认种子「换层 → 预览/稳行 → 机关 → 冒险」：未实测，尚无实际种子或视口记录。
- Top 5 游玩/趣味问题及复现步骤：未生成。用户要求先真实试玩，故不以代码推断或历史试玩冒充本轮观察。
- 3–5 项改进、对应新行为测试及改后浏览器验证：未开始，等待上述前置条件。
- commit / push：未执行；没有已完成的游戏改动可提交。

## 恢复条件与后续验收

需为当前会话启用 Safari 或 Chrome 的 Computer Use 访问。随后使用隔离的新档环境，保留用户已有存档，完成指定试玩并先记录 Top 5；再选择 3–5 项改进、补充测试、复玩、提交并推送。届时本文件补齐实际路径、种子、视口、改动与未验证边界。

当前 tip SHA：`995a84cd98e12cdf7896f3ce514aee16641f3d52`（未产生新提交）。

## 仍建议真人试玩

- 首 30 秒是否自然知道可以调切片、靠近目标并试一下。
- 首次自行发现伙伴、收集花种与点亮花园是否有满足感。
- 庭院机关、换层和冒险的反馈是否帮助理解，且没有替玩家解题。
- 失败原因是否易懂，同题重试是否顺手并让人愿意继续。
- 音效、短飘字和动态反馈是否舒适、不会遮挡操作。

以上均未获本轮真人验证；测试全绿不证明好玩。
