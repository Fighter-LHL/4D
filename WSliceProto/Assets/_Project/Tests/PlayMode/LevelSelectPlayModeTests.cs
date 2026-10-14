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
        public IEnumerator ShowsDemoTitleVersionAndAllLevelNamesWithoutSolutionThemes()
        {
            var title = GameObject.Find("Title");
            var version = GameObject.Find("VersionLabel");
            var subtitle = GameObject.Find("Subtitle");

            Assert.That(title, Is.Not.Null);
            Assert.That(version, Is.Not.Null);
            Assert.That(subtitle, Is.Not.Null);
            Assert.That(title.GetComponent<TextMeshProUGUI>().text, Is.EqualTo(LevelSelectDemoInfo.Title));
            Assert.That(version.GetComponent<TextMeshProUGUI>().text, Is.EqualTo(LevelSelectDemoInfo.Version));
            Assert.That(subtitle.GetComponent<TextMeshProUGUI>().text, Is.EqualTo("W-Slice graybox demo"));

            string[][] expectedLabels =
            {
                new[] { "Garden_01", "封闭花园" },
                new[] { "Platform_01", "偏移平台" },
                new[] { "Gate_03", "机关门" },
                new[] { "Chambers_04", "连环密室" },
                new[] { "Hazard_05", "危险平台" }
            };

            foreach (string[] expected in expectedLabels)
            {
                var button = GameObject.Find($"LevelButton_{expected[0]}");
                Assert.That(button, Is.Not.Null, expected[0]);
                var label = button.transform.Find("Label");
                Assert.That(label, Is.Not.Null, expected[0]);
                Assert.That(label.GetComponent<TextMeshProUGUI>().text, Is.EqualTo(expected[1]), expected[0]);
            }

            yield return null;
        }
    }
}
