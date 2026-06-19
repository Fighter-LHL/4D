using UnityEngine;
using WSlice.Level;

namespace WSlice.UI
{
    public sealed class LevelSelectLevelButton : MonoBehaviour
    {
        [SerializeField] private string levelId;
        [SerializeField] private LevelSelectView selectView;

        public void OnClick()
        {
            if (selectView != null)
                selectView.LoadLevel(levelId);
        }
    }
}
