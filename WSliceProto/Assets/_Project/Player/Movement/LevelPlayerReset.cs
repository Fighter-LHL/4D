using UnityEngine;
using WSlice.Level;

namespace WSlice.Player
{
    public sealed class LevelPlayerReset : MonoBehaviour, ILevelRestartHandler
    {
        [SerializeField] private PlayerCharacter character;
        [SerializeField] private MovementController movement;
        [SerializeField] private PlayerInputRouter inputRouter;

        public void ApplyLevelRestart(LevelDefinition definition, LevelGraphRuntime graph)
        {
            if (movement != null)
                movement.StopMovement();

            if (inputRouter != null)
                inputRouter.ClearLastAction();

            if (character == null || definition == null || graph == null)
                return;

            string startNodeId = definition.StartNodeId;
            if (string.IsNullOrEmpty(startNodeId) || graph.GetNode(startNodeId) == null)
                return;

            if (movement != null)
                movement.ResetToNode(startNodeId);
            else
            {
                var node = graph.GetNode(startNodeId);
                character.CurrentNodeId = startNodeId;
                character.transform.position = node.WorldPosition;
            }
        }

        private void Awake()
        {
            if (character == null)
                character = GetComponent<PlayerCharacter>();

            if (movement == null)
                movement = GetComponent<MovementController>();
        }
    }
}
