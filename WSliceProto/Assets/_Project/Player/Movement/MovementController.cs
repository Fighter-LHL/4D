using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using WSlice.Level;

namespace WSlice.Player
{
    public sealed class MovementController : MonoBehaviour
    {
        [SerializeField] private PlayerCharacter character;
        [SerializeField] private LevelRuntimeController levelController;
        [SerializeField] private float moveSpeed = 3f;
        [SerializeField] private float arrivalThreshold = 0.05f;

        private Coroutine _moveRoutine;
        private bool _isMoving;

        public bool IsMoving => _isMoving;

        public void RequestMove(Vector3 worldPosition)
        {
            if (character == null || levelController == null) return;

            var graph = levelController.Graph;
            string currentId = character.CurrentNodeId;
            string nearest = FindNearestNode(worldPosition, graph);
            if (string.IsNullOrEmpty(nearest)) return;

            if (_moveRoutine != null)
            {
                StopCoroutine(_moveRoutine);
                _isMoving = false;
                _moveRoutine = null;
            }
            _moveRoutine = StartCoroutine(MoveAlongPath(currentId, nearest));
        }

        private string FindNearestNode(Vector3 pos, LevelGraphRuntime graph)
        {
            string best = null;
            float bestDist = float.MaxValue;
            foreach (var kvp in graph.Nodes)
            {
                float d = Vector3.Distance(pos, kvp.Value.WorldPosition);
                if (d < bestDist)
                {
                    bestDist = d;
                    best = kvp.Key;
                }
            }
            return best;
        }

        private IEnumerator MoveAlongPath(string fromId, string toId)
        {
            _isMoving = true;
            try
            {
                var graph = levelController.Graph;
                var path = graph.FindPath(fromId, toId, levelController.WState.CurrentW);
                if (path.Count == 0) yield break;

                foreach (var node in path)
                {
                    character.CurrentNodeId = node.Id;
                    Vector3 target = node.WorldPosition;
                    target.y = character.transform.position.y;
                    while (Vector3.Distance(character.transform.position, target) > arrivalThreshold)
                    {
                        if (!graph.CanMove(character.CurrentNodeId, node.Id, levelController.WState.CurrentW))
                            yield break;

                        character.transform.position = Vector3.MoveTowards(
                            character.transform.position,
                            target,
                            moveSpeed * Time.deltaTime);
                        yield return null;
                    }
                }
            }
            finally
            {
                _isMoving = false;
                _moveRoutine = null;
            }
        }
    }
}
