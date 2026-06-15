using UnityEngine;
using UnityEditor;
using UnityEngine.UI;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;
using TMPro;
using WSlice.Core;
using WSlice.Entities;
using WSlice.Level;
using WSlice.Player;
using WSlice.UI;

namespace WSlice.Editor
{
    public static class GardenGrayboxGenerator
    {
        [MenuItem("WSlice/Validate Garden Graybox")]
        public static void Validate()
        {
            int errors = 0;
            int warnings = 0;

            // Profiles
            var wallProfile = AssetDatabase.LoadAssetAtPath<SliceProfile>("Assets/_Project/Entities/SliceProfiles/WallProfile.asset");
            var gapProfile = AssetDatabase.LoadAssetAtPath<SliceProfile>("Assets/_Project/Entities/SliceProfiles/GapProfile.asset");
            var stairProfile = AssetDatabase.LoadAssetAtPath<SliceProfile>("Assets/_Project/Entities/SliceProfiles/StairProfile.asset");

            if (wallProfile == null) { Debug.LogError("WallProfile.asset missing"); errors++; }
            else if (!IsConstant(wallProfile.VisibilityCurve, 1f)) { Debug.LogError("WallProfile.VisibilityCurve should be constant 1"); errors++; }

            if (gapProfile == null) { Debug.LogError("GapProfile.asset missing"); errors++; }
            else if (gapProfile.VisibilityCurve.length < 3) { Debug.LogError($"GapProfile.VisibilityCurve has {gapProfile.VisibilityCurve.length} keys, expected 5"); errors++; }

            if (stairProfile == null) { Debug.LogError("StairProfile.asset missing"); errors++; }
            else if (stairProfile.SolidRange.Min < 0.7f || stairProfile.SolidRange.Max > 0.95f) { Debug.LogError($"StairProfile.SolidRange {stairProfile.SolidRange.Min}-{stairProfile.SolidRange.Max} unexpected"); errors++; }

            // Scene
            string scenePath = "Assets/_Project/Level/Scenes/GardenGraybox.unity";
            Scene scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);

            errors += RequireObject("Main Camera", typeof(Camera));
            errors += RequireObject("Directional Light", typeof(Light));
            errors += RequireObject("Ground", typeof(MeshCollider));
            errors += RequireObject("Player", typeof(PlayerCharacter), typeof(MovementController));
            errors += RequireObject("GardenWall_A", typeof(SliceEntity));
            errors += RequireObject("GardenWall_GapSegment", typeof(SliceEntity));
            errors += RequireObject("HiddenStair", null);
            errors += RequireObject("Flower", typeof(CapsuleCollider));
            errors += RequireObject("Nodes", null);
            errors += RequireObject("LevelRuntime", typeof(LevelRuntimeController));
            errors += RequireObject("PlayerInput", typeof(PlayerInputRouter), typeof(TapMoveInput));
            errors += RequireObject("Canvas", typeof(Canvas));
            errors += RequireObject("WDialSlider", typeof(Slider), typeof(WDialView));
            errors += RequireObject("DebugText", typeof(TextMeshProUGUI), typeof(DebugOverlay));

            var levelRuntime = GameObject.Find("LevelRuntime")?.GetComponent<LevelRuntimeController>();
            if (levelRuntime == null || levelRuntime.Definition == null)
            {
                Debug.LogError("LevelRuntimeController or its Definition is not assigned");
                errors++;
            }

            var playerInput = GameObject.Find("PlayerInput")?.GetComponent<PlayerInputRouter>();
            if (playerInput != null)
            {
                var so = new SerializedObject(playerInput);
                if (so.FindProperty("gameCamera").objectReferenceValue == null) { Debug.LogWarning("PlayerInputRouter.gameCamera is null"); warnings++; }
                if (so.FindProperty("movement").objectReferenceValue == null) { Debug.LogWarning("PlayerInputRouter.movement is null"); warnings++; }
            }

            var wallA = GameObject.Find("GardenWall_A")?.GetComponent<SliceEntity>();
            if (wallA != null && wallA.profile == null) { Debug.LogError("GardenWall_A SliceEntity.profile is null"); errors++; }

