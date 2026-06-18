using System;
using UnityEditor;
using UnityEngine;
using WSlice.Core;
using WSlice.Entities;

namespace WSlice.Editor
{
    public static class GardenProfileFactory
    {
        public static GardenProfiles EnsureGardenProfiles()
        {
            return new GardenProfiles(
                CreateOrLoadProfile("WallProfile", ConfigureWall),
                CreateOrLoadProfile("GapProfile", ConfigureGap),
                CreateOrLoadProfile("StairProfile", ConfigureStair));
        }

        public static int ValidateGardenProfiles()
        {
            int errors = 0;
            var wallProfile = AssetDatabase.LoadAssetAtPath<SliceProfile>($"{GardenGrayboxRecipe.ProfileDirectory}/WallProfile.asset");
            var gapProfile = AssetDatabase.LoadAssetAtPath<SliceProfile>($"{GardenGrayboxRecipe.ProfileDirectory}/GapProfile.asset");
            var stairProfile = AssetDatabase.LoadAssetAtPath<SliceProfile>($"{GardenGrayboxRecipe.ProfileDirectory}/StairProfile.asset");

            if (wallProfile == null) { Debug.LogError("WallProfile.asset missing"); errors++; }
            else if (!GardenEditorUtilities.IsConstant(wallProfile.VisibilityCurve, 1f))
            {
                Debug.LogError("WallProfile.VisibilityCurve should be constant 1");
                errors++;
            }

            if (gapProfile == null) { Debug.LogError("GapProfile.asset missing"); errors++; }
            else if (gapProfile.VisibilityCurve.length < 3)
            {
                Debug.LogError($"GapProfile.VisibilityCurve has {gapProfile.VisibilityCurve.length} keys, expected 5");
                errors++;
            }

            if (stairProfile == null) { Debug.LogError("StairProfile.asset missing"); errors++; }
            else if (stairProfile.SolidRange.Min < 0.7f || stairProfile.SolidRange.Max > 0.95f)
            {
                Debug.LogError($"StairProfile.SolidRange {stairProfile.SolidRange.Min}-{stairProfile.SolidRange.Max} unexpected");
                errors++;
            }

            return errors;
        }

        private static SliceProfile CreateOrLoadProfile(string assetName, Action<SliceProfile> configure)
        {
            string dir = GardenGrayboxRecipe.ProfileDirectory;
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

        private static void ConfigureWall(SliceProfile profile)
        {
            profile.VisibilityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            profile.SolidityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            profile.GlowCurve = AnimationCurve.Constant(0f, 1f, 0f);
            profile.PositionOffsetAtW0 = Vector3.zero;
            profile.PositionOffsetAtW1 = Vector3.zero;
            profile.SolidRange = new WRange { Min = 0f, Max = 1f };
            profile.InteractiveRange = new WRange { Min = 0f, Max = 1f };
        }

        private static void ConfigureGap(SliceProfile profile)
        {
            profile.VisibilityCurve = new AnimationCurve(
                new Keyframe(0f, 0f),
                new Keyframe(0.35f, 0.3f),
                new Keyframe(0.55f, 1f),
                new Keyframe(0.70f, 0.3f),
                new Keyframe(1f, 0f));
            profile.SolidityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            profile.GlowCurve = new AnimationCurve(
                new Keyframe(0f, 0f),
                new Keyframe(0.35f, 0.5f),
                new Keyframe(0.55f, 1f),
                new Keyframe(0.70f, 0.5f),
                new Keyframe(1f, 0f));
            profile.PositionOffsetAtW0 = Vector3.zero;
            profile.PositionOffsetAtW1 = Vector3.zero;
            profile.SolidRange = new WRange { Min = 0.50f, Max = 0.70f };
            profile.InteractiveRange = new WRange { Min = 0.50f, Max = 0.70f };
        }

        private static void ConfigureStair(SliceProfile profile)
        {
            profile.VisibilityCurve = new AnimationCurve(
                new Keyframe(0f, 0f),
                new Keyframe(0.70f, 0f),
                new Keyframe(0.80f, 1f),
                new Keyframe(0.90f, 1f),
                new Keyframe(1f, 0f));
            profile.SolidityCurve = AnimationCurve.Constant(0f, 1f, 1f);
            profile.GlowCurve = AnimationCurve.Constant(0f, 1f, 0f);
            profile.PositionOffsetAtW0 = Vector3.zero;
            profile.PositionOffsetAtW1 = Vector3.zero;
            profile.SolidRange = new WRange { Min = 0.75f, Max = 0.90f };
            profile.InteractiveRange = new WRange { Min = 0.75f, Max = 0.90f };
        }
    }

    public readonly struct GardenProfiles
    {
        public SliceProfile Wall { get; }
        public SliceProfile Gap { get; }
        public SliceProfile Stair { get; }

        public GardenProfiles(SliceProfile wall, SliceProfile gap, SliceProfile stair)
        {
            Wall = wall;
            Gap = gap;
            Stair = stair;
        }
    }
}
