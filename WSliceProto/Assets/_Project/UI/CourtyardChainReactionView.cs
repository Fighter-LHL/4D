using UnityEngine;
using UnityEngine.Rendering;
using WSlice.Level;

namespace WSlice.UI
{
    /// <summary>Scene-wide reward choreography; decoration never changes traversal or collisions.</summary>
    public sealed class CourtyardChainReactionView : MonoBehaviour
    {
        private const int WaveLimit = 12;
        private const int TrailPoints = 16;
        private const int PetalCount = 6;
        private const int BridgeLampCount = 20;
        private const float WaveSpeed = 7.5f;
        private static readonly Color Mint = new Color(0.23f, 0.95f, 0.83f);
        private static readonly Color Gold = new Color(1f, 0.72f, 0.16f);
        private static readonly Color Dim = new Color(0.12f, 0.23f, 0.28f);
        private static readonly string[] NodeIds =
        {
            CourtyardLayout.Mechanism, CourtyardLayout.UpperLanding, CourtyardLayout.StairFoot,
            CourtyardLayout.Courtyard, CourtyardLayout.BridgeStart, CourtyardLayout.ExitLanding, CourtyardLayout.Goal
        };

        private sealed class Beacon
        {
            public Vector3 Position;
            public Transform Core;
            public readonly Transform[] Petals = new Transform[PetalCount];
            public readonly LineRenderer[] Crowns = new LineRenderer[3];
            public bool Mechanized;
            public int TransientTier;
            public float Flash, Bloom;
        }

        private sealed class Wave
        {
            public LineRenderer Left, Right;
            public float OriginDistance, Travel, Delay;
            public int Tier, Visited;
            public bool Active, Mechanism;
        }

        private CourtyardWorldView world;
        private Transform bridgeSurface;
        private GameObject root;
        private Material material;
        private Mesh mesh;
        private MaterialPropertyBlock properties;
        private readonly Beacon[] beacons = new Beacon[NodeIds.Length];
        private readonly Vector3[] route = new Vector3[NodeIds.Length];
        private readonly float[] distances = new float[NodeIds.Length];
        private readonly Wave[] waves = new Wave[WaveLimit];
        private readonly Transform[] bridgeLamps = new Transform[BridgeLampCount];
        private readonly float[] bridgeLampDistances = new float[BridgeLampCount];
        private readonly float[] bridgeLampFlash = new float[BridgeLampCount];
        private int nextWave, securedTier, visibleTier, banked;
        private bool mechanismActivated, completed;
        private float completionAge, breakAge = -1f;

        public int ActiveWaveCount
        {
            get { int count = 0; foreach (var wave in waves) if (wave != null && wave.Active) count++; return count; }
        }
        public int LitBeaconCount
        {
            get
            {
                int count = 0;
                foreach (var beacon in beacons)
                    if (beacon != null && (beacon.Mechanized || Mathf.Max(securedTier, beacon.TransientTier) > 0)) count++;
                return count;
            }
        }
        public int SecuredTier => securedTier;
        public int VisibleTier => visibleTier;
        public int BeaconCount => root != null ? beacons.Length : 0;
        public int DecorationCount => root != null ? root.GetComponentsInChildren<Renderer>(true).Length : 0;
        public bool IsCompleted => completed;

        public void Bind(CourtyardWorldView view)
        {
            if (world != view && root != null) ReleaseResources();
            world = view;
            if (isActiveAndEnabled && Application.isPlaying) EnsureBuilt();
        }

        public void MechanismActivated()
        {
            if (mechanismActivated) return;
            mechanismActivated = true;
            if (CanEmit()) LaunchWave(0f, 0, 0f, true);
        }

        public void RiskSucceeded(Vector3 origin, int chain)
        {
            int tier = Mathf.Clamp(chain, 1, 3);
            visibleTier = Mathf.Max(visibleTier, tier);
            breakAge = -1f;
            if (!CanEmit()) return;
            float start = NearestRouteDistance(origin);
            // Each earned tier adds a clearly separated trailing wave, never an unbounded burst.
            for (int i = 0; i < tier; i++) LaunchWave(start, tier, i * 0.22f, false);
        }

