using UnityEngine;

namespace WSlice.Level
{
    public sealed class CourtyardMechanism : MonoBehaviour, IWorldInteractable
    {
        [SerializeField] private CourtyardPuzzleController puzzle;

        public void Bind(CourtyardPuzzleController controller) => puzzle = controller;
        public bool TryInteract(float currentW) => puzzle != null && puzzle.TryActivate();
        public string GetNotInteractiveHint() => "先走到机关旁，再点击启动机关。";
    }
}
