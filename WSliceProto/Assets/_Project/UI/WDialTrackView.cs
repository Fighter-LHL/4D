using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.UI
{
    public sealed class WDialTrackView : MonoBehaviour
    {
        [SerializeField] private RectTransform trackRoot;
        [SerializeField] private LevelRuntimeController level;
        [SerializeField] private MovementController movement;
        [SerializeField] private PlayerInputRouter inputRouter;
        [SerializeField] private PlayerCharacter character;

        [SerializeField] private Color snapTickColor = Color.white;
        [SerializeField] private Color currentMarkerColor = new Color(0.2f, 0.9f, 1f, 1f);
        [SerializeField] private Color targetMarkerColor = new Color(1f, 0.95f, 0.2f, 1f);
        [SerializeField] private Color availableBandColor = new Color(0.2f, 1f, 0.4f, 0.55f);
        [SerializeField] private Color targetBandColor = new Color(1f, 0.95f, 0.2f, 0.4f);
        [SerializeField] private Color unavailableBandColor = new Color(1f, 1f, 1f, 0.18f);
        [SerializeField] private Color dangerColor = new Color(1f, 0.25f, 0.2f, 0.9f);

        private readonly List<Image> snapTicks = new();
        private readonly List<Image> edgeBands = new();
        private Image currentMarker;
        private Image targetMarker;

        public WDialTrackState LastState { get; private set; } =
            new WDialTrackState(0f, 0f, new List<float>().AsReadOnly(), new List<WDialEdgeBand>().AsReadOnly(), false);

        private void Start()
        {
            ResolveReferences();
            EnsureMarkers();
        }

        private void Update()
        {
            ResolveReferences();

            HUDState hud = WDialModel.Build(level, movement, inputRouter, character);
            LastState = WDialTrackModel.Build(hud);
            Render(LastState);
        }

        private void ResolveReferences()
        {
            if (trackRoot == null)
                trackRoot = GetComponent<RectTransform>();

            if (level == null)
                level = FindFirstObjectByType<LevelRuntimeController>();

            if (movement == null)
                movement = FindFirstObjectByType<MovementController>();

            if (inputRouter == null)
                inputRouter = FindFirstObjectByType<PlayerInputRouter>();

            if (character == null)
                character = FindFirstObjectByType<PlayerCharacter>();
        }

        private void Render(WDialTrackState state)
        {
            if (trackRoot == null || state == null) return;

            EnsureVisualCount(snapTicks, state.SnapTicks.Count, "SnapTick");
            EnsureVisualCount(edgeBands, state.EdgeBands.Count, "EdgeBand");
            EnsureMarkers();

            float width = GetTrackWidth();
            for (int i = 0; i < state.SnapTicks.Count; i++)
            {
                var image = snapTicks[i];
                image.color = snapTickColor;
                SetTickRect(image.rectTransform, state.SnapTicks[i], width);
            }

            for (int i = 0; i < state.EdgeBands.Count; i++)
            {
                var band = state.EdgeBands[i];
                var image = edgeBands[i];
                image.color = BandColor(band, state.HasBreakRisk);
                SetBandRect(image.rectTransform, band.MinW, band.MaxW, width);
            }

            currentMarker.color = currentMarkerColor;
            targetMarker.color = state.HasBreakRisk ? dangerColor : targetMarkerColor;
            SetMarkerRect(currentMarker.rectTransform, state.CurrentW, width, 26f);
            SetMarkerRect(targetMarker.rectTransform, state.TargetW, width, 18f);
        }

        private Color BandColor(WDialEdgeBand band, bool hasBreakRisk)
        {
            if (hasBreakRisk && band.AvailableAtCurrentW && !band.AvailableAtTargetW)
                return dangerColor;

            if (band.AvailableAtCurrentW)
                return availableBandColor;

            if (band.AvailableAtTargetW)
                return targetBandColor;

            return unavailableBandColor;
        }

        private void EnsureMarkers()
        {
            if (trackRoot == null) return;

            if (currentMarker == null)
                currentMarker = CreateImage("CurrentMarker");

            if (targetMarker == null)
                targetMarker = CreateImage("TargetMarker");
        }

        private void EnsureVisualCount(List<Image> images, int count, string prefix)
        {
            while (images.Count < count)
                images.Add(CreateImage($"{prefix}_{images.Count}"));

            for (int i = 0; i < images.Count; i++)
                images[i].gameObject.SetActive(i < count);
        }

        private Image CreateImage(string objectName)
        {
            var go = new GameObject(objectName, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(trackRoot, false);
            var image = go.GetComponent<Image>();
            image.raycastTarget = false;
            return image;
        }

        private float GetTrackWidth()
        {
            float width = trackRoot.rect.width;
            if (width <= 0f)
                width = trackRoot.sizeDelta.x;

            return width > 0f ? width : 300f;
        }

        private static void SetTickRect(RectTransform rect, float w, float width)
        {
            float x = Mathf.Clamp01(w) * width;
            rect.anchorMin = new Vector2(0f, 0.5f);
            rect.anchorMax = new Vector2(0f, 0.5f);
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.anchoredPosition = new Vector2(x, 0f);
            rect.sizeDelta = new Vector2(2f, 16f);
        }

        private static void SetMarkerRect(RectTransform rect, float w, float width, float height)
        {
            float x = Mathf.Clamp01(w) * width;
            rect.anchorMin = new Vector2(0f, 0.5f);
            rect.anchorMax = new Vector2(0f, 0.5f);
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.anchoredPosition = new Vector2(x, 0f);
            rect.sizeDelta = new Vector2(4f, height);
        }

        private static void SetBandRect(RectTransform rect, float minW, float maxW, float width)
        {
            float min = Mathf.Clamp01(Mathf.Min(minW, maxW));
            float max = Mathf.Clamp01(Mathf.Max(minW, maxW));
            float x = min * width;
            float bandWidth = Mathf.Max(2f, (max - min) * width);
            rect.anchorMin = new Vector2(0f, 0.5f);
            rect.anchorMax = new Vector2(0f, 0.5f);
            rect.pivot = new Vector2(0f, 0.5f);
            rect.anchoredPosition = new Vector2(x, -12f);
            rect.sizeDelta = new Vector2(bandWidth, 6f);
        }
    }
}
