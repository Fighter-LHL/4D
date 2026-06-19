using System;
using UnityEditor;
using UnityEngine;
using WSlice.Core;
using WSlice.Entities;

namespace WSlice.Editor
{
    public static class HazardProfileFactory
    {
        public static SliceProfile EnsureHazardPlatformProfile()
        {
            return CreateOrLoadProfile("HazardPlatformProfile", ConfigureHazardPlatform);
        }

        private static SliceProfile CreateOrLoadProfile(string assetName, Action<SliceProfile> configure)
        {
            string dir = GrayboxLevelRecipe.ProfileDirectory;
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

        private static void ConfigureHazardPlatform(SliceProfile profile)
        {
            profile.VisibilityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            profile.SolidityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            profile.GlowCurve = new AnimationCurve(
                new Keyframe(0.45f, 0.6f),
                new Keyframe(0.55f, 1f),
                new Keyframe(0.65f, 0.6f));
            profile.PositionOffsetAtW0 = new Vector3(0f, -2f, 0f);
            profile.PositionOffsetAtW1 = Vector3.zero;
            profile.SolidRange = new WRange { Min = 0.45f, Max = 0.65f };
            profile.InteractiveRange = new WRange { Min = 0.45f, Max = 0.65f };
        }
    }
}