        public void Deposited(int totalBanked, int securedChain)
        {
            banked = Mathf.Max(0, totalBanked);
            securedTier = Mathf.Clamp(securedChain, 0, 3);
            visibleTier = Mathf.Max(visibleTier, securedTier);
            if (!CanEmit() || banked == 0) return;
            LaunchWave(0f, securedTier, 0.12f, false);
        }

        public void Broken(int securedChain)
        {
            securedTier = Mathf.Clamp(securedChain, 0, 3);
            visibleTier = securedTier;
            breakAge = 0f;
            foreach (var wave in waves)
            {
                if (wave == null || wave.Mechanism) continue;
                wave.Active = false;
                Hide(wave.Left); Hide(wave.Right);
            }
            foreach (var beacon in beacons)
            {
                if (beacon == null) continue;
                beacon.TransientTier = 0;
                beacon.Flash = 0f;
            }
            for (int i = 0; i < bridgeLampFlash.Length; i++) bridgeLampFlash[i] = 0f;
        }

        public void Complete(int total, int securedChain)
        {
            completed = true;
            completionAge = 0f;
            banked = Mathf.Max(0, total);
            securedTier = Mathf.Max(securedTier, Mathf.Clamp(securedChain, 0, 3));
            visibleTier = Mathf.Max(visibleTier, securedTier);
            if (!CanEmit()) return;
            // The finale travels back from the exit, answering the initial mechanism wave.
            for (int i = 0; i < 3; i++) LaunchWave(distances[distances.Length - 1], securedTier, i * 0.25f, false);
        }

        public void ResetFeedback()
        {
            securedTier = visibleTier = banked = nextWave = 0;
            mechanismActivated = completed = false;
            completionAge = 0f;
            breakAge = -1f;
            foreach (var wave in waves)
            {
                if (wave == null) continue;
                wave.Active = false;
                Hide(wave.Left); Hide(wave.Right);
            }
            foreach (var beacon in beacons)
            {
                if (beacon == null) continue;
                beacon.Mechanized = false;
                beacon.TransientTier = 0;
                beacon.Flash = beacon.Bloom = 0f;
                foreach (var crown in beacon.Crowns) Hide(crown);
                foreach (var petal in beacon.Petals) Hide(petal);
                if (beacon.Core != null)
                {
                    beacon.Core.position = beacon.Position + Vector3.up * 0.28f;
                    beacon.Core.localScale = new Vector3(0.14f, 0.24f, 0.14f);
                    beacon.Core.rotation = Quaternion.identity;
                    SetColor(beacon.Core.GetComponent<Renderer>(), Dim);
                }
            }
            for (int i = 0; i < bridgeLamps.Length; i++)
            {
                bridgeLampFlash[i] = 0f;
                if (bridgeLamps[i] == null) continue;
                bridgeLamps[i].localScale = new Vector3(0.13f, 0.055f, 0.055f);
                PositionBridgeLamp(i);
                SetColor(bridgeLamps[i].GetComponent<Renderer>(), Dim);
            }
        }

        private void LateUpdate()
        {
            if (!EnsureBuilt()) return;
            float dt = Time.deltaTime;
            if (completed) completionAge += dt;
            if (breakAge >= 0f) breakAge += dt;
            AnimateWaves(dt);
            AnimateBeacons(dt);
            AnimateBridge(dt);
        }

