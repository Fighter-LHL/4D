using System.Collections;
using NUnit.Framework;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using WSlice.UI;

namespace WSlice.Tests.PlayMode
{
    public class LevelSelectPlayModeTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("LevelSelect", LoadSceneMode.Single);
            while (!op.isDone)
                yield return null;
            yield return null;
        }

        [UnityTest]
        public IEnumerator ShowsDemoTitleVersionAndLevelThemes()
        {
            var title = GameObject.Find("Title");
            var version = GameObject.Find("VersionLabel");
            var gardenButton = GameObject.Find("LevelButton_Garden_01/Label");

            Assert.That(title, Is.Not.Null);
            Assert.That(version, Is.Not.Null);
            Assert.That(gardenButton, Is.Not.Null);
            Assert.That(title.GetComponent<TextMeshProUGUI>().text, Is.EqualTo(LevelSelectDemoInfo.Title));
            Assert.That(version.GetComponent<TextMeshProUGUI>().text, Is.EqualTo(LevelSelectDemoInfo.Version));
            Assert.That(gardenButton.GetComponent<TextMeshProUGUI>().text, Does.Contain("封闭花园"));
            Assert.That(gardenButton.GetComponent<TextMeshProUGUI>().text, Does.Contain("gaps"));
            yield return null;
        }
    }
}
