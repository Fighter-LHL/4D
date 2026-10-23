using UnityEngine;
using UnityEngine.UI;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.UI
{
    /// <summary>Connects actual traversal outcomes to the optional edge-charge challenge.</summary>
    public sealed class CourtyardResonanceController : MonoBehaviour, ILevelRestartHandler
    {
        private static readonly Color Safe = new(0.25f, 0.88f, 0.85f);
        private static readonly Color Gold = new(1f, 0.72f, 0.22f);
        private static readonly Color Danger = new(1f, 0.29f, 0.16f);
        public CourtyardResonanceModel Model { get; } = new();
        private CourtyardPuzzleController puzzle;
        private MovementController movement;
        private PlayerCharacter player;
        private LevelRuntimeController level;
        private LevelSessionController session;
        private PlayerInputRouter router;
        private CourtyardWorldView world;
        private CourtyardResonanceView feedback;
        private bool subscribed, activated, completed;
        private bool entranceOpen, stairOpen, bridgeOpen;
        private int actionVersion;
        private float lastRejectedAt = -10f;
        private GameObject hud;
        private Font font;
        private readonly Image[] tokens = new Image[18];
        private Image stabilityFill, chargeFill;
        private RectTransform dialCursor;
        private Text caption;
        private Text riskLegend;
        private Button soundButton;
        private bool muted;

        public void Bind(CourtyardPuzzleController controller)
        {
            if (puzzle != null || controller == null) return;
            puzzle = controller;
            movement = FindFirstObjectByType<MovementController>();
            player = FindFirstObjectByType<PlayerCharacter>();
            level = FindFirstObjectByType<LevelRuntimeController>();
            session = FindFirstObjectByType<LevelSessionController>();
            router = FindFirstObjectByType<PlayerInputRouter>();
            world = FindFirstObjectByType<CourtyardWorldView>();
            if (movement == null || player == null || level == null || session == null) return;
            feedback = gameObject.AddComponent<CourtyardResonanceView>();
            feedback.Bind(player.transform, world);
            BuildHUD();
            activated = puzzle.IsActivated;
            actionVersion = router != null ? router.ActionVersion : 0;
            Subscribe();
        }

        private void OnEnable()
        {
            Subscribe();
            if (feedback != null) feedback.enabled = true;
            if (hud != null) hud.SetActive(true);
        }

        private void Subscribe()
        {
            if (subscribed || movement == null || session == null) return;
            movement.SegmentStarted += OnSegmentStarted;
            movement.SegmentCompleted += OnSegmentCompleted;
            movement.SegmentBroken += OnSegmentBroken;
            session.StateChanged += OnSessionChanged;
            subscribed = true;
        }

        private void OnDisable()
        {
            if (subscribed)
            {
                movement.SegmentStarted -= OnSegmentStarted;
                movement.SegmentCompleted -= OnSegmentCompleted;
                movement.SegmentBroken -= OnSegmentBroken;
                session.StateChanged -= OnSessionChanged;
                subscribed = false;
            }
            if (feedback != null) feedback.enabled = false;
            if (hud != null) hud.SetActive(false);
            if (bandRoot != null) bandRoot.SetActive(false);
            if (riskLegend != null) riskLegend.gameObject.SetActive(false);
        }

        private void Update()
        {
            if (puzzle == null || feedback == null) return;
            if (session.State == LevelSessionState.Playing)
            {
                if (Model.IsCrossing && Model.Tick(Time.deltaTime, puzzle.CurrentW))
                    movement.TryRecoverActiveSegment();
                if (!activated && puzzle.IsActivated)
                {
                    activated = true;
                    StoreEchoes();
                    feedback.Pulse(NodePosition(CourtyardLayout.BridgeStart), Gold, 3);
                }
                ObserveRoutes();
                ObserveRejectedInput();
            }
            feedback.Render(Model.Carried, Model.Banked, Model.Stability, Model.Charge01,
                Model.IsCrossing, Model.IsDangerous, Model.IsCharged);
            RenderHUD();
        }

        private void OnSegmentStarted(string from, string to)
        {
            if (session.State == LevelSessionState.Playing) Model.BeginCrossing(from, to);
        }

        private void OnSegmentCompleted(string from, string to)
        {
            int gained = Model.IsCrossing && Model.ActiveFrom == from && Model.ActiveTo == to
                ? Model.CompleteCrossing() : 0;
            feedback.Pulse(player.transform.position, gained > 1 ? Gold : Safe, gained > 1 ? 3 : 1);
            if (to == CourtyardLayout.Mechanism && puzzle.IsActivated) StoreEchoes();
        }

        private void OnSegmentBroken(Vector3 position, string from)
        {
            int lost = Model.FailCrossing();
            feedback.Shatter(position, lost);
            feedback.Pulse(NodePosition(from), Danger, 1);
        }

        private void StoreEchoes()
        {
            int amount = Model.Bank();
            feedback.Bank(player.transform.position, amount);
        }

        private void OnSessionChanged(LevelSessionState state)
        {
            if (state != LevelSessionState.Completed || completed) return;
            completed = true;
            StoreEchoes();
            feedback.Celebrate(NodePosition(CourtyardLayout.Goal), Model.Banked);
            // Keep earned gems visible above the result backdrop as a replay target.
            if (hud != null) hud.transform.SetAsLastSibling();
        }

        private void ObserveRoutes()
        {
            if (world == null) return;
            RoutePulse(world.EntranceOpen, ref entranceOpen, CourtyardLayout.Courtyard);
            RoutePulse(world.StairOpen, ref stairOpen, CourtyardLayout.UpperLanding);
            RoutePulse(world.BridgeOpen, ref bridgeOpen, CourtyardLayout.ExitLanding);
        }

        private void RoutePulse(bool open, ref bool previous, string target)
        {
            if (open && !previous) feedback.Pulse(NodePosition(target), Safe, 1);
            previous = open;
        }

        private void ObserveRejectedInput()
        {
            if (router == null || router.ActionVersion == actionVersion) return;
            actionVersion = router.ActionVersion;
            if (router.LastActionResult.Succeeded || Time.unscaledTime - lastRejectedAt < 0.25f) return;
            lastRejectedAt = Time.unscaledTime;
            feedback.Pulse(NodePosition(movement.HintTargetNodeId ?? player.CurrentNodeId), Danger, 1);
        }

        private Vector3 NodePosition(string id) => !string.IsNullOrEmpty(id)
            ? level.Graph.GetNode(id)?.WorldPosition ?? player.transform.position : player.transform.position;

        public void ApplyLevelRestart(LevelDefinition definition, LevelGraphRuntime graph)
        {
            Model.Reset();
            activated = completed = entranceOpen = stairOpen = bridgeOpen = false;
            if (hud != null) hud.transform.SetAsFirstSibling();
            actionVersion = router != null ? router.ActionVersion : 0;
            if (feedback != null) feedback.ResetFeedback();
            RenderHUD();
        }

        private void BuildHUD()
        {
            var canvas = GetComponentInParent<Canvas>();
            if (canvas == null) return;
            font = CourtyardFontSupport.CreateFont();
            hud = Rect("ResonanceHUD", canvas.transform, new Vector2(1f, 1f), new Vector2(-325, -151), new Vector2(600, 40)).gameObject;
            // Under the modal outcome overlay; all decorative images pass clicks through.
            hud.transform.SetAsFirstSibling();
            var background = hud.AddComponent<Image>();
            background.color = new Color(0.04f, 0.07f, 0.1f, 0.85f);
            background.raycastTarget = false;
            Label("RewardLabel", hud.transform, new Vector2(-258, 0), new Vector2(76, 30), "回响", 18);
            for (int i = 0; i < tokens.Length; i++)
            {
                tokens[i] = Box("Echo_" + i, hud.transform, new Vector2(-190 + i * 14, 0), new Vector2(8, 8), Color.gray);
                tokens[i].transform.localRotation = Quaternion.Euler(0, 0, 45);
            }
            caption = Label("Score", hud.transform, new Vector2(158, 0), new Vector2(190, 30), "", 16);
            var sound = Box("SoundToggle", hud.transform, new Vector2(278, 0), new Vector2(36, 30), new Color(0.18f, 0.24f, 0.29f));
            sound.raycastTarget = true;
            soundButton = sound.gameObject.AddComponent<Button>();
            soundButton.targetGraphic = sound;
            var soundText = Label("Label", sound.transform, Vector2.zero, new Vector2(36, 30), "音", 16);
            soundButton.onClick.AddListener(() =>
            {
                muted = !muted;
                feedback.SetMuted(muted);
                soundText.text = muted ? "静" : "音";
            });

            var slider = GetComponentInParent<Canvas>().GetComponentInChildren<WDialView>();
            if (slider == null) return;
            // Inset matches the slider's handle travel (4px padding at either end).
            var sliderRect = (RectTransform)slider.transform;
            var track = Rect("ResonanceBands", hud.transform, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            track.SetParent(sliderRect, false);
            track.anchorMin = new Vector2(0, 1); track.anchorMax = new Vector2(1, 1);
            track.offsetMin = new Vector2(4, 8); track.offsetMax = new Vector2(-4, 19);
            // This child stays with the dial; retain it for explicit cleanup.
            bandRoot = track.gameObject;
            Band(track, 0.2f, 0.4f); Band(track, 0.7f, 0.9f); Band(track, 0.45f, 0.6f);
            dialCursor = Rect("ActualSlice", track, new Vector2(0, 0.5f), Vector2.zero, new Vector2(3, 17));
            var cursorImage = dialCursor.gameObject.AddComponent<Image>(); cursorImage.raycastTarget = false;
            var meter = Rect("StabilityMeter", hud.transform, new Vector2(0.5f, 0.5f), new Vector2(0, -37), new Vector2(230, 7));
            Box("Back", meter, Vector2.zero, new Vector2(230, 7), new Color(0.15f, 0.19f, 0.22f));
            stabilityFill = Box("Stability", meter, Vector2.zero, new Vector2(230, 7), Safe);
            chargeFill = Box("Charge", meter, new Vector2(0, -10), new Vector2(230, 3), Gold);
            foreach (var image in new[] { stabilityFill, chargeFill })
            {
                var rect = (RectTransform)image.transform;
                rect.pivot = new Vector2(0, 0.5f); rect.anchoredPosition += Vector2.left * 115;
            }
            riskLegend = Label("RiskLegend", hud.transform, new Vector2(0, -64), new Vector2(800, 26),
                "青色稳行 · 橙色蓄能 ×3 → 回到青色稳住   |   断路丢失随身回响，机关存入", 16);
            riskLegend.color = new Color(0.8f, 0.85f, 0.88f);
            riskLegend.transform.SetParent(canvas.transform, false);
            riskLegend.rectTransform.anchorMin = riskLegend.rectTransform.anchorMax = new Vector2(0.5f, 0);
            riskLegend.rectTransform.anchoredPosition = new Vector2(0, 157);
            riskLegend.transform.SetAsFirstSibling();
        }

        private GameObject bandRoot;
        private void RenderHUD()
        {
            if (hud == null) return;
            bool visible = isActiveAndEnabled;
            hud.SetActive(visible);
            if (bandRoot != null) bandRoot.SetActive(visible && !completed);
            if (riskLegend != null) riskLegend.gameObject.SetActive(!completed);
            soundButton.gameObject.SetActive(!completed);
            for (int i = 0; i < tokens.Length; i++)
                tokens[i].color = i < Model.Banked ? Safe : i < Model.Banked + Model.Carried ? Gold : new Color(0.22f, 0.27f, 0.31f);
            caption.text = $"随身 {Model.Carried}  /  已存 {Model.Banked}";
            if (stabilityFill != null)
            {
                stabilityFill.rectTransform.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, 230 * Model.Stability);
                stabilityFill.color = Model.IsDangerous ? Danger : Safe;
                chargeFill.rectTransform.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, 230 * Model.Charge01);
                stabilityFill.transform.parent.gameObject.SetActive(Model.IsCrossing);
                dialCursor.anchorMin = dialCursor.anchorMax = new Vector2(puzzle.CurrentW, 0.5f);
            }
        }

        private void Band(RectTransform parent, float min, float max)
        {
            Range(parent, min, max, Gold);
            Range(parent, Mathf.Lerp(min, max, 0.2f), Mathf.Lerp(min, max, 0.8f), Safe);
        }
        private static void Range(RectTransform parent, float min, float max, Color color)
        {
            var image = Box("Band", parent, Vector2.zero, Vector2.zero, color);
            image.rectTransform.anchorMin = new Vector2(min, 0);
            image.rectTransform.anchorMax = new Vector2(max, 1);
        }
        private static Image Box(string name, Transform parent, Vector2 pos, Vector2 size, Color color)
        {
            var image = Rect(name, parent, new Vector2(0.5f, 0.5f), pos, size).gameObject.AddComponent<Image>();
            image.color = color; image.raycastTarget = false;
            return image;
        }
        private Text Label(string name, Transform parent, Vector2 pos, Vector2 size, string value, int fontSize)
        {
            var text = Rect(name, parent, new Vector2(0.5f, 0.5f), pos, size).gameObject.AddComponent<Text>();
            text.font = font; text.text = value; text.fontSize = fontSize; text.alignment = TextAnchor.MiddleCenter;
            text.color = Color.white; text.raycastTarget = false;
            return text;
        }
        private static RectTransform Rect(string name, Transform parent, Vector2 anchor, Vector2 pos, Vector2 size)
        {
            var rect = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false); rect.anchorMin = rect.anchorMax = anchor;
            rect.anchoredPosition = pos; rect.sizeDelta = size;
            return rect;
        }
        private void OnDestroy()
        {
            if (hud != null) Destroy(hud);
            if (bandRoot != null) Destroy(bandRoot);
            if (riskLegend != null) Destroy(riskLegend.gameObject);
            if (font != null) Destroy(font);
        }
    }
}
