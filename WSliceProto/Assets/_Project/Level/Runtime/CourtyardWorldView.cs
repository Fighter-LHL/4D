using UnityEngine;

namespace WSlice.Level
{
    public sealed class CourtyardWorldView : MonoBehaviour
    {
        [SerializeField] private Material stoneMaterial;
        [SerializeField] private Material sliceMaterial;
        [SerializeField] private Material accentMaterial;
        [SerializeField] private Material goalMaterial;
        [SerializeField] private Transform worldRoot;
        [SerializeField] private GameObject entranceDoor;
        [SerializeField] private GameObject sliceStair;
        [SerializeField] private Transform bridge;
        [SerializeField] private Transform lever;
        [SerializeField] private Renderer anchorLight;

        private Mesh rampMesh;
        private MaterialPropertyBlock properties;
        public bool EntranceOpen { get; private set; }
        public bool StairOpen { get; private set; }
        public bool BridgeOpen { get; private set; }

        public void EnsureBuilt(CourtyardPuzzleController puzzle)
        {
            if (worldRoot != null) return;
            worldRoot = new GameObject("CourtyardWorld").transform;
            worldRoot.SetParent(transform, false);

            Floor("Outside", new Vector3(0f, -0.2f, -6f), new Vector3(3f, 0.4f, 3f), CourtyardLayout.Entry);
            Floor("EntranceWalkway", new Vector3(0f, -0.2f, -3f), new Vector3(2f, 0.4f, 3f), CourtyardLayout.Courtyard);
            Floor("SafeCourtyard", new Vector3(0f, -0.2f, 0f), new Vector3(8f, 0.4f, 3f), CourtyardLayout.Courtyard);
            Floor("MechanismLanding", new Vector3(-7f, 0.4f, 0f), new Vector3(2f, 1.6f, 3f), CourtyardLayout.Mechanism);
            Floor("ExitIsland", new Vector3(7f, -0.2f, 0f), new Vector3(4f, 0.4f, 3f), CourtyardLayout.ExitLanding);

            entranceDoor = Block("SliceDoor", new Vector3(0f, 1.1f, -3f), new Vector3(1.8f, 2.2f, 0.3f), sliceMaterial);
            Block("EntranceLeft", new Vector3(-1.25f, 1.2f, -3f), new Vector3(0.6f, 2.4f, 0.6f), stoneMaterial);
            Block("EntranceRight", new Vector3(1.25f, 1.2f, -3f), new Vector3(0.6f, 2.4f, 0.6f), stoneMaterial);
            Block("EntranceLintel", new Vector3(0f, 2.45f, -3f), new Vector3(3.1f, 0.3f, 0.6f), stoneMaterial);

            sliceStair = BuildRamp();
            var bridgeObject = Floor("SliceBridge", new Vector3(4.5f, -0.15f, 0f), new Vector3(3f, 0.3f, 1.6f), CourtyardLayout.ExitLanding, sliceMaterial);
            bridge = bridgeObject.transform;
            Block("BridgeNearPier", new Vector3(3.1f, -0.9f, 0f), new Vector3(0.5f, 1.8f, 2f), stoneMaterial);
            Block("BridgeFarPier", new Vector3(5.9f, -0.9f, 0f), new Vector3(0.5f, 1.8f, 2f), stoneMaterial);

            var mechanism = Block("CourtyardMechanism", new Vector3(-7f, 1.65f, 0.8f), new Vector3(0.5f, 0.9f, 0.5f), accentMaterial);
            mechanism.AddComponent<CourtyardMechanism>().Bind(puzzle);
            lever = mechanism.transform;
            anchorLight = Block("BridgeAnchorSignal", new Vector3(3f, 0.6f, 0.9f), new Vector3(0.35f, 1.2f, 0.35f), accentMaterial).GetComponent<Renderer>();

            Marker(CourtyardLayout.Entry, new Vector3(0f, 0.02f, -6f));
            Marker(CourtyardLayout.Courtyard, new Vector3(0f, 0.02f, 0f));
            Marker(CourtyardLayout.StairFoot, new Vector3(-3f, 0.02f, 0f));
            Marker(CourtyardLayout.UpperLanding, new Vector3(-6f, 1.22f, 0f));
            Marker(CourtyardLayout.Mechanism, new Vector3(-7f, 1.22f, 0f));
            Marker(CourtyardLayout.BridgeStart, new Vector3(3f, 0.02f, 0f));
            Marker(CourtyardLayout.ExitLanding, new Vector3(6f, 0.02f, 0f));
            Marker(CourtyardLayout.Goal, new Vector3(8f, 0.02f, 0f), goalMaterial);
            var flower = Block("ExitFlower", new Vector3(8f, 0.7f, 0.65f), new Vector3(0.45f, 1.4f, 0.45f), goalMaterial);
            flower.AddComponent<WorldMoveTarget>().NodeId = CourtyardLayout.Goal;
        }