            var gap = GameObject.Find("GardenWall_GapSegment")?.GetComponent<SliceEntity>();
            if (gap != null && gap.profile == null) { Debug.LogError("GardenWall_GapSegment SliceEntity.profile is null"); errors++; }

            if (errors == 0 && warnings == 0)
                Debug.Log("GardenGraybox validation passed.");
            else
                Debug.LogWarning($"GardenGraybox validation finished with {errors} error(s) and {warnings} warning(s).");
        }

        private static int RequireObject(string name, params System.Type[] expectedComponents)
        {
            var go = GameObject.Find(name);
            if (go == null)
            {
                Debug.LogError($"Required object '{name}' not found in scene");
                return 1;
            }
            if (expectedComponents != null)
            {
                foreach (var t in expectedComponents)
                {
                    if (t != null && !go.TryGetComponent(t, out _))
                    {
                        Debug.LogError($"Object '{name}' is missing component {t.Name}");
                        return 1;
                    }
                }
            }
            return 0;
        }

        private static bool IsConstant(AnimationCurve curve, float value)
        {
            if (curve == null || curve.length == 0) return false;
            foreach (var key in curve.keys)
                if (!Mathf.Approximately(key.value, value)) return false;
            return true;
        }

        private static class GardenLayout
        {
            public const float GroundScaleXZ = 1.2f; // Plane default 10x10 => 12x12

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

        [MenuItem("WSlice/Generate Garden Graybox")]
        public static void Generate()
        {
            var levelDef = AssetDatabase.LoadAssetAtPath<LevelDefinition>("Assets/_Project/Level/Definitions/GardenLevel.asset");
            if (levelDef == null)
            {
                Debug.LogError("GardenLevel.asset not found. Aborting generation.");
                return;
            }

            string scenePath = "Assets/_Project/Level/Scenes/GardenGraybox.unity";
            Scene scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);

            Undo.IncrementCurrentGroup();
            int undoGroup = Undo.GetCurrentGroup();
            Undo.SetCurrentGroupName("Generate Garden Graybox");

            var cameraObj = FindOrCreate("Main Camera", typeof(Camera));
            cameraObj.transform.position = new Vector3(0f, 5f, -8f);
            cameraObj.transform.rotation = Quaternion.Euler(35f, 0f, 0f);

            var wallProfile = CreateOrLoadProfile("WallProfile", ConfigureWall);
            var gapProfile = CreateOrLoadProfile("GapProfile", ConfigureGap);
            var stairProfile = CreateOrLoadProfile("StairProfile", ConfigureStair);

            var ground = FindOrCreatePrimitive("Ground", PrimitiveType.Plane);
            ground.transform.localScale = new Vector3(GardenLayout.GroundScaleXZ, 1f, GardenLayout.GroundScaleXZ);

            var levelRuntime = FindOrCreate("LevelRuntime", typeof(LevelRuntimeController));
            var levelCtrl = levelRuntime.GetComponent<LevelRuntimeController>();
            var levelSo = new SerializedObject(levelCtrl);
            levelSo.FindProperty("definition").objectReferenceValue = levelDef;
            levelSo.FindProperty("wSmoothing").floatValue = 2f;
            levelSo.ApplyModifiedProperties();

            var player = FindOrCreatePrimitive("Player", PrimitiveType.Capsule);
            player.transform.position = new Vector3(0f, 0f, -4f);
            var playerChar = player.GetComponent<PlayerCharacter>() ?? player.AddComponent<PlayerCharacter>();
            playerChar.CurrentNodeId = "Outside";
            var movement = player.GetComponent<MovementController>() ?? player.AddComponent<MovementController>();
            var moveSo = new SerializedObject(movement);
            moveSo.FindProperty("character").objectReferenceValue = playerChar;
            moveSo.FindProperty("levelController").objectReferenceValue = levelCtrl;
            moveSo.FindProperty("moveSpeed").floatValue = 3f;
            moveSo.FindProperty("arrivalThreshold").floatValue = 0.05f;
            moveSo.ApplyModifiedProperties();

