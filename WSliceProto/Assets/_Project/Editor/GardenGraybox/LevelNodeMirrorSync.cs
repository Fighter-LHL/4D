using UnityEditor;
using UnityEngine;
using WSlice.Level;

namespace WSlice.Editor
{
    public static class LevelNodeMirrorSync
    {
        public static string SceneNodeMirrorName(string nodeId) => LevelNodeMirrorNaming.ToMirrorName(nodeId);

        public static void SyncSceneNodeMirrors(LevelDefinition definition, Transform nodesParent)
        {
            if (definition == null || nodesParent == null) return;

            foreach (var node in definition.Nodes)
            {
                if (node == null || string.IsNullOrEmpty(node.Id)) continue;

                var mirror = GardenEditorUtilities.FindOrCreate(SceneNodeMirrorName(node.Id));
                Undo.RecordObject(mirror.transform, "Sync Scene Node Mirror");
                mirror.transform.SetParent(nodesParent, false);
                mirror.transform.position = node.WorldPosition;
                EditorUtility.SetDirty(mirror);
            }

            for (int i = nodesParent.childCount - 1; i >= 0; i--)
            {
                var child = nodesParent.GetChild(i);
                if (IsDefinedSceneNodeMirror(definition, child.name)) continue;
                Undo.DestroyObjectImmediate(child.gameObject);
            }
        }

        public static int ValidateSceneNodeMirrors(LevelDefinition definition)
        {
            int errors = 0;
            if (definition == null) return 1;

            var nodesRoot = GameObject.Find("Nodes");
            if (nodesRoot == null)
            {
                Debug.LogError("Nodes root is missing; scene node mirrors cannot be validated.");
                return 1;
            }

            foreach (var node in definition.Nodes)
            {
                if (node == null || string.IsNullOrEmpty(node.Id)) continue;

                string mirrorName = SceneNodeMirrorName(node.Id);
                var mirror = GameObject.Find(mirrorName);
                if (mirror == null)
                {
                    Debug.LogError($"Scene node mirror '{mirrorName}' is missing for LevelDefinition node '{node.Id}'.");
                    errors++;
                    continue;
                }

                if (mirror.transform.parent != nodesRoot.transform)
                {
                    Debug.LogError($"Scene node mirror '{mirrorName}' must be a direct child of Nodes.");
                    errors++;
                }

                float distance = Vector3.Distance(mirror.transform.position, node.WorldPosition);
                if (distance > 0.001f)
                {
                    Debug.LogError(
                        $"Scene node mirror '{mirrorName}' is out of sync with LevelDefinition node '{node.Id}'. "
                        + $"Scene={mirror.transform.position}, Definition={node.WorldPosition}");
                    errors++;
                }
            }

            for (int i = 0; i < nodesRoot.transform.childCount; i++)
            {
                var child = nodesRoot.transform.GetChild(i);
                if (IsDefinedSceneNodeMirror(definition, child.name)) continue;

                Debug.LogError(
                    $"Scene node mirror '{child.name}' is not defined in LevelDefinition and should be removed or renamed.");
                errors++;
            }

            return errors;
        }

        public static bool IsDefinedSceneNodeMirror(LevelDefinition definition, string mirrorName)
        {
            return LevelNodeMirrorNaming.IsDefinedMirror(definition, mirrorName);
        }
    }
}
