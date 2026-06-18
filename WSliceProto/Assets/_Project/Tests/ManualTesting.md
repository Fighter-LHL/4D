# 手动测试指南

当前环境可以用 Unity batchmode 做脚本编译和灰盒校验；`-runTests` 有时会退出 0 但不产出 XML。遇到这种情况时，用 Unity Editor Test Runner 手动执行 EditMode/PlayMode。

## Edit Mode 测试

1. 打开 Unity Editor，加载项目：`/Users/lvhanlin/Documents/4D/WSliceProto`。
2. 打开 Test Runner 窗口：`Window -> General -> Test Runner`。
3. 切换到 `Edit Mode` 标签。
4. 点击 `Run All`。

### 预期通过的测试

- `WRangeTests`
- `WConditionTests`
- `WStateTests`
- `WSnapResolverTests`
- `LevelGraphRuntimeTests`
- `WDialModelTests`
- `PlayerHUDModelTests`
- `WDialTrackModelTests`
- `LevelDefinitionValidatorTests`

## Play Mode 测试

1. 打开 Unity Editor，加载项目：`/Users/lvhanlin/Documents/4D/WSliceProto`。
2. 打开 Test Runner，切换到 `Play Mode`。
3. 点击 `Run All`。

### 预期通过的测试

- `GardenGrayboxBehaviorTests`
- `GardenGrayboxMovementTests`
- `SliceEntityPlayModeTests`
- `WDialViewPlayModeTests`

## 命令行方式

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath /Users/lvhanlin/Documents/4D/WSliceProto \
  -runTests -testPlatform EditMode \
  -testResults editmode-results.xml \
  -quit -batchmode
```

Expected: `test-run result="Passed"` and an XML file. If no XML is produced, run the same suite in the Unity Editor Test Runner.

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath /Users/lvhanlin/Documents/4D/WSliceProto \
  -quit -batchmode -nographics
```

Expected: `Tundra build success`。

```bash
/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -projectPath /Users/lvhanlin/Documents/4D/WSliceProto \
  -executeMethod WSlice.Editor.GardenGrayboxGenerator.Validate \
  -quit -batchmode -nographics
```

Expected: `GardenGraybox validation passed.`。
