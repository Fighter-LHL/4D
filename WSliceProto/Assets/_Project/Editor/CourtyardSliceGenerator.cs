using System;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using WSlice.Entities;
using WSlice.Level;
using WSlice.Player;
using WSlice.UI;

namespace WSlice.Editor
{
    public static class CourtyardSliceGenerator
    {
        [MenuItem("WSlice/Generate Courtyard Slice")]
        public static void Generate()
        {
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var definition = AssetDatabase.LoadAssetAtPath<LevelDefinition>(CourtyardLayout.DefinitionPath);
            if (definition == null)
            {
                definition = ScriptableObject.CreateInstance<LevelDefinition>();
                AssetDatabase.CreateAsset(definition, CourtyardLayout.DefinitionPath);
            }
            CourtyardLayout.Populate(definition);
            EditorUtility.SetDirty(definition);
            AssetDatabase.SaveAssetIfDirty(definition);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            var profiles = new GardenProfiles(
                LoadProfile("WallProfile"), LoadProfile("GapProfile"), LoadProfile("StairProfile"));
            var shell = GardenSceneBuilder.Build(definition, profiles);
            GardenUIBuilder.Build(shell);
            foreach (var name in new[] { "Ground", "GardenWall_A", "GardenWall_B", "GardenWall_GapSegment", "HiddenStair", "Flower", "PathPreview", "WDialTrack", "PlayerHUDText", "DebugText" })
            {
                var go = GameObject.Find(name);
                if (go != null) UnityEngine.Object.DestroyImmediate(go);
            }
            var tutorial = shell.LevelController.GetComponent<LevelTutorialController>();
            if (tutorial != null) UnityEngine.Object.DestroyImmediate(tutorial);

            shell.PlayerCharacter.CurrentNodeId = CourtyardLayout.Entry;
            shell.PlayerCharacter.transform.position = definition.Nodes[0].WorldPosition;
            var bodyRenderer = shell.PlayerCharacter.GetComponent<Renderer>();
            if (bodyRenderer != null) bodyRenderer.enabled = false;
            foreach (var collider in shell.PlayerCharacter.GetComponents<Collider>()) collider.enabled = false;
            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.name = "PlayerVisual";
            body.transform.SetParent(shell.PlayerCharacter.transform, false);
            body.transform.localPosition = new Vector3(0f, 0.55f, 0f);
            body.transform.localScale = new Vector3(0.45f, 0.55f, 0.45f);
            UnityEngine.Object.DestroyImmediate(body.GetComponent<Collider>());
            body.GetComponent<Renderer>().sharedMaterial = Material("Player");

            shell.GameCamera.transform.position = new Vector3(12f, 16f, -22f);
            shell.GameCamera.transform.LookAt(new Vector3(0f, 0f, -1f));
            shell.GameCamera.orthographic = true;
            shell.GameCamera.orthographicSize = 7.5f;
            shell.GameCamera.clearFlags = CameraClearFlags.SolidColor;
            shell.GameCamera.backgroundColor = new Color(0.05f, 0.075f, 0.10f);
            SetBool(shell.InputRouter, "useSurfaceTargets", true);
            SetBool(shell.Movement, "failSessionOnSegmentBreak", false);
            // The representative experience finishes here; the original five-level chain is unchanged.
            SetReference(shell.LevelFlow, "catalog", null);

            var world = shell.LevelController.gameObject.AddComponent<CourtyardWorldView>();
            SetReference(world, "stoneMaterial", Material("Structure"));
            SetReference(world, "sliceMaterial", Material("Slice"));
            SetReference(world, "accentMaterial", Material("Interactable"));
            SetReference(world, "goalMaterial", Material("Goal"));
            var puzzle = shell.LevelController.gameObject.AddComponent<CourtyardPuzzleController>();
            SetReference(puzzle, "levelController", shell.LevelController);
            SetReference(puzzle, "session", shell.SessionController);
            SetReference(puzzle, "objectiveSource", shell.PlayerCharacter);
            SetReference(puzzle, "mutations", shell.LevelController.GetComponent<LevelGraphMutationController>());
            SetReference(puzzle, "world", world);
            SetReference(shell.SessionController, "completionCondition", puzzle);
            CourtyardExperienceView.Build(GameObject.Find("Canvas").transform, puzzle);
            var overlay = UnityEngine.Object.FindFirstObjectByType<LevelOutcomeOverlayView>();
            SetBool(overlay, "useChineseText", true);

            // World geometry is deterministically constructed by CourtyardWorldView at Start.
            // Open/closed visuals read the graph. The fixed authored geometry is
            // guarded by ValidateLayout so moving nodes alone cannot silently break it.
            EditorSceneManager.SaveScene(scene, CourtyardLayout.ScenePath);
            RegisterCatalogAndBuildScene();
            AssetDatabase.SaveAssets();
            Debug.Log("CourtyardSlice generated. Open the scene and press Play.");
        }

