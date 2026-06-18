using UnityEngine;
using UnityEngine.UI;
using WSlice.Core;
using WSlice.Level;
using WSlice.Player;

namespace WSlice.UI
{
    public sealed class WDialView : MonoBehaviour
    {
        [SerializeField] private Slider slider;
        [SerializeField] private PlayerInputRouter inputRouter;

        private WState wState;
        private WState _subscribedState;

        private void Start()
        {
            if (inputRouter == null)
                inputRouter = FindFirstObjectByType<PlayerInputRouter>();

            if (inputRouter != null)
            {
                Bind(inputRouter);
                return;
            }

            var level = FindFirstObjectByType<LevelRuntimeController>();
            if (level != null)
                Bind(level.WState);
        }

        private void OnEnable()
        {
            if (slider != null)
                slider.onValueChanged.AddListener(OnSliderChanged);

            Subscribe();
        }

        private void OnDisable()
        {
            if (slider != null)
                slider.onValueChanged.RemoveListener(OnSliderChanged);

            Unsubscribe();
        }

        public void Bind(WState state)
        {
            inputRouter = null;
            SetWState(state);
        }

        public void Bind(PlayerInputRouter router)
        {
            inputRouter = router;
            SetWState(router != null ? router.WState : null);
        }

        private void SetWState(WState state)
        {
            if (ReferenceEquals(wState, state))
            {
                if (wState != null)
                    OnWChanged(wState.CurrentW);
                return;
            }

            Unsubscribe();
            wState = state;
            Subscribe();

            if (wState != null && _subscribedState == null)
                OnWChanged(wState.CurrentW);
        }

        private void Subscribe()
        {
            if (!isActiveAndEnabled || wState == null || _subscribedState != null) return;

            wState.OnWChanged += OnWChanged;
            _subscribedState = wState;
            OnWChanged(wState.CurrentW);
        }

        private void Unsubscribe()
        {
            if (_subscribedState == null) return;

            _subscribedState.OnWChanged -= OnWChanged;
            _subscribedState = null;
        }

        private void OnSliderChanged(float value)
        {
            if (inputRouter != null)
                inputRouter.SetWDial(value);
            else
                wState?.SetTarget(value);
        }

        private void OnWChanged(float w)
        {
            if (slider != null)
                slider.SetValueWithoutNotify(w);
        }
    }
}
