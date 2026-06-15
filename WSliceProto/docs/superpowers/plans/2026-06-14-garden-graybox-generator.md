# GardenGraybox 自动生成器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Unity Editor 脚本一键生成 `GardenGraybox.unity` 灰盒场景和三个 `SliceProfile` 资产，并自动完成所有引用绑定。

**Architecture:** 新增一个 `GardenGrayboxGenerator` Editor 脚本，提供菜单 `WSlice/Generate Garden Graybox`。脚本使用 `UnityEditor` API 创建/查找场景物体、创建 ScriptableObject 资产、通过 SerializedObject 设置私有 `[SerializeField]` 引用，最后保存场景。`DebugOverlay` 增加运行时自动查找 fallback，解决 `WState` 在运行时才能实例化的问题。

**Tech Stack:** Unity 6000.0.77f1, URP, UnityEditor API, TMPro (via `com.unity.ugui`)

---

### Task 1: 让 DebugOverlay 能在运行时自动绑定 WState

**Files:**
- Modify: `Assets/_Project/UI/DebugOverlay.cs`

`WState` 在 `LevelRuntimeController.Awake()` 中实例化，Editor 里无法提前拖到 Inspector。需要让 `DebugOverlay` 在 `Start()` 中自动查找。

- [ ] **Step 1: 在 DebugOverlay 里添加 Start 自动绑定**

```csharp
private void Start()
{
    if (level == null)
    {
        level = FindFirstObjectByType<LevelRuntimeController>();
        wState = level?.WState;
    }
    if (character == null)
        character = FindFirstObjectByType<Player.PlayerCharacter>();
}
```

- [ ] **Step 2: Commit**

```bash
git add Assets/_Project/UI/DebugOverlay.cs
git commit -m "fix: auto-bind DebugOverlay references at runtime"
```

---

### Task 2: 创建 SliceProfile 工厂方法

**Files:**
- Create: `Assets/_Project/Editor/GardenGrayboxGenerator.cs`

这个方法负责生成/复用三个 `SliceProfile` 资产。

- [ ] **Step 1: 添加 CreateOrLoadProfile 辅助方法**

```csharp
private static SliceProfile CreateOrLoadProfile(string assetName, System.Action<SliceProfile> configure)
{
    string dir = "Assets/_Project/Entities/SliceProfiles";
    string path = $"{dir}/{assetName}.asset";

    var profile = AssetDatabase.LoadAssetAtPath<SliceProfile>(path);
    if (profile == null)
    {
        profile = ScriptableObject.CreateInstance<SliceProfile>();
        AssetDatabase.CreateAsset(profile, path);
    }

    configure(profile);
    EditorUtility.SetDirty(profile);
    AssetDatabase.SaveAssetIfDirty(profile);
    return profile;
}
```

- [ ] **Step 2: 实现三个 profile 的 configure 逻辑**

WallProfile：
```csharp
CreateOrLoadProfile("WallProfile", p =>
{
    p.VisibilityCurve = AnimationCurve.Constant(0f, 1f, 1f);
    p.SolidityCurve = AnimationCurve.Constant(0f, 1f, 1f);
    p.GlowCurve = AnimationCurve.Constant(0f, 1f, 0f);
    p.PositionOffsetAtW0 = Vector3.zero;
    p.PositionOffsetAtW1 = Vector3.zero;
    p.SolidRange = new WSlice.Core.WRange { Min = 0f, Max = 1f };
    p.InteractiveRange = new WSlice.Core.WRange { Min = 0f, Max = 1f };
});
```

GapProfile 和 StairProfile 使用文档指定的关键帧。示例（GapProfile）：
```csharp
p.VisibilityCurve = new AnimationCurve(
    new Keyframe(0f, 0f),
    new Keyframe(0.35f, 0.3f),
    new Keyframe(0.55f, 1f),
    new Keyframe(0.70f, 0.3f),
    new Keyframe(1f, 0f));
p.GlowCurve = new AnimationCurve(
    new Keyframe(0f, 0f),
    new Keyframe(0.35f, 0.5f),
    new Keyframe(0.55f, 1f),
    new Keyframe(0.70f, 0.5f),
    new Keyframe(1f, 0f));
p.SolidRange = new WSlice.Core.WRange { Min = 0.50f, Max = 0.70f };
p.InteractiveRange = new WSlice.Core.WRange { Min = 0.50f, Max = 0.70f };
```

StairProfile 同理。

- [ ] **Step 3: Commit**

```bash
git add Assets/_Project/Editor/GardenGrayboxGenerator.cs
git commit -m "feat: add SliceProfile factory helper"
```

---

### Task 3: 创建场景物体和引用绑定

**Files:**
- Modify: `Assets/_Project/Editor/GardenGrayboxGenerator.cs`

