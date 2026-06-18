using NUnit.Framework;
using UnityEngine;
using WSlice.Level;

namespace WSlice.Tests.EditMode
{
    public class LevelNodeMirrorNamingTests
    {
        [Test]
        public void ToMirrorName_AppendsNodeSuffix()
        {
            Assert.That(LevelNodeMirrorNaming.ToMirrorName("Outside"), Is.EqualTo("OutsideNode"));
        }

        [Test]
        public void IsDefinedMirror_MatchesLevelDefinitionNodes()
        {
            var definition = ScriptableObject.CreateInstance<LevelDefinition>();
            definition.Nodes.Add(new LevelNode { Id = "Outside", WorldPosition = Vector3.zero });
            definition.Nodes.Add(new LevelNode { Id = "FlowerTop", WorldPosition = Vector3.up });

            Assert.That(LevelNodeMirrorNaming.IsDefinedMirror(definition, "OutsideNode"), Is.True);
            Assert.That(LevelNodeMirrorNaming.IsDefinedMirror(definition, "FlowerTopNode"), Is.True);
            Assert.That(LevelNodeMirrorNaming.IsDefinedMirror(definition, "GapNode"), Is.False);
        }
    }
}
