using UnityEngine;

namespace WSlice.Editor
{
    public static class GrayboxVisualPalette
    {
        public static readonly Color Sky = new(0.12f, 0.14f, 0.18f, 1f);
        public static readonly Color Ambient = new(0.28f, 0.30f, 0.34f, 1f);
        public static readonly Color Ground = new(0.22f, 0.24f, 0.27f, 1f);
        public static readonly Color Structure = new(0.42f, 0.45f, 0.50f, 1f);
        public static readonly Color Slice = new(0.55f, 0.62f, 0.72f, 1f);
        public static readonly Color Interactable = new(0.90f, 0.62f, 0.28f, 1f);
        public static readonly Color Goal = new(0.35f, 0.82f, 0.55f, 1f);
        public static readonly Color GoalEmission = new(0.20f, 0.55f, 0.35f, 1f);
        public static readonly Color Player = new(0.72f, 0.78f, 0.92f, 1f);
        public static readonly Color UiAccent = new(0.24f, 0.48f, 0.78f, 0.95f);
    }
}
