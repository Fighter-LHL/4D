# 平面国合入 main 前验证 · 2026-10-24

- 基线：`origin/main` 的 `359ea29`。
- 导入来源：`d7100ba47bd324c214fb0933e2bb2011270353cc`。其 `web/` 下的 278 个受跟踪文件（六关、依赖的回响庭院、测试及历史记录）逐字节一致。
- 保留当前主线 `web/geometry-lab/`，与基线相比无变动；没有导入旧开发分支的 Unity 改动。
- 根 README 添加独立试玩入口；新增 `.github/workflows/web-tests.yml`，在 PR 与 main 的网页变更上运行语法和全部浏览器游戏规则测试。

验证命令：`node --test web/tests/*.test.js web/geometry-lab/tests/*.test.mjs`。结果 **266/266 通过，0 失败、0 跳过**（平面国/庭院 189，几何实验室 77）。完整输出见 [tests.txt](tests.txt)。34 个入口/渲染/模型 JavaScript 模块通过 `node --check`。

本次整合未改动导入的游戏源码。此前相同源码的代理浏览器通关和失败恢复证据保留在 [升维](../flatland-ascend-20261024/validation.md)、[镜之锁](../flatland-mirror-20261024/validation.md)、[保险箱](../flatland-vault-20261024/validation.md)、[猜猜是谁及前两关](../flatland-guess-20261024/validation.md)。没有将历史代理实玩当作新一轮真人试玩或学习效果验证。Unity 本次未运行，且 Unity 文件没有变化。

源码与 Markdown 差异检查通过；浏览器原始 AX 文本里的末尾空格按原记录保留。
