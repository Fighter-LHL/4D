using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using WSlice.Core;
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

        private Vector3 _lastTargetWorldPosition;
        private bool _hasLastTarget;
        private string _lastTargetNodeId;
        private bool _hasLastTargetNode;

        private string _activeSegmentFromId;
        private string _activeSegmentToId;
        private bool _hasActiveSegment;

        private WState _subscribedWState;

        public bool IsMoving => _isMoving;
        public bool HasActiveSegment => _hasActiveSegment;
        public string ActiveSegmentFromId => _activeSegmentFromId;
        public string ActiveSegmentToId => _activeSegmentToId;
        public bool HasLastTarget => _hasLastTarget;
        public Vector3 LastTargetWorldPosition => _lastTargetWorldPosition;
        public bool HasLastTargetNode => _hasLastTargetNode;
        public string LastTargetNodeId => _lastTargetNodeId;

        private void OnEnable()
        {
            SubscribeW();
        }

        private void Start()
        {
            SubscribeW();
        }

        private void OnDisable()
        {
            UnsubscribeW();
            CancelMoveRoutineOnly();
            ClearActiveSegment();
        }

        public PlayerActionResult RequestMove(Vector3 worldPosition)
        {
            if (character == null || levelController == null || levelController.Graph == null)
                return PlayerActionResult.Failure(PlayerActionFailureReason.MissingCharacterOrLevel);

            if (levelController.WState == null)
                return PlayerActionResult.Failure(PlayerActionFailureReason.MissingWState);

            var graph = levelController.Graph;
            string currentId = character.CurrentNodeId;
            string nearest = FindNearestNode(worldPosition, graph);
            if (string.IsNullOrEmpty(currentId))
                return PlayerActionResult.Failure(PlayerActionFailureReason.MissingCurrentNode);

            if (string.IsNullOrEmpty(nearest))
                return PlayerActionResult.Failure(PlayerActionFailureReason.NoNearestNode);

            SetLastTarget(worldPosition, nearest);

            var path = graph.FindPath(currentId, nearest, levelController.WState.CurrentW);
            if (path.Count == 0)
                return PlayerActionResult.Failure(PlayerActionFailureReason.NoPathAtCurrentW);

            if (_moveRoutine != null)
            {
                CancelMoveRoutineOnly();
                SnapCharacterToNode(graph, currentId);
            }

            _moveRoutine = StartCoroutine(MoveAlongPath(path));
            return PlayerActionResult.Success();
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

        private void SetLastTarget(Vector3 worldPosition, string nodeId)
        {
            _lastTargetWorldPosition = worldPosition;
            _hasLastTarget = true;
            _lastTargetNodeId = nodeId;
            _hasLastTargetNode = !string.IsNullOrEmpty(nodeId);
        }

        private IEnumerator MoveAlongPath(IReadOnlyList<LevelNode> path)
        {
            _isMoving = true;
            try
            {
                var graph = levelController.Graph;

                for (int i = 1; i < path.Count; i++)
                {
                    string segmentFromId = character.CurrentNodeId;
                    LevelNode targetNode = path[i];
                    string segmentToId = targetNode.Id;

                    SetActiveSegment(segmentFromId, segmentToId);

                    if (!CanContinueSegment(graph, segmentFromId, segmentToId))
                        yield break;

                    Vector3 target = targetNode.WorldPosition;

                    while (Vector3.Distance(character.transform.position, target) > arrivalThreshold)
                    {
                        if (!CanContinueSegment(graph, segmentFromId, segmentToId))
                            yield break;

                        character.transform.position = Vector3.MoveTowards(
                            character.transform.position,
                            target,
                            moveSpeed * Time.deltaTime);
                        yield return null;
                    }

                    character.transform.position = target;
                    character.CurrentNodeId = segmentToId;
                    ClearActiveSegment();
                }
            }
            finally
            {
                _isMoving = false;
                _moveRoutine = null;
                ClearActiveSegment();
            }
        }

        private bool CanContinueSegment(LevelGraphRuntime graph, string fromId, string toId)
        {
            if (graph.CanMove(fromId, toId, levelController.WState.CurrentW))
                return true;

            SnapCharacterToNode(graph, fromId);
            return false;
        }

        private void SetActiveSegment(string fromId, string toId)
        {
            _activeSegmentFromId = fromId;
            _activeSegmentToId = toId;
            _hasActiveSegment = !string.IsNullOrEmpty(fromId) && !string.IsNullOrEmpty(toId);
        }

        private void ClearActiveSegment()
        {
            _activeSegmentFromId = null;
            _activeSegmentToId = null;
            _hasActiveSegment = false;
        }

        private void SnapCharacterToNode(LevelGraphRuntime graph, string nodeId)
        {
            if (character == null || graph == null || string.IsNullOrEmpty(nodeId)) return;

            var node = graph.GetNode(nodeId);
            if (node == null) return;

            character.transform.position = node.WorldPosition;
            character.CurrentNodeId = nodeId;
        }

        private void SubscribeW()
        {
            if (_subscribedWState != null || levelController == null || levelController.WState == null) return;

            _subscribedWState = levelController.WState;
            _subscribedWState.OnWChanged += OnWChanged;
        }

        private void UnsubscribeW()
        {
            if (_subscribedWState == null) return;

            _subscribedWState.OnWChanged -= OnWChanged;
            _subscribedWState = null;
        }

        private void OnWChanged(float w)
        {
            if (!_isMoving || !_hasActiveSegment || !_hasLastTarget) return;
            if (levelController == null || levelController.Graph == null) return;

            var graph = levelController.Graph;
            if (graph.CanMove(_activeSegmentFromId, _activeSegmentToId, w))
                return;

            string restartFromId = _activeSegmentFromId;
            Vector3 target = _lastTargetWorldPosition;

            CancelMoveRoutineOnly();
            SnapCharacterToNode(graph, restartFromId);
            RequestMove(target);
        }

        private void CancelMoveRoutineOnly()
        {
            if (_moveRoutine != null)
            {
                StopCoroutine(_moveRoutine);
                _moveRoutine = null;
            }

            _isMoving = false;
            ClearActiveSegment();
        }
    }
}
