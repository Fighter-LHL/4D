# GardenGraybox 细节优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 `GardenGraybox` 生成比例和 UI 布局，并添加 Play Mode 行为测试验证 W-Slice 显隐机制。

**Architecture:** 在生成器里加入静态配置区统一场景/UI 数值；修改 `EditorBuildSettings` 把灰盒场景加入 Build；扩展 Play Mode 测试程序集引用；新增一个 Play Mode 测试类，加载场景后通过 `WState.Force(w)` 驱动切片并断言物体 scale。

**Tech Stack:** Unity 6000.0.77f1, URP, NUnit/Unity Test Framework

---

### Task 1: 在生成器中加入配置区并优化 Ground 和 UI

**Files:**
- Modify: `Assets/_Project/Editor/GardenGrayboxGenerator.cs`

- [ ] **Step 1: 在类顶部添加静态配置区**

在 `GardenGrayboxGenerator` 类内、`Generate()` 之前插入：

```csharp
private static class GardenLayout
{
    public const float GroundScaleXZ = 1.2f; // Plane 默认 10x10 => 12x12

    public static class UI
    {
        public const float DialWidth = 300f;
        public const float DialHeight = 40f;
        public const float DialBottomMargin = 60f;

        public const float DebugWidth = 220f;
        public const float DebugHeight = 110f;
        public const float DebugLeftMargin = 20f;
        public const float DebugTopMargin = 20f;
    }
}
```

- [ ] **Step 2: 修改 Ground 缩放**

找到：
```csharp
var ground = FindOrCreatePrimitive("Ground", PrimitiveType.Plane);
ground.transform.localScale = new Vector3(10f, 1f, 10f);
```
改为：
```csharp
var ground = FindOrCreatePrimitive("Ground", PrimitiveType.Plane);
ground.transform.localScale = new Vector3(GardenLayout.GroundScaleXZ, 1f, GardenLayout.GroundScaleXZ);
```

- [ ] **Step 3: 设置 WDialSlider 的位置和大小**

在 `var dialView = ...` 之前添加：

```csharp
var sliderRect = sliderObj.GetComponent<RectTransform>();
sliderRect.anchorMin = new Vector2(0.5f, 0f);
sliderRect.anchorMax = new Vector2(0.5f, 0f);
sliderRect.pivot = new Vector2(0.5f, 0.5f);
sliderRect.anchoredPosition = new Vector2(0f, GardenLayout.UI.DialBottomMargin);
sliderRect.sizeDelta = new Vector2(GardenLayout.UI.DialWidth, GardenLayout.UI.DialHeight);
```

- [ ] **Step 4: 设置 DebugText 的位置和大小**

在 `var debugOverlay = ...` 之后、`var debugSo = ...` 之前添加：

```csharp
var debugRect = debugObj.GetComponent<RectTransform>();
debugRect.anchorMin = new Vector2(0f, 1f);
debugRect.anchorMax = new Vector2(0f, 1f);
debugRect.pivot = new Vector2(0f, 1f);
debugRect.anchoredPosition = new Vector2(GardenLayout.UI.DebugLeftMargin, -GardenLayout.UI.DebugTopMargin);
debugRect.sizeDelta = new Vector2(GardenLayout.UI.DebugWidth, GardenLayout.UI.DebugHeight);
```

- [ ] **Step 5: Commit**

```bash
git add Assets/_Project/Editor/GardenGrayboxGenerator.cs
git commit -m "feat: add layout config and polish Ground/UI placement"
```

---

### Task 2: 把灰盒场景加入 Build Settings 并扩展测试引用

**Files:**
- Modify: `ProjectSettings/EditorBuildSettings.asset`
- Modify: `Assets/_Project/Tests/PlayMode/WSlice.Tests.PlayMode.asmdef`

- [ ] **Step 1: 在 EditorBuildSettings 里追加 GardenGraybox**

编辑 `ProjectSettings/EditorBuildSettings.asset`，在 `m_Scenes:` 列表末尾追加：

```yaml
  - enabled: 1
    path: Assets/_Project/Level/Scenes/GardenGraybox.unity
    guid: 658829652be7c4008bb34b259adbd25d
```

- [ ] **Step 2: 给 Play Mode 测试程序集加 WSlice.Level 引用**

编辑 `Assets/_Project/Tests/PlayMode/WSlice.Tests.PlayMode.asmdef`，在 `references` 数组中加入 `"WSlice.Level"`：

```json
"references": [
    "WSlice.Core",
    "WSlice.Entities",
    "WSlice.Level",
    "UnityEngine.TestRunner",
    "UnityEditor.TestRunner"
],
```

- [ ] **Step 3: Commit**

```bash
git add ProjectSettings/EditorBuildSettings.asset \
        Assets/_Project/Tests/PlayMode/WSlice.Tests.PlayMode.asmdef
git commit -m "chore: add GardenGraybox to build settings and Level asmref for tests"
```

---

### Task 3: 编写 Play Mode 行为测试

