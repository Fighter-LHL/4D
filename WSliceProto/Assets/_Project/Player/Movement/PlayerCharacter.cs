using UnityEngine;
using WSlice.Level;

namespace WSlice.Player
{
    public sealed class PlayerCharacter : MonoBehaviour, ILevelObjectiveSource
    {
        [field: SerializeField] public string CurrentNodeId { get; set; }
    }
}
