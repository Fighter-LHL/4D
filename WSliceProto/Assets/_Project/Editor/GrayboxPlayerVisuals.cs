using UnityEngine;

namespace WSlice.Editor
{
    public static class GrayboxPlayerVisuals
    {
        public static void Ensure(GameObject player)
        {
            // Navigation stores the feet at the graph node. Keep the body above that root.
            var visual = player.transform.Find("PlayerVisual");
            if (visual == null)
            {
                var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                body.name = "PlayerVisual";
                body.transform.SetParent(player.transform, false);
                visual = body.transform;
                var previousRenderer = player.GetComponent<Renderer>();
                if (previousRenderer != null)
                    body.GetComponent<Renderer>().sharedMaterials = previousRenderer.sharedMaterials;
            }
            visual.localPosition = new Vector3(0f, 0.55f, 0f);
            visual.localRotation = Quaternion.identity;
            visual.localScale = new Vector3(0.45f, 0.55f, 0.45f);

            foreach (var collider in player.GetComponentsInChildren<Collider>(true))
                Object.DestroyImmediate(collider);
            var rootRenderer = player.GetComponent<Renderer>();
            if (rootRenderer != null) Object.DestroyImmediate(rootRenderer);
            var rootMesh = player.GetComponent<MeshFilter>();
            if (rootMesh != null) Object.DestroyImmediate(rootMesh);
        }
    }
}
