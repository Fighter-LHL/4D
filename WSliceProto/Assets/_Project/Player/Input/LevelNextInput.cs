using UnityEngine;
using UnityEngine.InputSystem;
using WSlice.Level;

namespace WSlice.Player
{
    public sealed class LevelNextInput : MonoBehaviour
    {
        [SerializeField] private LevelFlowController flow;
        [SerializeField] private LevelSessionController session;

        private void Awake()
        {
            if (flow == null)
                flow = FindFirstObjectByType<LevelFlowController>();

            if (session == null)
                session = FindFirstObjectByType<LevelSessionController>();
        }

        private void Update()
        {
            if (flow == null || session == null)
                return;

            var keyboard = Keyboard.current;
            if (keyboard == null || !keyboard.nKey.wasPressedThisFrame)
                return;

            flow.TryLoadNextLevel();
        }
    }
}