        [MenuItem("WSlice/Validate Courtyard Slice")]
        public static void Validate()
        {
            var definition = AssetDatabase.LoadAssetAtPath<LevelDefinition>(CourtyardLayout.DefinitionPath);
            if (definition == null) throw new InvalidOperationException("CourtyardLevel.asset is missing.");
            var validation = LevelDefinitionValidator.Validate(definition);
            if (!validation.IsValid) throw new InvalidOperationException(string.Join("\n", validation.Errors));
            ValidateLayout(definition);
            var graph = new LevelGraphRuntime(definition);
            if (!graph.CanMove(CourtyardLayout.Entry, CourtyardLayout.Courtyard, 0.30f)
                || !graph.CanMove(CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding, 0.80f))
                throw new InvalidOperationException("Courtyard teaching paths are not reachable at their authored slices.");
            for (int i = 0; i <= 1000; i++)
                if (graph.CanMove(CourtyardLayout.BridgeStart, CourtyardLayout.ExitLanding, i / 1000f))
                    throw new InvalidOperationException("Courtyard bridge is reachable before activation.");
            EditorSceneManager.OpenScene(CourtyardLayout.ScenePath, OpenSceneMode.Single);
            var puzzle = UnityEngine.Object.FindFirstObjectByType<CourtyardPuzzleController>();
            var world = UnityEngine.Object.FindFirstObjectByType<CourtyardWorldView>();
            var session = UnityEngine.Object.FindFirstObjectByType<LevelSessionController>();
            if (puzzle == null || world == null || session == null
                || UnityEngine.Object.FindFirstObjectByType<CourtyardExperienceView>() == null)
                throw new InvalidOperationException("Courtyard scene is missing its experience components.");
            if (new SerializedObject(session).FindProperty("completionCondition").objectReferenceValue != puzzle)
                throw new InvalidOperationException("Courtyard completion condition is not wired.");
            foreach (var field in new[] { "levelController", "session", "objectiveSource", "mutations", "world" })
                if (new SerializedObject(puzzle).FindProperty(field).objectReferenceValue == null)
                    throw new InvalidOperationException("Courtyard puzzle reference missing: " + field);
            foreach (var field in new[] { "stoneMaterial", "sliceMaterial", "accentMaterial", "goalMaterial" })
                if (new SerializedObject(world).FindProperty(field).objectReferenceValue == null)
                    throw new InvalidOperationException("Courtyard world material missing: " + field);
            if (UnityEngine.Object.FindFirstObjectByType<DebugOverlay>() != null
                || UnityEngine.Object.FindFirstObjectByType<LevelPathPreviewRenderer>() != null)
                throw new InvalidOperationException("Courtyard must not expose diagnostic overlays or graph lines.");
            Debug.Log("CourtyardSlice validation passed.");
        }

        private static void ValidateLayout(LevelDefinition definition)
        {
            var expected = ScriptableObject.CreateInstance<LevelDefinition>();
            try
            {
                CourtyardLayout.Populate(expected);
                if (definition.StartNodeId != expected.StartNodeId || definition.GoalNodeId != expected.GoalNodeId
                    || definition.Nodes.Count != expected.Nodes.Count || definition.Edges.Count != expected.Edges.Count)
                    throw new InvalidOperationException("Courtyard definition has drifted from its fixed world layout; regenerate it.");
                foreach (var node in expected.Nodes)
                {
                    var authored = definition.Nodes.FirstOrDefault(item => item.Id == node.Id);
                    if (authored == null || Vector3.Distance(authored.WorldPosition, node.WorldPosition) > 0.0001f)
                        throw new InvalidOperationException("Courtyard node would leave its physical surface: " + node.Id);
                }
                foreach (var edge in expected.Edges)
                {
                    var authored = definition.Edges.FirstOrDefault(item => item.FromNodeId == edge.FromNodeId && item.ToNodeId == edge.ToNodeId);
                    if (authored == null || !authored.WalkableRange.Equals(edge.WalkableRange)
                        || authored.IsLocked != edge.IsLocked || authored.Bidirectional != edge.Bidirectional)
                        throw new InvalidOperationException("Courtyard route does not match its authored rule: " + edge.FromNodeId);
                }
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(expected);
            }
        }

        private static void RegisterCatalogAndBuildScene()
        {
            var catalog = AssetDatabase.LoadAssetAtPath<LevelCatalog>(LevelCatalogPaths.AssetPath);
            if (!catalog.Entries.Any(entry => entry.LevelId == CourtyardLayout.LevelId))
                catalog.Entries.Insert(0, new LevelCatalogEntry
                {
                    LevelId = CourtyardLayout.LevelId, DisplayName = "回响庭院",
                    SceneName = CourtyardLayout.SceneName, ThemeHint = "观察空间，让机关留下回响"
                });
            EditorUtility.SetDirty(catalog);
            if (!EditorBuildSettings.scenes.Any(entry => entry.path == CourtyardLayout.ScenePath))
                EditorBuildSettings.scenes = EditorBuildSettings.scenes.Concat(new[] { new EditorBuildSettingsScene(CourtyardLayout.ScenePath, true) }).ToArray();
        }

        private static SliceProfile LoadProfile(string name) => AssetDatabase.LoadAssetAtPath<SliceProfile>($"{GrayboxLevelRecipe.ProfileDirectory}/{name}.asset");
        private static Material Material(string role) => AssetDatabase.LoadAssetAtPath<Material>($"{GrayboxVisualAssets.MaterialDirectory}/Graybox_{role}.mat");

        private static void SetReference(UnityEngine.Object target, string field, UnityEngine.Object value)
        {
            var so = new SerializedObject(target);
            so.FindProperty(field).objectReferenceValue = value;
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetBool(UnityEngine.Object target, string field, bool value)
        {
            var so = new SerializedObject(target);
            so.FindProperty(field).boolValue = value;
            so.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