        private void AnimateWaves(float dt)
        {
            float end = distances[distances.Length - 1];
            foreach (var wave in waves)
            {
                if (wave == null || !wave.Active) continue;
                wave.Delay -= dt;
                if (wave.Delay > 0f) continue;
                wave.Travel += dt * WaveSpeed;
                for (int i = 0; i < beacons.Length; i++)
                {
                    if ((wave.Visited & (1 << i)) != 0 || Mathf.Abs(distances[i] - wave.OriginDistance) > wave.Travel) continue;
                    wave.Visited |= 1 << i;
                    var beacon = beacons[i];
                    if (wave.Mechanism) beacon.Mechanized = true;
                    else beacon.TransientTier = Mathf.Max(beacon.TransientTier, wave.Tier);
                    beacon.Flash = 1f;
                }
                for (int i = 0; i < bridgeLamps.Length; i++)
                {
                    float distance = Mathf.Abs(bridgeLampDistances[i] - wave.OriginDistance);
                    if (distance <= wave.Travel && distance >= wave.Travel - 0.8f) bridgeLampFlash[i] = 1f;
                }
                DrawTrail(wave.Left, wave.OriginDistance, -wave.Travel, wave.Tier);
                DrawTrail(wave.Right, wave.OriginDistance, wave.Travel, wave.Tier);
                if (wave.Travel > Mathf.Max(wave.OriginDistance, end - wave.OriginDistance) + 1.6f)
                {
                    wave.Active = false;
                    Hide(wave.Left); Hide(wave.Right);
                }
            }
        }

        private void AnimateBeacons(float dt)
        {
            for (int i = 0; i < beacons.Length; i++)
            {
                var beacon = beacons[i];
                int tier = Mathf.Max(securedTier, beacon.TransientTier);
                bool awake = beacon.Mechanized || tier > 0;
                beacon.Flash = Mathf.MoveTowards(beacon.Flash, 0f, dt * 1.25f);
                beacon.Bloom = Mathf.MoveTowards(beacon.Bloom, awake ? 1f : 0f, dt * 2.2f);
                float breath = Mathf.Sin(Time.time * 2.1f - i * 0.55f) * 0.035f;
                float finale = completed ? Mathf.Sin(completionAge * 3f - i * 0.45f) * 0.07f : 0f;
                var baseColor = tier > 0 ? Gold : Mint;
                var color = Color.Lerp(awake ? baseColor : Dim, Color.white, beacon.Flash * 0.6f);
                SetColor(beacon.Core.GetComponent<Renderer>(), color);
                beacon.Core.position = beacon.Position + Vector3.up * (0.28f + breath + beacon.Flash * 0.13f);
                beacon.Core.localScale = new Vector3(0.14f, 0.24f, 0.14f) * (1f + tier * 0.16f + beacon.Flash * 0.4f);
                beacon.Core.rotation = Quaternion.Euler(0f, Time.time * (12f + tier * 9f), 0f);
                for (int j = 0; j < PetalCount; j++)
                {
                    var petal = beacon.Petals[j];
                    petal.gameObject.SetActive(beacon.Bloom > 0.01f);
                    float angle = j * Mathf.PI * 2f / PetalCount + i * 0.25f;
                    float radius = (0.16f + tier * 0.075f + beacon.Flash * 0.18f + finale) * beacon.Bloom;
                    // Failed unbanked blooms fold down visibly before disappearing.
                    float droop = breakAge >= 0f && tier == 0 ? Mathf.Clamp01(breakAge * 2f) * 0.15f : 0f;
                    petal.position = beacon.Position + new Vector3(Mathf.Cos(angle) * radius,
                        0.20f + breath + beacon.Flash * 0.12f - droop, Mathf.Sin(angle) * radius);
                    petal.rotation = Quaternion.Euler(15f + tier * 8f, -angle * Mathf.Rad2Deg, 70f - tier * 12f);
                    petal.localScale = new Vector3(0.07f, 0.16f + tier * 0.025f, 0.07f) * beacon.Bloom;
                    SetColor(petal.GetComponent<Renderer>(), color);
                }
                for (int j = 0; j < beacon.Crowns.Length; j++)
                {
                    var crown = beacon.Crowns[j];
                    // Dormant outlines make the next two tiers visible as a concrete replay target.
                    crown.gameObject.SetActive(awake);
                    crown.transform.position = beacon.Position + Vector3.up * (0.10f + j * 0.13f + breath);
                    crown.widthMultiplier = j >= tier ? 0.009f : j < securedTier ? 0.028f : 0.018f + 0.007f * Mathf.Sin(Time.time * 4f);
                    SetColor(crown, j >= tier ? Dim : j < securedTier ? Mint : Gold);
                }
            }
        }