**Files:**
- Create: `Assets/_Project/Tests/PlayMode/GardenGrayboxBehaviorTests.cs`

- [ ] **Step 1: 创建测试文件并写入测试**

```csharp
using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using NUnit.Framework;
using WSlice.Level;

namespace WSlice.Tests.PlayMode
{
    public class GardenGrayboxBehaviorTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("GardenGraybox", LoadSceneMode.Single);
            while (!op.isDone) yield return null;
            yield return null; // 等待 Awake
        }

        [UnityTest]
        public IEnumerator GapSegmentAppearsAtMidW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var gap = GameObject.Find("GardenWall_GapSegment");
            Assert.That(level, Is.Not.Null);
            Assert.That(gap, Is.Not.Null);

            level.WState.Force(0f);
            yield return null;
            Assert.That(gap.transform.localScale.sqrMagnitude, Is.LessThan(0.01f), "Gap should be invisible at w=0");

            level.WState.Force(0.55f);
            yield return null;
            Assert.That(gap.transform.localScale.sqrMagnitude, Is.GreaterThan(0.5f), "Gap should be visible at w=0.55");
        }

        [UnityTest]
        public IEnumerator StairAppearsAtHighW()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var stair = GameObject.Find("HiddenStair/Stair_1");
            Assert.That(level, Is.Not.Null);
            Assert.That(stair, Is.Not.Null);

            level.WState.Force(0f);
            yield return null;
            Assert.That(stair.transform.localScale.sqrMagnitude, Is.LessThan(0.01f), "Stair should be invisible at w=0");

            level.WState.Force(0.85f);
            yield return null;
            Assert.That(stair.transform.localScale.sqrMagnitude, Is.GreaterThan(0.5f), "Stair should be visible at w=0.85");
        }

        [UnityTest]
        public IEnumerator WallRemainsVisible()
        {
            var level = Object.FindFirstObjectByType<LevelRuntimeController>();
            var wall = GameObject.Find("GardenWall_A");
            Assert.That(level, Is.Not.Null);
            Assert.That(wall, Is.Not.Null);

            level.WState.Force(0f);
            yield return null;
            Assert.That(wall.transform.localScale.sqrMagnitude, Is.GreaterThan(0.5f), "Wall should remain visible at w=0");
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add Assets/_Project/Tests/PlayMode/GardenGrayboxBehaviorTests.cs \
        Assets/_Project/Tests/PlayMode/GardenGrayboxBehaviorTests.cs.meta
git commit -m "test: add PlayMode behavior tests for slice visibility"
```

---

### Task 4: 重新生成场景并运行全部测试

**Files:** N/A

- [ ] **Step 1: 重新生成场景**

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
  /Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -batchmode -projectPath /Users/lvhanlin/Documents/4D/WSliceProto \
  -executeMethod WSlice.Editor.GardenGrayboxGenerator.Generate \
  -logFile /Users/lvhanlin/Documents/4D/WSliceProto/generate.log \
  -quit
```

Expected log: `GardenGraybox generated successfully.`

- [ ] **Step 2: 运行 Edit Mode 测试**

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
  /Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -batchmode -runTests -testPlatform EditMode \
  -testResults /Users/lvhanlin/Documents/4D/WSliceProto/editmode-results.xml \
  -logFile /Users/lvhanlin/Documents/4D/WSliceProto/editmode.log \
  -projectPath /Users/lvhanlin/Documents/4D/WSliceProto
```

检查：
```bash
head -n 2 /Users/lvhanlin/Documents/4D/WSliceProto/editmode-results.xml
```

Expected: `total="19" passed="19" failed="0"`

- [ ] **Step 3: 运行 Play Mode 测试**

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
  /Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -batchmode -runTests -testPlatform PlayMode \
  -testResults /Users/lvhanlin/Documents/4D/WSliceProto/playmode-results.xml \
  -logFile /Users/lvhanlin/Documents/4D/WSliceProto/playmode.log \
  -projectPath /Users/lvhanlin/Documents/4D/WSliceProto
```

检查：
```bash
head -n 2 /Users/lvhanlin/Documents/4D/WSliceProto/playmode-results.xml
```

Expected: `total="4" passed="4" failed="0"`

- [ ] **Step 4: 清理日志并提交最终变更**

```bash
rm -f /Users/lvhanlin/Documents/4D/WSliceProto/generate.log \
     /Users/lvhanlin/Documents/4D/WSliceProto/editmode.log \
     /Users/lvhanlin/Documents/4D/WSliceProto/playmode.log

git add Assets/_Project/Level/Scenes/GardenGraybox.unity \
        ProjectSettings/EditorBuildSettings.asset
git status --short
git commit -m "chore: regenerate GardenGraybox with polished layout"
```

---

## Self-Review Checklist

- [x] Spec coverage：布局配置、Build Settings、测试引用、行为测试、重新验证都有任务。
- [x] Placeholder scan：无 TBD/TODO，代码和命令完整。
- [x] Type consistency：`LevelRuntimeController`、`WState`、`SceneManager` API 与项目一致。
