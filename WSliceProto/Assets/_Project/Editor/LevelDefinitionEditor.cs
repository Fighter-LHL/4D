using UnityEditor;
using UnityEngine;
using WSlice.Level;

namespace WSlice.Editor
{
    [CustomEditor(typeof(LevelDefinition))]
    public sealed class LevelDefinitionEditor : UnityEditor.Editor
    {
        private bool _showNodesPreview = true;
        private bool _showEdgesPreview = true;

        public override void OnInspectorGUI()
        {
            var definition = (LevelDefinition)target;
            var validation = LevelDefinitionValidator.Validate(definition);
            var summary = LevelDefinitionInspectorModel.BuildSummary(definition);

            DrawValidationPanel(validation, summary);
            EditorGUILayout.Space();

            DrawPropertiesExcluding(serializedObject, "m_Script", "GoalNodeId", "StartNodeId");
            DrawNodeIdPickers(definition);

            EditorGUILayout.Space();
            DrawReadOnlyPreviews(definition, validation);

            if (GUI.changed)
            {
                EditorUtility.SetDirty(definition);
            }
        }

        private static void DrawValidationPanel(
            LevelDefinitionValidationResult validation,
            LevelDefinitionSummary summary)
        {
            EditorGUILayout.LabelField("Validation", EditorStyles.boldLabel);

            var previousColor = GUI.contentColor;
            GUI.contentColor = validation.IsValid
                ? (validation.Warnings.Count > 0 ? Color.yellow : Color.green)
                : Color.red;
            EditorGUILayout.LabelField(LevelDefinitionInspectorModel.BuildStatusLabel(validation), EditorStyles.helpBox);
            GUI.contentColor = previousColor;

            EditorGUILayout.LabelField(
                "Summary",
                $"{summary.NodeCount} nodes, {summary.EdgeCount} edges, {summary.SnapPointCount} snap points");

            foreach (string error in validation.Errors)
            {
                EditorGUILayout.HelpBox(error, MessageType.Error);
            }

            foreach (string warning in validation.Warnings)
            {
                EditorGUILayout.HelpBox(warning, MessageType.Warning);
            }
        }

        private void DrawNodeIdPickers(LevelDefinition definition)
        {
            if (definition.Nodes == null || definition.Nodes.Count == 0)
                return;

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Node References", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox($"Known nodes: {BuildNodeIdList(definition)}", MessageType.None);

            definition.StartNodeId = EditorGUILayout.TextField("Start Node Id", definition.StartNodeId ?? string.Empty);
            definition.GoalNodeId = EditorGUILayout.TextField("Goal Node Id", definition.GoalNodeId ?? string.Empty);
        }

        private static string BuildNodeIdList(LevelDefinition definition)
        {
            var ids = new System.Collections.Generic.List<string>();
            foreach (var node in definition.Nodes)
            {
                if (node == null || string.IsNullOrWhiteSpace(node.Id)) continue;
                ids.Add(node.Id);
            }

            return ids.Count == 0 ? "(none)" : string.Join(", ", ids);
        }

        private void DrawReadOnlyPreviews(LevelDefinition definition, LevelDefinitionValidationResult validation)
        {
            if (validation.Errors.Count > 0)
                return;

            _showNodesPreview = EditorGUILayout.Foldout(_showNodesPreview, "Nodes Preview", true);
            if (_showNodesPreview)
            {
                foreach (var node in definition.Nodes)
                {
                    if (node == null) continue;
                    EditorGUILayout.LabelField(
                        node.Id,
                        node.WorldPosition.ToString("F2"));
                }
            }

            _showEdgesPreview = EditorGUILayout.Foldout(_showEdgesPreview, "Edges Preview", true);
            if (_showEdgesPreview)
            {
                foreach (var edge in definition.Edges)
                {
                    if (edge == null) continue;

                    float minW = Mathf.Min(edge.WalkableRange.Min, edge.WalkableRange.Max);
                    float maxW = Mathf.Max(edge.WalkableRange.Min, edge.WalkableRange.Max);
                    string direction = edge.Bidirectional ? "<->" : "->";
                    EditorGUILayout.LabelField(
                        $"{edge.FromNodeId}{direction}{edge.ToNodeId}",
                        $"W [{minW:F2}, {maxW:F2}]");
                }
            }
        }
    }
}