            var wallA = FindOrCreatePrimitive("GardenWall_A", PrimitiveType.Cube);
            wallA.transform.position = new Vector3(0f, 1f, 0f);
            wallA.transform.localScale = new Vector3(4f, 2f, 0.5f);
            var wallAEntity = wallA.GetComponent<SliceEntity>() ?? wallA.AddComponent<SliceEntity>();
            wallAEntity.profile = wallProfile;
            wallAEntity.presenter = wallA.GetComponent<ScalePresenter>() ?? wallA.AddComponent<ScalePresenter>();

            var wallGap = FindOrCreatePrimitive("GardenWall_GapSegment", PrimitiveType.Cube);
            wallGap.transform.position = new Vector3(0f, 1f, -2f);
            wallGap.transform.localScale = new Vector3(1f, 2f, 0.5f);
            SetupSliceEntityWithPresenters(wallGap, gapProfile);

            var stairParent = FindOrCreate("HiddenStair");
            stairParent.transform.position = Vector3.zero;

            var stair1 = FindOrCreatePrimitive("Stair_1", PrimitiveType.Cube);
            stair1.transform.SetParent(stairParent.transform);
            stair1.transform.localPosition = new Vector3(2f, 0.25f, 0f);
            stair1.transform.localScale = new Vector3(1f, 0.5f, 0.3f);
            SetupStairCube(stair1, stairProfile);

            var stair2 = FindOrCreatePrimitive("Stair_2", PrimitiveType.Cube);
            stair2.transform.SetParent(stairParent.transform);
            stair2.transform.localPosition = new Vector3(2f, 0.75f, 0.3f);
            stair2.transform.localScale = new Vector3(1f, 0.5f, 0.3f);
            SetupStairCube(stair2, stairProfile);

            var stair3 = FindOrCreatePrimitive("Stair_3", PrimitiveType.Cube);
            stair3.transform.SetParent(stairParent.transform);
            stair3.transform.localPosition = new Vector3(2f, 1.25f, 0.6f);
            stair3.transform.localScale = new Vector3(1f, 0.5f, 0.3f);
            SetupStairCube(stair3, stairProfile);

            var flower = FindOrCreatePrimitive("Flower", PrimitiveType.Capsule);
            flower.transform.position = new Vector3(2f, 1f, 0f);

            var nodesParent = FindOrCreate("Nodes");
            nodesParent.transform.position = Vector3.zero;

            GameObject CreateNode(string name, Vector3 pos)
            {
                var node = FindOrCreate(name);
                node.transform.SetParent(nodesParent.transform);
                node.transform.localPosition = pos;
                return node;
            }

            CreateNode("OutsideNode", new Vector3(0f, 0f, -4f));
            CreateNode("GapNode", new Vector3(0f, 0f, -2f));
            CreateNode("InsideGardenNode", new Vector3(0f, 0f, 0f));
            CreateNode("FlowerBaseNode", new Vector3(2f, 0f, 0f));
            CreateNode("FlowerTopNode", new Vector3(2f, 1.5f, 0f));

            var input = FindOrCreate("PlayerInput", typeof(PlayerInputRouter), typeof(TapMoveInput));
            var router = input.GetComponent<PlayerInputRouter>();
            var routerSo = new SerializedObject(router);
            routerSo.FindProperty("gameCamera").objectReferenceValue = cameraObj.GetComponent<Camera>();
            routerSo.FindProperty("groundMask").intValue = LayerMask.GetMask("Default");
            routerSo.FindProperty("levelController").objectReferenceValue = levelCtrl;
            routerSo.FindProperty("movement").objectReferenceValue = movement;
            routerSo.FindProperty("snapRadius").floatValue = 0.03f;
            routerSo.ApplyModifiedProperties();

            var tapMove = input.GetComponent<TapMoveInput>() ?? input.AddComponent<TapMoveInput>();
            var tapSo = new SerializedObject(tapMove);
            tapSo.FindProperty("router").objectReferenceValue = router;
            tapSo.ApplyModifiedProperties();

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

