# W-Slice 验证与证据

Unity 版本为 `6000.0.77f1`。验证必须对应当前提交和本次运行；旧日志、进程退出 `0`、测试源码存在都不能单独证明测试通过。

## 本地验证

从仓库根目录执行：

```bash
./scripts/validate-local.sh          # L0 编译 + L1 六关和 Catalog 校验
./scripts/validate-local.sh --tests  # 再要求 L2 EditMode + L3 PlayMode 真实测试结果
python3 -m unittest discover -s scripts/tests -v  # 仅验证证据检查器与脚本编排
```

环境变量 `UNITY_PATH` 覆盖 Unity 可执行文件；`PROJECT_PATH` 覆盖 Unity 项目路径；`PYTHON_PATH` 覆盖 Python 3。缺少 Unity 时退出非零并报告 `NOT RUN`。已有本机 Unity license 由 Unity 使用，脚本不请求、搜索或打印任何凭据；license 不可用导致的失败不能记作 Pass。

每次创建独立 `WSliceProto/TestResults/run-<UTC 时间>-<随机后缀>/`，保留 invocation、日志、JSON receipt 和 NUnit XML。目录不会覆盖上次记录；`invocation.json` 记录提交、工作区是否有修改、是否要求测试。若工作区有改动，应另保存可复现的 diff 或提交后重跑。

| 层级 | 成功证据 | 不代表什么 |
|---|---|---|
| L0/L1 | 统一 `WSliceValidationRunner.ValidateAll` 成功退出；fresh JSON 收齐 Garden、Platform、Gate、Chambers、Hazard、Courtyard、Catalog，错误数为 0 | 不代表每个玩家交互都正确 |
| L2/L3 | Unity 成功退出；fresh、完整且计数一致的 NUnit XML；实际通过用例 > 0，失败和未完成为 0 | 不代表人的理解、可玩性或体验成立 |
| L4 手动冒烟 | 在 Editor 或构建中按步骤操作的实际记录 | 自动化回归不能代替手动 UI 检查 |
| 五人试玩 | [无指导试玩模板](../docs/playtests/courtyard-five-player-template.md)中的真实观察 | 禁止填入 AI 模拟的人类结果 |
| L5 构建 | 当前代码构建日志、产物 manifest、实际启动记录 | 构建成功不等于启动和通关成功 |

默认不执行 L2/L3，明确标记 `SKIPPED`；此时只能说 L0/L1 已验证。L4、五人试玩、L5 不由本脚本执行。

## 自动化通过标准

- 测试命令使用 `-runTests -batchmode -testPlatform ... -testResults ...`，**不加 `-quit`**，让 Test Runner 在完成后关闭；场景校验的同步 `-executeMethod` 可以使用 `-quit`。
- `scripts/verify_unity_results.py` 读取 NUnit 3 XML 的真实 `test-case`，核对 summary 的 total/passed/failed/skipped/inconclusive 与发现数。丢失、损坏、全 skipped、零用例、失败、inconclusive、未完成或计数不一致均退出非零。
- XML 文件时间和内嵌开始/结束时间必须属于本次 invocation。旧 XML 即使复制到新目录也不被接受。
- 部分 skipped 会单独报数；不能写成全部用例已执行。新增关键行为的测试不得通过 skipped 规避。
- L1 统一 runner 捕获旧 Validate 方法的 Error/Exception/Assert；不能仅凭这些方法退出 `0` 报成功。它只校验已保存的资产，不运行 Generate、不保存场景。
- 失败证据保留在本次目录，修复后重跑生成另一个目录。不要回填上一次日志使其看似通过。

如必须通过 Editor Test Runner 手动 Run All，应导出当次 XML，并记录提交、Unity 版本、开始时间、测试数量、跳过数量和 XML 路径；无 XML 只记 `未确认`，不能把控制台 “OK” 当作替代。

## CI

`.github/workflows/wslice-validate.yml` 中：

- 无需 Unity 的 job 始终运行 Python 检查器测试和 shell 语法检查。
- L0/L1 使用 `game-ci/unity-builder@v4` 的真实 `buildMethod` 调用统一 runner；此步骤只校验，不产出 Linux 玩家版本。
- L2/L3 使用独立的 `game-ci/unity-test-runner@v4` EditMode/PlayMode matrix，随后由同一个 Python 检查器核验证据。上传按 `run_id/run_attempt/mode` 隔离的 artifact。
- 凭据只从已配置的 Unity repository secrets 传给 GameCI。合法的 step `if` 引用 job `env`，不在 job `if` 中直接引用 `secrets`。缺少配置时 Unity steps 明确 `SKIPPED`，job summary 写清没有执行 Unity；此类工作流绿色不代表 Unity 通过。
- CI 配置改正确并不证明 CI 已跑通。只有相应 Actions run 和可下载 receipt/XML 才能作证；不为此查询凭据值。

依据：[Unity Test Framework 命令行与 NUnit 输出](https://docs.unity3d.com/Packages/com.unity.test-framework@1.4/manual/reference-command-line.html)、[GameCI Builder 自定义方法](https://game.ci/docs/github/builder/#buildmethod)、[GameCI Test Runner](https://game.ci/docs/github/test-runner/)、[GitHub secrets 条件规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)。项目实际测试框架版本以 `Packages/manifest.json` 为准。

## 场景、试玩与发布

新关入口为 `WSlice.Editor.CourtyardSliceGenerator.Generate/Validate`。Generate 是开发时的资产生成操作，单独执行并审查生成的 diff；保存资产后运行上面的完整验证。旧五关保留作回归。

L4 按 [PlayModeSmokeTest.md](Assets/_Project/Tests/PlayModeSmokeTest.md) 检查既有关卡，并对 Courtyard 检查：目标可辨、W 控制可用、开放路径与实体缺口一致、每阶段移动/失败/重开、终点完成和返回选关。五人无指导试玩必须与开发者冒烟分开记录。

构建使用 `./scripts/build-macos.sh`，输出 `WSliceProto/builds/macos/W-Slice.app` 和 `build-info.json`。核对 manifest 中实际启用场景，再启动验证；不能只看构建退出码。

PR 验证记录应包含：

```text
Commit / dirty diff reference:
Unity version:
Invocation directory / CI run:
L0/L1: Pass / Fail / Not run (receipt path; error/warning counts)
L2 EditMode: Pass / Fail / Not run (passed / skipped / total; XML path)
L3 PlayMode: Pass / Fail / Not run (passed / skipped / total; XML path)
L4 manual smoke: Pass / Fail / Not run (operator; steps; observations)
Five-player playtest: Not run / Incomplete / Complete (real participants; record path)
L5 macOS build and launch: Pass / Fail / Not run (manifest; launch evidence)
```

历史 [v0.3 release 文档](../docs/releases/v0.3-wslice-demo.md) 保留了 2026-06-19 原文，其中 L2/L3 曾在 XML 缺失时写 Pass。该记录只能证明脚本当时打印了这些信息，**不能确认测试执行或通过，也不能作为当前代码的验证**。新证据另建，禁止改写历史为已复验。
