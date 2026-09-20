using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using WSlice.Level;

namespace WSlice.UI
{
    /// <summary>Promotes the courtyard slice while keeping the original five mechanism examples accessible.</summary>
    public sealed class CourtyardDemoEntryView : MonoBehaviour
    {
        [SerializeField] private LevelSelectView selectView;

        private Font chineseFont;
        private TMP_FontAsset chineseFontAsset;
        private GameObject featuredRoot;
        private GameObject examplesCaption;
        private Button featuredButton;

        private IEnumerator Start()
        {
            if (selectView == null)
                selectView = GetComponentInChildren<LevelSelectView>(true);
            if (selectView == null)
                selectView = FindFirstObjectByType<LevelSelectView>();
            if (selectView == null)
                yield break;

            var canvas = selectView.GetComponentInParent<Canvas>();
            if (canvas != null)
            {
                var scaler = canvas.GetComponent<CanvasScaler>();
                if (scaler == null)
                    scaler = canvas.gameObject.AddComponent<CanvasScaler>();
                scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                scaler.referenceResolution = new Vector2(1280f, 720f);
                scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
                scaler.matchWidthOrHeight = 0.5f;
            }

            chineseFont = CourtyardFontSupport.CreateFont();
            chineseFontAsset = CourtyardFontSupport.CreateTMPFontAsset(chineseFont);
            if (chineseFontAsset != null)
            {
                chineseFontAsset.name = "Courtyard Menu Chinese UI";
            }

            var subtitle = selectView.transform.Find("Subtitle")?.GetComponent<TextMeshProUGUI>();
            if (subtitle != null)
            {
                subtitle.text = "观察空间，切换切片，让机关留下回响。";
                if (chineseFontAsset != null)
                    subtitle.font = chineseFontAsset;
            }

            BuildFeaturedButton();
            var panel = selectView.transform.Find("Buttons") as RectTransform;
            if (panel == null)
                yield break;

            // A regenerated catalog can already contain a normal courtyard button.
            // The featured entry is the only visible entry for this level.
            var duplicate = panel.Find("LevelButton_" + CourtyardLayout.LevelId);
            if (duplicate != null)
                duplicate.gameObject.SetActive(false);

            panel.anchorMin = new Vector2(0.5f, 0.5f);
            panel.anchorMax = new Vector2(0.5f, 0.5f);
            panel.pivot = new Vector2(0.5f, 0.5f);
            panel.anchoredPosition = new Vector2(0f, -75f);
            panel.sizeDelta = new Vector2(872f, 176f);

            var previousLayout = panel.GetComponent<LayoutGroup>();
            if (previousLayout != null && previousLayout is not GridLayoutGroup)
            {
                previousLayout.enabled = false;
                Destroy(previousLayout);
                // LayoutGroup disallows multiple components, even if disabled.
                yield return null;
            }

            var grid = panel.GetComponent<GridLayoutGroup>();
            if (grid == null)
                grid = panel.gameObject.AddComponent<GridLayoutGroup>();
            grid.cellSize = new Vector2(280f, 80f);
            grid.spacing = new Vector2(16f, 16f);
            grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            grid.constraintCount = 3;
            grid.startCorner = GridLayoutGroup.Corner.UpperLeft;
            grid.startAxis = GridLayoutGroup.Axis.Horizontal;
            grid.childAlignment = TextAnchor.MiddleCenter;

            foreach (var label in panel.GetComponentsInChildren<TextMeshProUGUI>(true))
            {
                if (chineseFontAsset != null)
                    label.font = chineseFontAsset;
                label.enableAutoSizing = true;
                label.fontSizeMin = 14f;
                label.fontSizeMax = 22f;
            }
            LayoutRebuilder.ForceRebuildLayoutImmediate(panel);
        }

        private void BuildFeaturedButton()
        {
            var rect = CreateRect("CourtyardFeaturedEntry", selectView.transform, new Vector2(0f, 110f), new Vector2(460f, 68f));
            featuredRoot = rect.gameObject;
            var background = featuredRoot.AddComponent<Image>();
            background.color = new Color(0.75f, 0.54f, 0.24f, 1f);
            featuredButton = featuredRoot.AddComponent<Button>();
            featuredButton.targetGraphic = background;
            featuredButton.onClick.AddListener(OnFeaturedClicked);

            var label = CreateText("Label", rect, Vector2.zero, new Vector2(436f, 54f), 26);
            label.text = "开始：回响庭院";

            var caption = CreateText("ExamplesCaption", selectView.transform, new Vector2(0f, 44f), new Vector2(872f, 28f), 18);
            caption.text = "机制练习";
            caption.color = new Color(0.75f, 0.8f, 0.85f);
            examplesCaption = caption.gameObject;
        }

        private void OnFeaturedClicked()
        {
            if (selectView != null)
                selectView.LoadLevel(CourtyardLayout.LevelId);
        }

        private void OnDisable()
        {
            if (featuredButton != null)
                featuredButton.onClick.RemoveListener(OnFeaturedClicked);
        }

        private void OnEnable()
        {
            if (featuredButton != null)
            {
                featuredButton.onClick.RemoveListener(OnFeaturedClicked);
                featuredButton.onClick.AddListener(OnFeaturedClicked);
            }
        }

        private void OnDestroy()
        {
            if (featuredRoot != null)
                Destroy(featuredRoot);
            if (examplesCaption != null)
                Destroy(examplesCaption);
            if (chineseFontAsset != null)
            {
                if (chineseFontAsset.material != null)
                    Destroy(chineseFontAsset.material);
                foreach (var texture in chineseFontAsset.atlasTextures)
                {
                    if (texture != null)
                        Destroy(texture);
                }
                Destroy(chineseFontAsset);
            }
            if (chineseFont != null)
                Destroy(chineseFont);
        }

        private Text CreateText(string objectName, Transform parent, Vector2 position, Vector2 size, int fontSize)
        {
            var rect = CreateRect(objectName, parent, position, size);
            var label = rect.gameObject.AddComponent<Text>();
            label.font = chineseFont;
            label.fontSize = fontSize;
            label.alignment = TextAnchor.MiddleCenter;
            label.color = Color.white;
            label.raycastTarget = false;
            label.supportRichText = false;
            return label;
        }

        private static RectTransform CreateRect(string objectName, Transform parent, Vector2 position, Vector2 size)
        {
            var rect = new GameObject(objectName, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false);
            rect.anchorMin = new Vector2(0.5f, 0.5f);
            rect.anchorMax = new Vector2(0.5f, 0.5f);
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
            return rect;
        }
    }
}