            var sliderRect = sliderObj.GetComponent<RectTransform>();
            sliderRect.anchorMin = new Vector2(0.5f, 0f);
            sliderRect.anchorMax = new Vector2(0.5f, 0f);
            sliderRect.pivot = new Vector2(0.5f, 0.5f);
            sliderRect.anchoredPosition = new Vector2(0f, GardenLayout.UI.DialBottomMargin);
            sliderRect.sizeDelta = new Vector2(GardenLayout.UI.DialWidth, GardenLayout.UI.DialHeight);
            SetupSliderVisuals(sliderObj, slider);

            var dialView = sliderObj.GetComponent<WDialView>() ?? sliderObj.AddComponent<WDialView>();
            var dialSo = new SerializedObject(dialView);
            dialSo.FindProperty("slider").objectReferenceValue = slider;
            dialSo.ApplyModifiedProperties();

            var debugObj = FindOrCreate("DebugText", typeof(RectTransform), typeof(TextMeshProUGUI));
            debugObj.transform.SetParent(canvas.transform, false);
            var debugText = debugObj.GetComponent<TextMeshProUGUI>();
            var debugOverlay = debugObj.GetComponent<DebugOverlay>() ?? debugObj.AddComponent<DebugOverlay>();
            debugText.fontSize = 18f;
            debugText.enableAutoSizing = true;
            debugText.alignment = TextAlignmentOptions.TopLeft;

            var debugRect = debugObj.GetComponent<RectTransform>();
            debugRect.anchorMin = new Vector2(0f, 1f);
            debugRect.anchorMax = new Vector2(0f, 1f);
            debugRect.pivot = new Vector2(0f, 1f);
            debugRect.anchoredPosition = new Vector2(GardenLayout.UI.DebugLeftMargin, -GardenLayout.UI.DebugTopMargin);
            debugRect.sizeDelta = new Vector2(GardenLayout.UI.DebugWidth, GardenLayout.UI.DebugHeight);

            var debugSo = new SerializedObject(debugOverlay);
            debugSo.FindProperty("label").objectReferenceValue = debugText;
            debugSo.ApplyModifiedProperties();

            EditorSceneManager.SaveScene(scene);
            AssetDatabase.Refresh();
            Undo.CollapseUndoOperations(undoGroup);
            Debug.Log("GardenGraybox generated successfully.");
        }

        private static SliceProfile CreateOrLoadProfile(string assetName, System.Action<SliceProfile> configure)
        {
            string dir = "Assets/_Project/Entities/SliceProfiles";
            if (!AssetDatabase.IsValidFolder(dir))
            {
                string parent = System.IO.Path.GetDirectoryName(dir).Replace('\\', '/');
                string folder = System.IO.Path.GetFileName(dir);
                AssetDatabase.CreateFolder(parent, folder);
            }

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
                    {
                        Undo.AddComponent(go, t);
                    }
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

        private static void SetupStairCube(GameObject go, SliceProfile profile)
        {
            SetupSliceEntityWithPresenters(go, profile);
        }

        private static void SetupSliceEntityWithPresenters(GameObject go, SliceProfile profile)
        {
            var entity = go.GetComponent<SliceEntity>() ?? go.AddComponent<SliceEntity>();
            entity.profile = profile;
            entity.presenter = go.GetComponent<ScalePresenter>() ?? go.AddComponent<ScalePresenter>();
            if (!go.TryGetComponent<FadePresenter>(out _))
                go.AddComponent<FadePresenter>();
        }

        private static void SetupSliderVisuals(GameObject sliderObj, Slider slider)
        {
            // remove stale visual children if regenerating
            for (int i = sliderObj.transform.childCount - 1; i >= 0; i--)
            {
                var child = sliderObj.transform.GetChild(i);
                if (child.name == "Background" || child.name == "Fill Area" || child.name == "Handle Slide Area")
                    Undo.DestroyObjectImmediate(child.gameObject);
            }

            float padding = 4f;
            var background = CreateUIImage("Background", sliderObj.transform,
                new Color(0f, 0f, 0f, 0.5f), Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f));
            background.GetComponent<RectTransform>().offsetMin = Vector2.zero;
            background.GetComponent<RectTransform>().offsetMax = Vector2.zero;

            var fillArea = CreateUIRect("Fill Area", sliderObj.transform,
                Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f));
            fillArea.offsetMin = new Vector2(padding, padding);
            fillArea.offsetMax = new Vector2(-padding, -padding);

