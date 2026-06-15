using UnityEngine;

namespace WSlice.Player
{
    public sealed class PlayerCharacter : MonoBehaviour
    {
        [field: SerializeField] public string CurrentNodeId { get; set; }
    }
}