        private void AnimateBridge(float dt)
        {
            bool awake = beacons[4].Mechanized && beacons[5].Mechanized;
            for (int i = 0; i < bridgeLamps.Length; i++)
            {
                if (bridgeLamps[i] == null) continue;
                PositionBridgeLamp(i);
                bridgeLampFlash[i] = Mathf.MoveTowards(bridgeLampFlash[i], 0f, dt * 1.4f);
                float moving = visibleTier > securedTier ? Mathf.Pow(Mathf.Max(0f, Mathf.Sin(Time.time * 3.6f - i / 2 * 0.7f)), 6f) : 0f;
                var color = securedTier > 0 ? Color.Lerp(Mint, Gold, securedTier / 3f) : awake ? Mint * 0.5f : Dim;
                color = Color.Lerp(color, Gold, moving * 0.7f);
                color = Color.Lerp(color, Color.white, bridgeLampFlash[i] * 0.85f);
                SetColor(bridgeLamps[i].GetComponent<Renderer>(), color);
                // These are attached visually to the real moving bridge, never a floating substitute path.
                bridgeLamps[i].localScale = new Vector3(0.13f, 0.055f + bridgeLampFlash[i] * 0.08f, 0.055f);
            }
        }

        private void PositionBridgeLamp(int index)
        {
            var lamp = bridgeLamps[index];
            if (lamp == null) return;
            lamp.gameObject.SetActive(bridgeSurface != null);
            if (bridgeSurface == null) return;
            float t = (index / 2 + 0.5f) / (BridgeLampCount / 2f);
            // SliceBridge is the authored unit cube scaled to its physical surface. Follow its actual
            // transform, including lowering while closed, instead of the graph's permanent node heights.
            lamp.position = bridgeSurface.TransformPoint(new Vector3(t - 0.5f, 0.68f, index % 2 == 0 ? -0.56f : 0.56f));
        }

        private void LaunchWave(float distance, int tier, float delay, bool mechanism)
        {
            // Preserve the mechanism's one-time activation wave if the reward pool is saturated.
            int index = nextWave;
            for (int i = 0; i < WaveLimit; i++)
            {
                index = (nextWave + i) % WaveLimit;
                if (!waves[index].Active || !waves[index].Mechanism) break;
            }
            var wave = waves[index];
            nextWave = (index + 1) % WaveLimit;
            wave.OriginDistance = distance;
            wave.Travel = 0f; wave.Delay = delay; wave.Tier = tier; wave.Visited = 0;
            wave.Active = true; wave.Mechanism = mechanism;
            Hide(wave.Left); Hide(wave.Right);
            var color = mechanism ? Mint : Gold;
            SetColor(wave.Left, color); SetColor(wave.Right, color);
        }

        private void DrawTrail(LineRenderer line, float origin, float signedTravel, int tier)
        {
            float direction = signedTravel < 0f ? -1f : 1f;
            float head = origin + signedTravel;
            float tail = origin + direction * Mathf.Max(0f, Mathf.Abs(signedTravel) - 1.1f - tier * 0.16f);
            float end = distances[distances.Length - 1];
            bool visible = direction > 0f ? tail < end && head >= 0f : tail > 0f && head <= end;
            line.gameObject.SetActive(visible);
            if (!visible) return;
            for (int i = 0; i < TrailPoints; i++)
                line.SetPosition(i, RoutePoint(Mathf.Clamp(Mathf.Lerp(tail, head, i / (float)(TrailPoints - 1)), 0f, end)));
            line.widthMultiplier = 1f;
            line.startWidth = 0.015f;
            line.endWidth = 0.08f + tier * 0.023f;
        }

