using UnityEngine;
using UnityEngine.InputSystem;
using WSlice.Level;

namespace WSlice.Player
{
    public sealed class LevelRestartInput : MonoBehaviour
    {
        [SerializeField] private LevelSessionController session;

        private void Awake()
        {
            if (session == null)
                session = FindFirstObjectByType<LevelSessionController>();
        }

        private void Update()
        {
            if (session == null)
                return;

            var keyboard = Keyboard.current;
            if (keyboard == null || !keyboard.rKey.wasPressedThisFrame)
                return;

            session.RequestRestart();
        }
    }
}