        public void Render(LevelGraphRuntime graph, float w, bool activated)
        {
            if (worldRoot == null || graph == null) return;
            EntranceOpen = graph.CanMove(CourtyardLayout.Entry, CourtyardLayout.Courtyard, w);
            StairOpen = graph.CanMove(CourtyardLayout.StairFoot, CourtyardLayout.UpperLanding, w);
            BridgeOpen = graph.CanMove(CourtyardLayout.BridgeStart, CourtyardLayout.ExitLanding, w);
            entranceDoor.SetActive(!EntranceOpen);
            sliceStair.SetActive(StairOpen);
            bridge.localPosition = new Vector3(4.5f, BridgeOpen ? -0.15f : -1.8f, 0f);
            bridge.GetComponent<Collider>().enabled = BridgeOpen;
            lever.localRotation = Quaternion.Euler(0f, 0f, activated ? -35f : 0f);
            properties ??= new MaterialPropertyBlock();
            var color = activated ? new Color(1f, 0.73f, 0.25f) : new Color(0.22f, 0.25f, 0.3f);
            properties.SetColor("_BaseColor", color);
            properties.SetColor("_Color", color);
            anchorLight.SetPropertyBlock(properties);
        }

        private GameObject BuildRamp()
        {
            var go = new GameObject("SliceStair", typeof(MeshFilter), typeof(MeshRenderer), typeof(MeshCollider), typeof(WorldMoveTarget));
            go.transform.SetParent(worldRoot, false);
            // A continuous inclined walking surface exactly follows the graph segment.
            // Endpoints are supported by the permanent courtyard and upper landing.
            rampMesh = new Mesh { name = "CourtyardSliceStair" };
            rampMesh.vertices = new[]
            {
                new Vector3(-3f, 0f, -0.7f), new Vector3(-3f, 0f, 0.7f),
                new Vector3(-6f, 1.2f, -0.7f), new Vector3(-6f, 1.2f, 0.7f),
                new Vector3(-3f, -0.18f, -0.7f), new Vector3(-3f, -0.18f, 0.7f),
                new Vector3(-6f, 1.02f, -0.7f), new Vector3(-6f, 1.02f, 0.7f)
            };
            rampMesh.triangles = new[] { 0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 4, 2, 4, 6, 2, 1, 3, 5, 5, 3, 7, 0, 1, 4, 4, 1, 5, 2, 6, 3, 6, 7, 3 };
            rampMesh.RecalculateNormals();
            rampMesh.RecalculateBounds();
            go.GetComponent<MeshFilter>().sharedMesh = rampMesh;
            go.GetComponent<MeshCollider>().sharedMesh = rampMesh;
            go.GetComponent<MeshRenderer>().sharedMaterial = sliceMaterial;
            go.GetComponent<WorldMoveTarget>().NodeId = CourtyardLayout.Mechanism;
            return go;
        }

        private GameObject Floor(string name, Vector3 position, Vector3 scale, string target, Material material = null)
        {
            var go = Block(name, position, scale, material != null ? material : stoneMaterial);
            go.AddComponent<WorldMoveTarget>().NodeId = target;
            return go;
        }

        private void Marker(string node, Vector3 position, Material material = null)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = "Landing_" + node;
            go.transform.SetParent(worldRoot, false);
            go.transform.localPosition = position;
            go.transform.localScale = new Vector3(0.65f, 0.02f, 0.65f);
            go.GetComponent<Renderer>().sharedMaterial = material != null ? material : accentMaterial;
            go.AddComponent<WorldMoveTarget>().NodeId = node;
        }

        private GameObject Block(string name, Vector3 position, Vector3 scale, Material material)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(worldRoot, false);
            go.transform.localPosition = position;
            go.transform.localScale = scale;
            go.GetComponent<Renderer>().sharedMaterial = material;
            return go;
        }

        private void OnDestroy()
        {
            if (rampMesh != null) Destroy(rampMesh);
        }
    }
}
