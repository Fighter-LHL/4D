using NUnit.Framework;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class LevelFlowModelTests
    {
        [Test]
        public void TryGetNext_Garden_ReturnsPlatform()
        {
            var catalog = CreateCatalog();

            Assert.That(
                LevelFlowModel.TryGetNext(catalog, "Garden_01", out LevelCatalogEntry next),
                Is.True);
            Assert.That(next.LevelId, Is.EqualTo("Platform_01"));
            Assert.That(next.SceneName, Is.EqualTo("PlatformGraybox"));
        }

        [Test]
        public void TryGetNext_Platform_ReturnsGate()
        {
            var catalog = CreateCatalog();

            Assert.That(
                LevelFlowModel.TryGetNext(catalog, "Platform_01", out LevelCatalogEntry next),
                Is.True);
            Assert.That(next.LevelId, Is.EqualTo("Gate_03"));
        }

        [Test]
        public void TryGetNext_Gate_ReturnsChambers()
        {
            var catalog = CreateCatalog();

            Assert.That(
                LevelFlowModel.TryGetNext(catalog, "Gate_03", out LevelCatalogEntry next),
                Is.True);
            Assert.That(next.LevelId, Is.EqualTo("Chambers_04"));
            Assert.That(next.SceneName, Is.EqualTo("ChambersGraybox"));
        }

        [Test]
        public void TryGetNext_LastLevel_ReturnsFalse()
        {
            var catalog = CreateCatalog();

            Assert.That(LevelFlowModel.TryGetNext(catalog, "Chambers_04", out _), Is.False);
        }

        [Test]
        public void TryGetEntry_UnknownLevel_ReturnsFalse()
        {
            var catalog = CreateCatalog();

            Assert.That(LevelFlowModel.TryGetEntry(catalog, "Missing", out _), Is.False);
        }

        private static LevelCatalog CreateCatalog()
        {
            var catalog = UnityEngine.ScriptableObject.CreateInstance<LevelCatalog>();
            catalog.Entries.Add(new LevelCatalogEntry
            {
                LevelId = "Garden_01",
                DisplayName = "封闭花园",
                SceneName = "GardenGraybox"
            });
            catalog.Entries.Add(new LevelCatalogEntry
            {
                LevelId = "Platform_01",
                DisplayName = "偏移平台",
                SceneName = "PlatformGraybox"
            });
            catalog.Entries.Add(new LevelCatalogEntry
            {
                LevelId = "Gate_03",
                DisplayName = "机关门",
                SceneName = "GateGraybox"
            });
            catalog.Entries.Add(new LevelCatalogEntry
            {
                LevelId = "Chambers_04",
                DisplayName = "连环密室",
                SceneName = "ChambersGraybox"
            });
            return catalog;
        }
    }
}
