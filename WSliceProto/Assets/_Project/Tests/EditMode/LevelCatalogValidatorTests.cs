using System.Collections.Generic;
using NUnit.Framework;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class LevelCatalogValidatorTests
    {
        [Test]
        public void Validate_NullCatalog_ReturnsError()
        {
            var result = LevelCatalogValidator.Validate(null, new List<LevelDefinition>(), new List<BuildSceneEntry>());

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain("LevelCatalog is missing."));
        }

        [Test]
        public void Validate_DuplicateLevelId_ReturnsError()
        {
            var catalog = CreateCatalog(
                Entry("Garden_01", "GardenGraybox"),
                Entry("Garden_01", "GardenGrayboxCopy"));

            var result = LevelCatalogValidator.Validate(
                catalog,
                new List<LevelDefinition> { Definition("Garden_01") },
                ValidBuildScenes());

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain("Duplicate catalog LevelId 'Garden_01'."));
        }

        [Test]
        public void Validate_MissingSceneName_ReturnsError()
        {
            var catalog = CreateCatalog(Entry("Garden_01", string.Empty));

            var result = LevelCatalogValidator.Validate(
                catalog,
                new List<LevelDefinition> { Definition("Garden_01") },
                ValidBuildScenes());

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain("Catalog entry 'Garden_01' SceneName is missing."));
        }

        [Test]
        public void Validate_MissingDefinition_ReturnsError()
        {
            var catalog = CreateCatalog(Entry("Garden_01", "GardenGraybox"));

            var result = LevelCatalogValidator.Validate(
                catalog,
                new List<LevelDefinition>(),
                ValidBuildScenes());

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain("No LevelDefinition found for catalog LevelId 'Garden_01'."));
        }

        [Test]
        public void Validate_CatalogSceneNotInBuildSettings_ReturnsError()
        {
            var catalog = CreateCatalog(
                Entry("Garden_01", "GardenGraybox"),
                Entry("Platform_01", "PlatformGraybox"),
                Entry("Gate_03", "GateGraybox"));

            var buildScenes = new List<BuildSceneEntry>
            {
                new("Assets/_Project/Level/Scenes/LevelSelect.unity", "LevelSelect", true),
                new("Assets/_Project/Level/Scenes/GardenGraybox.unity", "GardenGraybox", true),
                new("Assets/_Project/Level/Scenes/GateGraybox.unity", "GateGraybox", true)
            };

            var result = LevelCatalogValidator.Validate(
                catalog,
                AllDefinitions(),
                buildScenes);

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain(
                "Catalog scene 'PlatformGraybox' for 'Platform_01' is not enabled in Build Settings."));
        }

        [Test]
        public void Validate_FirstBuildSceneMustBeLevelSelect_ReturnsError()
        {
            var catalog = CreateCatalog(
                Entry("Garden_01", "GardenGraybox"),
                Entry("Platform_01", "PlatformGraybox"),
                Entry("Gate_03", "GateGraybox"));

            var buildScenes = new List<BuildSceneEntry>
            {
                new("Assets/_Project/Level/Scenes/GardenGraybox.unity", "GardenGraybox", true),
                new("Assets/_Project/Level/Scenes/LevelSelect.unity", "LevelSelect", true)
            };

            var result = LevelCatalogValidator.Validate(
                catalog,
                AllDefinitions(),
                buildScenes);

            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Errors, Does.Contain(
                "First enabled Build Settings scene must be 'LevelSelect', found 'GardenGraybox'."));
        }

        [Test]
        public void Validate_ValidCatalogAndBuildSettings_Passes()
        {
            var catalog = CreateCatalog(
                Entry("Garden_01", "GardenGraybox"),
                Entry("Platform_01", "PlatformGraybox"),
                Entry("Gate_03", "GateGraybox"));

            var result = LevelCatalogValidator.Validate(
                catalog,
                AllDefinitions(),
                ValidBuildScenes());

            Assert.That(result.IsValid, Is.True);
        }

        private static LevelCatalogEntry Entry(string levelId, string sceneName)
        {
            return new LevelCatalogEntry
            {
                LevelId = levelId,
                DisplayName = levelId,
                SceneName = sceneName
            };
        }

        private static LevelCatalog CreateCatalog(params LevelCatalogEntry[] entries)
        {
            var catalog = UnityEngine.ScriptableObject.CreateInstance<LevelCatalog>();
            catalog.Entries.AddRange(entries);
            return catalog;
        }

        private static LevelDefinition Definition(string levelId)
        {
            var definition = UnityEngine.ScriptableObject.CreateInstance<LevelDefinition>();
            definition.LevelId = levelId;
            return definition;
        }

        private static List<LevelDefinition> AllDefinitions()
        {
            return new List<LevelDefinition>
            {
                Definition("Garden_01"),
                Definition("Platform_01"),
                Definition("Gate_03")
            };
        }

        private static List<BuildSceneEntry> ValidBuildScenes()
        {
            return new List<BuildSceneEntry>
            {
                new("Assets/_Project/Level/Scenes/LevelSelect.unity", "LevelSelect", true),
                new("Assets/_Project/Level/Scenes/GardenGraybox.unity", "GardenGraybox", true),
                new("Assets/_Project/Level/Scenes/PlatformGraybox.unity", "PlatformGraybox", true),
                new("Assets/_Project/Level/Scenes/GateGraybox.unity", "GateGraybox", true)
            };
        }
    }
}
