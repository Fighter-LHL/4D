using UnityEditor;
using UnityEngine;

namespace WSlice.Editor
{
    public enum GrayboxMaterialRole
    {
        Ground,
        Structure,
        Slice,
        Interactable,
        Goal,
        Player
    }

    public static class GrayboxVisualAssets
    {
        public const string MaterialDirectory = "Assets/_Project/Rendering/Materials/Graybox";

        public static Material GetMaterial(GrayboxMaterialRole role)
        {
            EnsureMaterials();
            string path = GetMaterialPath(role);
            return AssetDatabase.LoadAssetAtPath<Material>(path);
        }

        public static void EnsureMaterials()
        {
            if (!AssetDatabase.IsValidFolder("Assets/_Project/Rendering"))
                AssetDatabase.CreateFolder("Assets/_Project", "Rendering");

            if (!AssetDatabase.IsValidFolder("Assets/_Project/Rendering/Materials"))
                AssetDatabase.CreateFolder("Assets/_Project/Rendering", "Materials");

            if (!AssetDatabase.IsValidFolder(MaterialDirectory))
                AssetDatabase.CreateFolder("Assets/_Project/Rendering/Materials", "Graybox");

            CreateOrUpdate(GrayboxMaterialRole.Ground, GrayboxVisualPalette.Ground, emission: false);
            CreateOrUpdate(GrayboxMaterialRole.Structure, GrayboxVisualPalette.Structure, emission: false);
            CreateOrUpdate(GrayboxMaterialRole.Slice, GrayboxVisualPalette.Slice, emission: false);
            CreateOrUpdate(GrayboxMaterialRole.Interactable, GrayboxVisualPalette.Interactable, emission: false);
            CreateOrUpdate(GrayboxMaterialRole.Goal, GrayboxVisualPalette.Goal, emission: true, GrayboxVisualPalette.GoalEmission);
            CreateOrUpdate(GrayboxMaterialRole.Player, GrayboxVisualPalette.Player, emission: false);
        }

        private static void CreateOrUpdate(
            GrayboxMaterialRole role,
            Color baseColor,
            bool emission,
            Color emissionColor = default)
        {
            string path = GetMaterialPath(role);
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
            {
                Debug.LogWarning("URP Lit shader not found; graybox materials were not created.");
                return;
            }

            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(shader);
                AssetDatabase.CreateAsset(material, path);
            }

            material.shader = shader;
            material.SetColor("_BaseColor", baseColor);

            if (emission)
            {
                material.EnableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", emissionColor);
                material.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            }
            else
            {
                material.DisableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", Color.black);
            }

            EditorUtility.SetDirty(material);
            AssetDatabase.SaveAssetIfDirty(material);
        }

        private static string GetMaterialPath(GrayboxMaterialRole role)
        {
            return $"{MaterialDirectory}/Graybox_{role}.mat";
        }
    }
}
