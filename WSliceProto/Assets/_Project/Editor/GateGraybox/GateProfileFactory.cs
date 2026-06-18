using System;
using UnityEditor;
using UnityEngine;
using WSlice.Core;
using WSlice.Entities;

namespace WSlice.Editor
{
    public static class GateProfileFactory
    {
        public static SliceProfile EnsureLeverProfile()
        {
            return CreateOrLoadProfile("GateLeverProfile", ConfigureLever);
        }

        private static SliceProfile CreateOrLoadProfile(string assetName, Action<SliceProfile> configure)
        {
            string dir = GateGrayboxRecipe.ProfileDirectory;
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

        private static void ConfigureLever(SliceProfile profile)
        {
            profile.VisibilityCurve = AnimationCurve.EaseInOut(0f, 0.2f, 1f, 1f);
            profile.SolidityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            profile.GlowCurve = new AnimationCurve(
                new Keyframe(0.45f, 0.8f),
                new Keyframe(0.55f, 1f),
                new Keyframe(0.65f, 0.8f));
            profile.SolidRange = new WRange { Min = 0.45f, Max = 0.65f };
            profile.InteractiveRange = new WRange { Min = 0.45f, Max = 0.65f };
        }
    }
}