        private Vector3 RoutePoint(float distance)
        {
            for (int i = 1; i < route.Length; i++)
                if (distance <= distances[i])
                    return Vector3.Lerp(route[i - 1], route[i], Mathf.InverseLerp(distances[i - 1], distances[i], distance));
            return route[route.Length - 1];
        }

        private float NearestRouteDistance(Vector3 position)
        {
            float closest = float.MaxValue, result = 0f;
            for (int i = 1; i < route.Length; i++)
            {
                var segment = route[i] - route[i - 1];
                float t = Mathf.Clamp01(Vector3.Dot(position - route[i - 1], segment) / segment.sqrMagnitude);
                float distance = (position - Vector3.Lerp(route[i - 1], route[i], t)).sqrMagnitude;
                if (distance >= closest) continue;
                closest = distance;
                result = Mathf.Lerp(distances[i - 1], distances[i], t);
            }
            return result;
        }

        private bool CanEmit() => isActiveAndEnabled && Application.isPlaying && EnsureBuilt();

        private bool EnsureBuilt()
        {
            if (root != null) return true;
            if (world == null || !Application.isPlaying) return false;
            // A scene may remove the independent root before the component receives OnDestroy.
            // If this owner survives, release the old material/mesh before constructing replacements.
            if (material != null || mesh != null) ReleaseResources();
            bridgeSurface = world.transform.Find("CourtyardWorld/SliceBridge");
            // Resolve every authored marker before allocating resources. No guessed graph coordinates.
            for (int i = 0; i < NodeIds.Length; i++)
            {
                var marker = world.transform.Find("CourtyardWorld/Landing_" + NodeIds[i]);
                if (marker == null) return false;
                route[i] = marker.position + Vector3.up * 0.14f + Vector3.back * 1.03f;
                distances[i] = i == 0 ? 0f : distances[i - 1] + Vector3.Distance(route[i - 1], route[i]);
            }
            Material source = null;
            foreach (var renderer in world.GetComponentsInChildren<Renderer>(true))
                if (renderer.sharedMaterial != null) { source = renderer.sharedMaterial; break; }
            if (source == null) return false;
            material = new Material(source) { name = "CourtyardChainReaction_Runtime" };
            material.EnableKeyword("_EMISSION");
            if (material.HasProperty("_Cull")) material.SetFloat("_Cull", (float)CullMode.Off);
            properties = new MaterialPropertyBlock();
            mesh = CreateCrystalMesh();
            // Independent world root avoids Canvas scale, and every object ignores pointer raycasts.
            root = new GameObject("CourtyardChainReactions") { layer = 2 };
            for (int i = 0; i < NodeIds.Length; i++)
            {
                var beacon = new Beacon { Position = route[i] };
                beacons[i] = beacon;
                beacon.Core = CreateCrystal("ChainBeacon_" + NodeIds[i], Dim);
                beacon.Core.position = route[i] + Vector3.up * 0.28f;
                beacon.Core.gameObject.SetActive(true);
                for (int j = 0; j < PetalCount; j++) beacon.Petals[j] = CreateCrystal("ChainPetal_" + i + "_" + j, Mint);
                for (int j = 0; j < 3; j++)
                {
                    var crown = CreateLine("ChainCrown_" + i + "_" + j, Mint, 33, false);
                    for (int k = 0; k < 33; k++)
                    {
                        float angle = k * Mathf.PI * 2f / 32f;
                        crown.SetPosition(k, new Vector3(Mathf.Cos(angle), 0f, Mathf.Sin(angle)) * (0.20f + j * 0.10f));
                    }
                    beacon.Crowns[j] = crown;
                }
            }
            for (int i = 0; i < WaveLimit; i++)
                waves[i] = new Wave { Left = CreateLine("ChainWaveLeft_" + i, Mint, TrailPoints, true), Right = CreateLine("ChainWaveRight_" + i, Mint, TrailPoints, true) };
            for (int i = 0; i < BridgeLampCount; i++)
            {
                float t = (i / 2 + 0.5f) / (BridgeLampCount / 2f);
                bridgeLamps[i] = CreateCrystal("BridgeChainLight_" + i, Dim);
                bridgeLamps[i].localScale = new Vector3(0.13f, 0.055f, 0.055f);
                PositionBridgeLamp(i);
                bridgeLampDistances[i] = Mathf.Lerp(distances[4], distances[5], t);
            }
            return true;
        }

