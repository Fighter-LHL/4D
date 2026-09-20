using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UI;
using WSlice.Level;

namespace WSlice.Tests.PlayMode
{
    public class CourtyardDemoEntryTests
    {
        [UnitySetUp]
        public IEnumerator LoadMenu()
        {
            var load = SceneManager.LoadSceneAsync("LevelSelect", LoadSceneMode.Single);
            while (!load.isDone)
                yield return null;
            yield return null;
            yield return null; // The old vertical LayoutGroup is removed before adding the grid.
        }

        [UnityTest]
        public IEnumerator MenuPromotesTheCourtyardAndKeepsFiveMechanismExamples()
        {
            var featured = GameObject.Find("CourtyardFeaturedEntry");
            var panel = GameObject.Find("LevelSelect/Buttons");
            Assert.That(featured, Is.Not.Null);
            Assert.That(featured.GetComponentInChildren<Text>().text, Is.EqualTo("开始：回响庭院"));
            Assert.That(panel, Is.Not.Null);
            var grid = panel.GetComponent<GridLayoutGroup>();
            Assert.That(grid, Is.Not.Null);
            Assert.That(grid.constraintCount, Is.EqualTo(3));
            Assert.That(panel.GetComponent<VerticalLayoutGroup>(), Is.Null);
            int visibleExamples = 0;
            foreach (Transform child in panel.transform)
            {
                if (child.gameObject.activeSelf && child.GetComponent<Button>() != null)
                    visibleExamples++;
            }
            Assert.That(visibleExamples, Is.EqualTo(5));
            yield return null;
        }

        [UnityTest]
        public IEnumerator FeaturedButtonLoadsTheRepresentativeSlice()
        {
            var featured = GameObject.Find("CourtyardFeaturedEntry");
            Assert.That(featured, Is.Not.Null);
            featured.GetComponent<Button>().onClick.Invoke();
            yield return null;
            yield return null;

            Assert.That(SceneManager.GetActiveScene().name, Is.EqualTo(CourtyardLayout.SceneName));
            Assert.That(Object.FindFirstObjectByType<CourtyardPuzzleController>(), Is.Not.Null);
        }
    }
}
