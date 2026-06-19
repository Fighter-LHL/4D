using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace WSlice.Editor
{
    public static class GrayboxVisualApplier
    {
        [MenuItem("WSlice/Apply Graybox Visual Style")]
        public static void StylizeActiveSceneMenu()
        {
            StylizeActiveScene();
            UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(
                UnityEngine.SceneManagement.SceneManager.GetActiveScene());
            Debug.Log("Graybox visual style applied to active scene.");
        }

        public static void StylizeActiveScene()
        {
            GrayboxVisualAssets.EnsureMaterials();

            ApplyRole(GameObject.Find("Ground"), GrayboxMaterialRole.Ground);
            ApplyRole(GameObject.Find("Player"), GrayboxMaterialRole.Player);

            ApplyNamedRoles(
                GrayboxMaterialRole.Goal,
                "GoalMarker",
                "Flower");

            ApplyNamedRoles(
                GrayboxMaterialRole.Structure,
                "GardenWall_A",
                "WestPillar",
                "EastPillar",
                "GateFrame",
                "EntryMarker");

            ApplyNamedRoles(
                GrayboxMaterialRole.Slice,
                "GardenWall_GapSegment",
                "OffsetBridge");

            ApplyNamedRoles(
                GrayboxMaterialRole.Interactable,
                "GateLever");

            var stairParent = GameObject.Find("HiddenStair");
            if (stairParent != null)
            {
                foreach (Transform child in stairParent.transform)
                    ApplyRole(child.gameObject, GrayboxMaterialRole.Slice);
            }

            StylizeEnvironment();
            StylizeLevelSelectUi();
        }

        private static void ApplyNamedRoles(GrayboxMaterialRole role, params string[] objectNames)
        {
            foreach (string name in objectNames)
                ApplyRole(GameObject.Find(name), role);
        }

        private static void StylizeEnvironment()
        {
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = GrayboxVisualPalette.Ambient;

            var camera = Camera.main ?? Object.FindFirstObjectByType<Camera>();
            if (camera != null)
            {
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = GrayboxVisualPalette.Sky;
            }

            var light = Object.FindFirstObjectByType<Light>();
            if (light != null && light.type == LightType.Directional)
            {
                light.color = new Color(1f, 0.97f, 0.92f, 1f);
                light.intensity = 1.05f;
                light.transform.rotation = Quaternion.Euler(48f, -28f, 0f);
            }
        }

        private static void StylizeLevelSelectUi()
        {
            var title = GameObject.Find("Title");
            if (title != null && title.TryGetComponent<TextMeshProUGUI>(out var titleText))
                titleText.color = new Color(0.92f, 0.94f, 0.98f, 1f);

            var subtitle = GameObject.Find("Subtitle");
            if (subtitle != null && subtitle.TryGetComponent<TextMeshProUGUI>(out var subtitleText))
                subtitleText.color = new Color(0.78f, 0.84f, 0.92f, 1f);

            var version = GameObject.Find("VersionLabel");
            if (version != null && version.TryGetComponent<TextMeshProUGUI>(out var versionText))
                versionText.color = new Color(0.65f, 0.72f, 0.82f, 1f);

            foreach (var button in Object.FindObjectsByType<Button>(FindObjectsSortMode.None))
            {
                if (button.name.StartsWith("LevelButton_"))
                {
                    if (button.TryGetComponent<Image>(out var image))
                        image.color = GrayboxVisualPalette.UiAccent;
                    continue;
                }

                if (button.name == "QuitButton" && button.TryGetComponent<Image>(out var quitImage))
                    quitImage.color = new Color(0.18f, 0.2f, 0.24f, 0.95f);
            }
        }

        private static void ApplyRole(GameObject target, GrayboxMaterialRole role)
        {
            if (target == null)
                return;

            var material = GrayboxVisualAssets.GetMaterial(role);
            if (material == null)
                return;

            var renderer = target.GetComponent<Renderer>();
            if (renderer != null)
                renderer.sharedMaterial = material;
        }
    }
}