        private Transform CreateCrystal(string name, Color color)
        {
            var go = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer)) { layer = 2 };
            go.transform.SetParent(root.transform, false);
            go.transform.localScale = new Vector3(0.14f, 0.24f, 0.14f);
            go.GetComponent<MeshFilter>().sharedMesh = mesh;
            ConfigureRenderer(go.GetComponent<Renderer>(), color);
            go.SetActive(false);
            return go.transform;
        }

        private LineRenderer CreateLine(string name, Color color, int count, bool worldSpace)
        {
            var go = new GameObject(name, typeof(LineRenderer)) { layer = 2 };
            go.transform.SetParent(root.transform, false);
            var line = go.GetComponent<LineRenderer>();
            ConfigureRenderer(line, color);
            line.useWorldSpace = worldSpace;
            line.positionCount = count;
            line.numCapVertices = 2;
            line.widthMultiplier = 0.025f;
            go.SetActive(false);
            return line;
        }

        private void ConfigureRenderer(Renderer renderer, Color color)
        {
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            SetColor(renderer, color);
        }

        private void SetColor(Renderer renderer, Color color)
        {
            if (renderer == null || properties == null) return;
            properties.Clear();
            properties.SetColor("_BaseColor", color);
            properties.SetColor("_Color", color);
            properties.SetColor("_EmissionColor", color * 0.65f);
            renderer.SetPropertyBlock(properties);
        }

        private static Mesh CreateCrystalMesh()
        {
            var points = new[] { Vector3.up, Vector3.down, Vector3.right, Vector3.forward, Vector3.left, Vector3.back };
            var faces = new[] { 0, 3, 2, 0, 4, 3, 0, 5, 4, 0, 2, 5, 1, 2, 3, 1, 3, 4, 1, 4, 5, 1, 5, 2 };
            var vertices = new Vector3[faces.Length]; var triangles = new int[faces.Length];
            for (int i = 0; i < faces.Length; i++) { vertices[i] = points[faces[i]]; triangles[i] = i; }
            var result = new Mesh { name = "CourtyardChainCrystal_Runtime", vertices = vertices, triangles = triangles };
            result.RecalculateNormals(); result.RecalculateBounds();
            return result;
        }

        private static void Hide(Component component)
        {
            if (component != null && component.gameObject != null) component.gameObject.SetActive(false);
        }

        private void OnEnable() { if (root != null) root.SetActive(true); }
        private void OnDisable() { if (root != null) root.SetActive(false); }
        private void OnDestroy() => ReleaseResources();

        private void ReleaseResources()
        {
            ResetFeedback();
            if (root != null) { root.SetActive(false); DestroyOwned(root); }
            if (mesh != null) DestroyOwned(mesh);
            if (material != null) DestroyOwned(material);
            root = null; mesh = null; material = null; properties = null; bridgeSurface = null;
            for (int i = 0; i < beacons.Length; i++) beacons[i] = null;
            for (int i = 0; i < waves.Length; i++) waves[i] = null;
            for (int i = 0; i < bridgeLamps.Length; i++) bridgeLamps[i] = null;
        }

        private static void DestroyOwned(Object owned)
        {
            if (Application.isPlaying) Destroy(owned);
            else DestroyImmediate(owned);
        }
    }
}
