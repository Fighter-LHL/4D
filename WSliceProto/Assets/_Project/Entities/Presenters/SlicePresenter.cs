using UnityEngine;

namespace WSlice.Entities
{
    public abstract class SlicePresenter : MonoBehaviour
    {
        public abstract void Apply(float visibility, float solidity, float glow, float w);
    }
}