- [ ] **Step 1: 打开场景并更新 Main Camera**

```csharp
[MenuItem("WSlice/Generate Garden Graybox")]
public static void Generate()
{
    string scenePath = "Assets/_Project/Level/Scenes/GardenGraybox.unity";
    Scene scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);

    // Main Camera
    var cameraObj = FindOrCreate("Main Camera", typeof(Camera));
    cameraObj.transform.position = new Vector3(0f, 5f, -8f);
    cameraObj.transform.rotation = Quaternion.Euler(35f, 0f, 0f);

    // Profiles
    var wallProfile = CreateOrLoadProfile("WallProfile", ConfigureWall);
    var gapProfile = CreateOrLoadProfile("GapProfile", ConfigureGap);
    var stairProfile = CreateOrLoadProfile("StairProfile", ConfigureStair);

    // Ground
    var ground = FindOrCreatePrimitive("Ground", PrimitiveType.Plane);
    ground.transform.localScale = new Vector3(10f, 1f, 10f);

    // ... 其余物体
}
```

- [ ] **Step 2: 实现 FindOrCreate / FindOrCreatePrimitive 辅助方法**

```csharp
private static GameObject FindOrCreate(string name, params System.Type[] components)
{
    var go = GameObject.Find(name);
    if (go == null)
    {
        go = new GameObject(name, components);
        Undo.RegisterCreatedObjectUndo(go, "Create " + name);
    }
    else
    {
        foreach (var t in components)
        {
            if (t != null && !go.TryGetComponent(t, out _))
                Undo.AddComponent(go, t);
        }
    }
    return go;
}

private static GameObject FindOrCreatePrimitive(string name, PrimitiveType type)
{
    var go = GameObject.Find(name);
    if (go == null)
    {
        go = GameObject.CreatePrimitive(type);
        go.name = name;
        Undo.RegisterCreatedObjectUndo(go, "Create " + name);
    }
    return go;
}
```

- [ ] **Step 3: 创建玩家、墙体、楼梯、花、节点**

按设计文档逐一手动生成，设置 Transform 和组件。关键示例（GardenWall_A）：

```csharp
var wallA = FindOrCreatePrimitive("GardenWall_A", PrimitiveType.Cube);
wallA.transform.position = new Vector3(0f, 1f, 0f);
wallA.transform.localScale = new Vector3(4f, 2f, 0.5f);
var wallAEntity = wallA.GetComponent<WSlice.Entities.SliceEntity>() ?? wallA.AddComponent<WSlice.Entities.SliceEntity>();
wallAEntity.profile = wallProfile;
wallAEntity.presenter = wallA.GetComponent<WSlice.Entities.ScalePresenter>() ?? wallA.AddComponent<WSlice.Entities.ScalePresenter>();
```

- [ ] **Step 4: 创建运行时和输入对象并绑定私有字段**

对私有 `[SerializeField]` 字段使用 `SerializedObject`：

```csharp
var levelRuntime = FindOrCreate("LevelRuntime", typeof(WSlice.Level.LevelRuntimeController));
var levelCtrl = levelRuntime.GetComponent<WSlice.Level.LevelRuntimeController>();
var levelSo = new SerializedObject(levelCtrl);
var levelDef = AssetDatabase.LoadAssetAtPath<WSlice.Level.LevelDefinition>("Assets/_Project/Level/Definitions/GardenLevel.asset");
if (levelDef == null)
{
    Debug.LogError("GardenLevel.asset not found. Aborting generation.");
    return;
}
levelSo.FindProperty("definition").objectReferenceValue = levelDef;
levelSo.FindProperty("wSmoothing").floatValue = 2f;
levelSo.ApplyModifiedProperties();

var player = FindOrCreatePrimitive("Player", PrimitiveType.Capsule);
player.transform.position = new Vector3(0f, 0f, -4f);
var playerChar = player.GetComponent<WSlice.Player.PlayerCharacter>() ?? player.AddComponent<WSlice.Player.PlayerCharacter>();
playerChar.CurrentNodeId = "Outside";
var movement = player.GetComponent<WSlice.Player.MovementController>() ?? player.AddComponent<WSlice.Player.MovementController>();
var moveSo = new SerializedObject(movement);
moveSo.FindProperty("character").objectReferenceValue = playerChar;
moveSo.FindProperty("levelController").objectReferenceValue = levelCtrl;
moveSo.ApplyModifiedProperties();

var input = FindOrCreate("PlayerInput", typeof(WSlice.Player.PlayerInputRouter));
var router = input.GetComponent<WSlice.Player.PlayerInputRouter>();
var routerSo = new SerializedObject(router);
routerSo.FindProperty("gameCamera").objectReferenceValue = cameraObj.GetComponent<Camera>();
routerSo.FindProperty("groundMask").intValue = LayerMask.GetMask("Default");
routerSo.FindProperty("levelController").objectReferenceValue = levelCtrl;
routerSo.FindProperty("movement").objectReferenceValue = movement;
routerSo.FindProperty("snapRadius").floatValue = 0.03f;
routerSo.ApplyModifiedProperties();
```

