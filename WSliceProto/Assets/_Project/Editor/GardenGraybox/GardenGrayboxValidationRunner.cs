using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using WSlice.Entities;
using WSlice.Level;
using WSlice.Player;
using WSlice.UI;

namespace WSlice.Editor
{
    public static class GardenGrayboxValidationRunner
    {
        public static void Validate()
        {
            int errors = GardenProfileFactory.ValidateGardenProfiles();
            int warnings = 0;

            EditorSceneManager.OpenScene(GardenGrayboxRecipe.ScenePath, OpenSceneMode.Single);

            errors += RequireObject("Main Camera", typeof(Camera));
            errors += RequireObject("Directional Light", typeof(Light));
            errors += RequireObject("Ground", typeof(MeshCollider));
            errors += RequireObject("Player", typeof(PlayerCharacter), typeof(MovementController), typeof(LevelPlayerReset));
            errors += RequireObject("GardenWall_A", typeof(SliceEntity));
            errors += RequireObject("GardenWall_B", typeof(MeshRenderer), typeof(BoxCollider));
            errors += RequireObject("GardenWall_GapSegment", typeof(GraphPassageBarrier));
            errors += RequireObject("HiddenStair", null);
            errors += RequireObject("Stair_1", typeof(SliceEntity), typeof(BoxCollider));
            errors += RequireObject("FlowerLanding", typeof(BoxCollider));
            errors += RequireObject("Flower", typeof(BoxCollider));
            errors += RequireObject("Nodes", null);
            errors += RequireObject("LevelRuntime", typeof(LevelRuntimeController), typeof(LevelSessionController));
            errors += RequireObject("PathPreview", typeof(LevelPathPreviewRenderer));
            errors += RequireObject("PlayerInput", typeof(PlayerInputRouter), typeof(TapMoveInput), typeof(LevelRestartInput));
            errors += RequireObject("Canvas", typeof(Canvas));
            errors += RequireObject("WDialSlider", typeof(Slider), typeof(WDialView));
            errors += RequireObject("WDialTrack", typeof(RectTransform), typeof(WDialTrackView));
            errors += RequireObject("PlayerHUDText", typeof(TextMeshProUGUI), typeof(PlayerHUDView));
            errors += RequireObject("DebugText", typeof(TextMeshProUGUI), typeof(DebugOverlay));

            var levelRuntime = GameObject.Find("LevelRuntime")?.GetComponent<LevelRuntimeController>();
            if (levelRuntime == null || levelRuntime.Definition == null)
            {
                Debug.LogError("LevelRuntimeController or its Definition is not assigned");
                errors++;
            }
            else
            {
                var validation = LevelDefinitionValidator.Validate(levelRuntime.Definition);
                foreach (string error in validation.Errors)
                {
                    Debug.LogError(error);
                    errors++;
                }

                foreach (string warning in validation.Warnings)
                {
                    Debug.LogWarning(warning);
                    warnings++;
                }

                errors += LevelNodeMirrorSync.ValidateSceneNodeMirrors(levelRuntime.Definition);
            }

            var playerInput = GameObject.Find("PlayerInput")?.GetComponent<PlayerInputRouter>();
            if (playerInput != null)
            {
                var so = new SerializedObject(playerInput);
                if (so.FindProperty("gameCamera").objectReferenceValue == null)
                {
                    Debug.LogWarning("PlayerInputRouter.gameCamera is null");
                    warnings++;
                }

                if (so.FindProperty("movement").objectReferenceValue == null)
                {
                    Debug.LogWarning("PlayerInputRouter.movement is null");
                    warnings++;
                }
            }

            var wallA = GameObject.Find("GardenWall_A")?.GetComponent<SliceEntity>();
            if (wallA != null && wallA.profile == null)
            {
                Debug.LogError("GardenWall_A SliceEntity.profile is null");
                errors++;
            }

            var gap = GameObject.Find("GardenWall_GapSegment")?.GetComponent<GraphPassageBarrier>();
            if (gap != null)
            {
                var binding = new SerializedObject(gap);
                if (binding.FindProperty("levelController").objectReferenceValue != levelRuntime
                    || binding.FindProperty("fromNodeId").stringValue != "Outside"
                    || binding.FindProperty("toNodeId").stringValue != "Gap")
                {
                    Debug.LogError("Garden entrance barrier must reference the Outside-to-Gap graph edge.");
                    errors++;
                }
            }

            if (errors == 0 && warnings == 0)
                Debug.Log("GardenGraybox validation passed.");
            else
                Debug.LogWarning($"GardenGraybox validation finished with {errors} error(s) and {warnings} warning(s).");
        }

        private static int RequireObject(string name, params Type[] expectedComponents)
        {
            var go = GameObject.Find(name);
            if (go == null)
            {
                Debug.LogError($"Required object '{name}' not found in scene");
                return 1;
            }

            if (expectedComponents == null) return 0;

            foreach (var type in expectedComponents)
            {
                if (type != null && !go.TryGetComponent(type, out _))
                {
                    Debug.LogError($"Object '{name}' is missing component {type.Name}");
                    return 1;
                }
            }

            return 0;
        }
    }
}