            var fill = CreateUIImage("Fill", fillArea,
                new Color(1f, 1f, 1f, 0.9f), Vector2.zero, new Vector2(0f, 1f), new Vector2(0f, 0.5f));
            fill.GetComponent<RectTransform>().offsetMin = Vector2.zero;
            fill.GetComponent<RectTransform>().offsetMax = Vector2.zero;

            var handleArea = CreateUIRect("Handle Slide Area", sliderObj.transform,
                Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f));
            handleArea.offsetMin = new Vector2(padding, padding);
            handleArea.offsetMax = new Vector2(-padding, -padding);

            var handle = CreateUIImage("Handle", handleArea,
                Color.white, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0.5f, 0.5f));
            handle.GetComponent<RectTransform>().sizeDelta = new Vector2(20f, 20f);

            slider.fillRect = fill.GetComponent<RectTransform>();
            slider.handleRect = handle.GetComponent<RectTransform>();
            slider.targetGraphic = handle.GetComponent<Image>();
            slider.transition = Selectable.Transition.None;
        }

        private static GameObject CreateUIImage(string name, Transform parent, Color color,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.pivot = pivot;
            rt.anchoredPosition = Vector2.zero;
            rt.sizeDelta = Vector2.zero;
            go.GetComponent<Image>().color = color;
            Undo.RegisterCreatedObjectUndo(go, "Create " + name);
            return go;
        }

        private static RectTransform CreateUIRect(string name, Transform parent,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.pivot = pivot;
            rt.anchoredPosition = Vector2.zero;
            rt.sizeDelta = Vector2.zero;
            Undo.RegisterCreatedObjectUndo(go, "Create " + name);
            return rt;
        }

        private static void ConfigureWall(SliceProfile p)
        {
            p.VisibilityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            p.SolidityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            p.GlowCurve = AnimationCurve.Constant(0f, 1f, 0f);
            p.PositionOffsetAtW0 = Vector3.zero;
            p.PositionOffsetAtW1 = Vector3.zero;
            p.SolidRange = new WRange { Min = 0f, Max = 1f };
            p.InteractiveRange = new WRange { Min = 0f, Max = 1f };
        }

        private static void ConfigureGap(SliceProfile p)
        {
            p.VisibilityCurve = new AnimationCurve(
                new Keyframe(0f, 0f),
                new Keyframe(0.35f, 0.3f),
                new Keyframe(0.55f, 1f),
                new Keyframe(0.70f, 0.3f),
                new Keyframe(1f, 0f));
            p.SolidityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            p.GlowCurve = new AnimationCurve(
                new Keyframe(0f, 0f),
                new Keyframe(0.35f, 0.5f),
                new Keyframe(0.55f, 1f),
                new Keyframe(0.70f, 0.5f),
                new Keyframe(1f, 0f));
            p.PositionOffsetAtW0 = Vector3.zero;
            p.PositionOffsetAtW1 = Vector3.zero;
            p.SolidRange = new WRange { Min = 0.50f, Max = 0.70f };
            p.InteractiveRange = new WRange { Min = 0.50f, Max = 0.70f };
        }

        private static void ConfigureStair(SliceProfile p)
        {
            p.VisibilityCurve = new AnimationCurve(
                new Keyframe(0f, 0f),
                new Keyframe(0.70f, 0f),
                new Keyframe(0.80f, 1f),
                new Keyframe(0.90f, 1f),
                new Keyframe(1f, 0f));
            p.SolidityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            p.GlowCurve = AnimationCurve.Constant(0f, 1f, 0f);
            p.PositionOffsetAtW0 = Vector3.zero;
            p.PositionOffsetAtW1 = Vector3.zero;
            p.SolidRange = new WRange { Min = 0.75f, Max = 0.90f };
            p.InteractiveRange = new WRange { Min = 0.75f, Max = 0.90f };
        }
    }
}