- [ ] **Step 5: 创建 UI（Canvas、Slider、DebugText）**

```csharp
var canvas = FindOrCreate("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
var canvasComp = canvas.GetComponent<Canvas>();
canvasComp.renderMode = RenderMode.ScreenSpaceOverlay;

var eventSystem = Object.FindFirstObjectByType<UnityEngine.EventSystems.EventSystem>();
if (eventSystem == null)
{
    var es = new GameObject("EventSystem",
        typeof(UnityEngine.EventSystems.EventSystem),
        typeof(UnityEngine.InputSystem.UI.InputSystemUIInputModule));
    Undo.RegisterCreatedObjectUndo(es, "Create EventSystem");
}

var sliderObj = FindOrCreate("WDialSlider", typeof(RectTransform), typeof(Slider));
sliderObj.transform.SetParent(canvas.transform, false);
var slider = sliderObj.GetComponent<Slider>();
slider.minValue = 0f;
slider.maxValue = 1f;
var dialView = sliderObj.GetComponent<WSlice.UI.WDialView>() ?? sliderObj.AddComponent<WSlice.UI.WDialView>();
var dialSo = new SerializedObject(dialView);
dialSo.FindProperty("slider").objectReferenceValue = slider;
dialSo.ApplyModifiedProperties();

var debugObj = FindOrCreate("DebugText", typeof(RectTransform), typeof(TMPro.TextMeshProUGUI));
debugObj.transform.SetParent(canvas.transform, false);
var debugText = debugObj.GetComponent<TMPro.TextMeshProUGUI>();
var debugOverlay = debugObj.GetComponent<WSlice.UI.DebugOverlay>() ?? debugObj.AddComponent<WSlice.UI.DebugOverlay>();
var debugSo = new SerializedObject(debugOverlay);
debugSo.FindProperty("label").objectReferenceValue = debugText;
debugSo.ApplyModifiedProperties();
```

- [ ] **Step 6: 保存场景并刷新 AssetDatabase**

```csharp
EditorSceneManager.SaveScene(scene);
AssetDatabase.Refresh();
Debug.Log("GardenGraybox generated successfully.");
```

- [ ] **Step 7: Commit**

```bash
git add Assets/_Project/Editor/GardenGrayboxGenerator.cs
git commit -m "feat: generate GardenGraybox scene objects and bind references"
```

---

### Task 4: 运行生成器

**Files:** N/A

- [ ] **Step 1: 通过 batchmode 执行生成器**

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
  /Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity \
  -batchmode -projectPath /Users/lvhanlin/Documents/4D/WSliceProto \
  -executeMethod WSlice.Editor.GardenGrayboxGenerator.Generate \
  -logFile /Users/lvhanlin/Documents/4D/WSliceProto/generate.log \
  -quit
```

- [ ] **Step 2: 检查日志**

```bash
grep -i "GardenGraybox generated successfully\|error\|exception" /Users/lvhanlin/Documents/4D/WSliceProto/generate.log
```

Expected: 看到 `GardenGraybox generated successfully.`，没有 error/exception。

- [ ] **Step 3: 检查生成的文件**

```bash
ls -l Assets/_Project/Entities/SliceProfiles/WallProfile.asset \
       Assets/_Project/Entities/SliceProfiles/GapProfile.asset \
       Assets/_Project/Entities/SliceProfiles/StairProfile.asset
```

Expected: 三个 asset 文件存在。

---

### Task 5: 验证场景引用并运行测试

**Files:** N/A

- [ ] **Step 1: 运行 Edit Mode 测试**

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

Expected: `total="19" passed="19" failed="0"`。

- [ ] **Step 2: 运行 Play Mode 测试**

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

Expected: `total="1" passed="1" failed="0"`。

- [ ] **Step 3: 提交所有变更**

```bash
git add Assets/_Project/Level/Scenes/GardenGraybox.unity \
        Assets/_Project/Entities/SliceProfiles/ \
        docs/superpowers/plans/
git commit -m "feat: auto-generate GardenGraybox scene and SliceProfiles"
```

---

## Self-Review Checklist

- [x] Spec coverage：场景物体、SliceProfile 资产、引用绑定、测试验证都有对应任务。
- [x] Placeholder scan：无 TBD/TODO，代码和命令完整。
- [x] Type consistency：使用项目中的 `WSlice.*` 命名空间和类名，字段名与现有代码一致。
