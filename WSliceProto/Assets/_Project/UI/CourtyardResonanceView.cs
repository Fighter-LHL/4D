using UnityEngine;
using UnityEngine.Rendering;
using WSlice.Level;

namespace WSlice.UI
{
    /// <summary>Bounded, collider-free feedback. All positions are world-space; gameplay stays in the controller.</summary>
    public sealed class CourtyardResonanceView : MonoBehaviour
    {
        private const int CrystalLimit = 18;
        private const int SparkLimit = 48;
        private const int RingLimit = 8;
        private const int RingSegments = 64;
        private const int PetalCount = 10;
        private static readonly Color Mint = new Color(0.35f, 1f, 0.82f);
        private static readonly Color Gold = new Color(1f, 0.76f, 0.24f);
        private static readonly Color Amber = new Color(1f, 0.49f, 0.17f);
        private static readonly Color Coral = new Color(1f, 0.24f, 0.26f);

        private sealed class Spark
        {
            public Transform Transform;
            public Vector3 Origin, Velocity, Target;
            public float Age, Duration, Size;
            public bool Flying;
        }

        private sealed class Ring
        {
            public LineRenderer Line;
            public float Age, Duration, Radius;
        }

        private Transform player;
        private CourtyardWorldView world;
        private Transform bankTarget;
        private Transform stairFoot, upperLanding;
        private GameObject root;
        private Material material;
        private Mesh crystalMesh;
        private MaterialPropertyBlock properties;
        private LineRenderer stabilityRing;
        private LineRenderer chargeRing;
        private LineRenderer bankedRing;
        private readonly Transform[] crystals = new Transform[CrystalLimit];
        private readonly Spark[] sparks = new Spark[SparkLimit];
        private readonly Ring[] rings = new Ring[RingLimit];
        private readonly Transform[] petals = new Transform[PetalCount];
        private readonly AudioSource[] voices = new AudioSource[4];
        private readonly AudioClip[] tones = new AudioClip[4];
        private int nextSpark, nextRing, nextVoice;
        private int carried, banked;
        private float stability = 1f, charge, flowerAge = -1f, nextSoundTime, nextLowStabilityTime;
        private bool crossing, dangerous, charged;
        private bool muted;
        private Vector3 flowerPosition;

        public void Bind(Transform player, CourtyardWorldView world)
        {
            this.player = player;
            this.world = world;
            bankTarget = null;
            stairFoot = upperLanding = null;
            if (isActiveAndEnabled && Application.isPlaying) EnsureBuilt();
        }

        public void Render(int carried, int banked, float stability, float charge,
            bool crossing, bool dangerous, bool charged)
        {
            bool chargeCompleted = charged && !this.charged;
            this.carried = Mathf.Clamp(carried, 0, CrystalLimit);
            this.banked = Mathf.Max(0, banked);
            this.stability = Mathf.Clamp01(stability);
            this.charge = Mathf.Clamp01(charge);
            this.crossing = crossing;
            this.dangerous = dangerous;
            this.charged = charged;
            if (chargeCompleted && player != null && CanEmit())
            {
                EmitRing(player.position, Gold, 0.95f, 0.65f);
                PlayTone(0, 1.25f);
            }
            if (crossing && this.stability < 0.35f && Time.time >= nextLowStabilityTime && player != null && CanEmit())
            {
                nextLowStabilityTime = Time.time + 0.4f;
                EmitRing(player.position, Amber, 0.68f, 0.35f);
                PlayTone(1, 0.75f);
            }
        }

        public void SetMuted(bool value)
        {
            muted = value;
            foreach (var voice in voices)
                if (voice != null) voice.mute = value;
        }

        public void Pulse(Vector3 position, Color color, int strength = 1)
        {
            if (!CanEmit()) return;
            strength = Mathf.Clamp(strength, 1, 4);
            EmitRing(position, color, 0.75f + strength * 0.18f, 0.65f);
            Burst(position + Vector3.up * 0.12f, color, 3 + strength * 2, 0.6f, 0.075f);
            PlayTone(0, 0.82f + strength * 0.09f);
        }

        public void Shatter(Vector3 position, int lost)
        {
            if (!CanEmit()) return;
            EmitRing(position, Coral, 1.3f, 0.5f);
            Burst(position + Vector3.up * 0.5f, Coral, Mathf.Clamp(lost * 3, 8, 24), 1.15f, 0.12f);
            PlayTone(1, 1f);
        }

        public void Bank(Vector3 position, int amount)
        {
            if (amount <= 0 || !CanEmit()) return;
            if (bankTarget == null && world != null)
                bankTarget = world.transform.Find("CourtyardWorld/CourtyardMechanism");
            var target = bankTarget != null ? bankTarget.position + Vector3.up * 0.5f : position + Vector3.up * 1.3f;
            int count = Mathf.Clamp(amount * 2, 5, CrystalLimit);
            for (int i = 0; i < count; i++)
            {
                float angle = i * Mathf.PI * 2f / count;
                var origin = position + new Vector3(Mathf.Cos(angle) * 0.5f, 0.4f + i * 0.025f, Mathf.Sin(angle) * 0.5f);
                var spark = GetSpark(origin, Gold, 0.85f + i * 0.02f, 0.13f);
                spark.Flying = true;
                spark.Target = target;
            }
            EmitRing(position, Gold, 1.1f, 0.9f);
            PlayTone(2, 1f);
        }

        public void Celebrate(Vector3 position, int total)
        {
            if (!CanEmit()) return;
            flowerPosition = position;
            flowerAge = 0f;
            EmitRing(position, Gold, 2.1f, 1.5f);
            EmitRing(position + Vector3.up * 0.04f, Mint, 1.55f, 1.15f);
            Burst(position + Vector3.up * 0.45f, Gold, Mathf.Clamp(total + 12, 12, 32), 1.8f, 0.12f);
            PlayTone(3, 1f);
        }

        public void ResetFeedback()
        {
            carried = banked = 0;
            stability = 1f;
            charge = 0f;
            crossing = dangerous = charged = false;
            flowerAge = -1f;
            nextSoundTime = 0f;
            nextLowStabilityTime = 0f;
            foreach (var spark in sparks)
                if (spark != null) HideIfAlive(spark.Transform);
            foreach (var ring in rings)
                if (ring != null) HideIfAlive(ring.Line);
            foreach (var crystal in crystals)
                HideIfAlive(crystal);
            foreach (var petal in petals)
                HideIfAlive(petal);
            foreach (var voice in voices)
                if (voice != null) voice.Stop();
            HideIfAlive(chargeRing);
            HideIfAlive(stabilityRing);
            HideIfAlive(bankedRing);
        }

        private static void HideIfAlive(Component component)
        {
            // Scene unload can destroy the independent feedback root before its owner.
            // Spark/Ring are managed wrappers, so their own null check cannot detect that.
            if (component == null) return;
            var target = component.gameObject;
            if (target != null) target.SetActive(false);
        }

        private void LateUpdate()
        {
            if (player == null || !EnsureBuilt()) return;
            float time = Time.time;
            float dt = Time.deltaTime;
            var position = player.position;
            var groundRotation = GroundRotation(position);
            var stateColor = dangerous ? Color.Lerp(Coral, Amber, stability) : Mint;
            float tremor = dangerous ? 1f + 0.045f * Mathf.Sin(time * (8f + 10f * (1f - stability))) : 1f;
            stabilityRing.gameObject.SetActive(true);
            stabilityRing.transform.position = position + Vector3.up * 0.065f;
            stabilityRing.transform.rotation = groundRotation;
            SetColor(stabilityRing, stateColor);
            DrawArc(stabilityRing, 0.48f * tremor, crossing ? Mathf.Max(0.025f, stability) : 1f);
            stabilityRing.widthMultiplier = crossing ? 0.065f : 0.035f;

            chargeRing.gameObject.SetActive(charge > 0.015f || charged);
            if (chargeRing.gameObject.activeSelf)
            {
                chargeRing.transform.position = position + Vector3.up * 0.08f;
                chargeRing.transform.rotation = groundRotation;
                DrawArc(chargeRing, charged ? 0.64f + Mathf.Sin(time * 4f) * 0.025f : 0.62f, charged ? 1f : charge);
                chargeRing.widthMultiplier = charged ? 0.055f : 0.025f;
            }
            if (banked > 0 && bankTarget == null && world != null)
                bankTarget = world.transform.Find("CourtyardWorld/CourtyardMechanism");
            bankedRing.gameObject.SetActive(banked > 0 && bankTarget != null);
            if (bankedRing.gameObject.activeSelf)
            {
                bankedRing.transform.position = bankTarget.position + Vector3.up * 0.54f;
                DrawArc(bankedRing, 0.30f + Mathf.Min(banked, 20) * 0.012f, 1f);
                bankedRing.widthMultiplier = 0.035f + Mathf.Sin(time * 2f) * 0.006f;
            }
            for (int i = 0; i < CrystalLimit; i++)
            {
                var crystal = crystals[i];
                if (crystal == null) continue;
                bool visible = i < carried;
                if (crystal.gameObject.activeSelf != visible) crystal.gameObject.SetActive(visible);
                if (!visible) continue;
                float angle = time * (dangerous ? 1.65f : 1.1f) + i * Mathf.PI * 2f / Mathf.Max(1, carried);
                float radius = 0.64f + (i % 2) * 0.12f;
                crystal.position = position + new Vector3(Mathf.Cos(angle) * radius, 0.55f + Mathf.Sin(time * 2.5f + i) * 0.10f, Mathf.Sin(angle) * radius);
                crystal.rotation = Quaternion.Euler(15f, time * 85f + i * 23f, 15f);
                crystal.localScale = new Vector3(0.10f, 0.17f, 0.10f) * (charged ? 1.12f : 1f);
                SetColor(crystal.GetComponent<Renderer>(), dangerous ? Amber : Gold);
            }
            AnimateSparks(dt);
            AnimateRings(dt);
            AnimateFlower(dt, time);
        }

        private Quaternion GroundRotation(Vector3 position)
        {
            if (world == null || !world.StairOpen) return Quaternion.identity;
            if (stairFoot == null) stairFoot = world.transform.Find("CourtyardWorld/Landing_" + CourtyardLayout.StairFoot);
            if (upperLanding == null) upperLanding = world.transform.Find("CourtyardWorld/Landing_" + CourtyardLayout.UpperLanding);
            if (stairFoot == null || upperLanding == null) return Quaternion.identity;
            var direction = upperLanding.position - stairFoot.position;
            if (direction.sqrMagnitude < 0.01f) return Quaternion.identity;
            var offset = position + Vector3.up * 0.02f - stairFoot.position;
            float along = Vector3.Dot(offset, direction) / direction.sqrMagnitude;
            if (along <= 0.01f || along >= 0.99f || (offset - direction * along).sqrMagnitude > 0.09f)
                return Quaternion.identity;
            // Follow the authored ramp plane so the ring does not disappear inside its uphill half.
            var normal = Vector3.Cross(direction, Vector3.forward).normalized;
            if (normal.y < 0f) normal = -normal;
            return Quaternion.FromToRotation(Vector3.up, normal);
        }

        private void AnimateSparks(float dt)
        {
            foreach (var spark in sparks)
            {
                if (spark == null || spark.Transform == null || !spark.Transform.gameObject.activeSelf) continue;
                spark.Age += dt;
                float t = Mathf.Clamp01(spark.Age / spark.Duration);
                if (t >= 1f)
                {
                    spark.Transform.gameObject.SetActive(false);
                    if (spark.Flying) EmitRing(spark.Target, Mint, 0.28f, 0.28f);
                    continue;
                }
                if (spark.Flying)
                {
                    float eased = t * t * (3f - 2f * t);
                    spark.Transform.position = Vector3.Lerp(spark.Origin, spark.Target, eased) + Vector3.up * (Mathf.Sin(t * Mathf.PI) * 0.65f);
                }
                else
                    spark.Transform.position = spark.Origin + spark.Velocity * spark.Age - Vector3.up * (1.5f * spark.Age * spark.Age);
                spark.Transform.Rotate(90f * dt, 140f * dt, 55f * dt, Space.Self);
                float size = spark.Size * (1f - t * t);
                spark.Transform.localScale = new Vector3(size, size * 1.6f, size);
            }
        }

        private void AnimateRings(float dt)
        {
            foreach (var ring in rings)
            {
                if (ring == null || ring.Line == null || !ring.Line.gameObject.activeSelf) continue;
                ring.Age += dt;
                float t = Mathf.Clamp01(ring.Age / ring.Duration);
                if (t >= 1f) { ring.Line.gameObject.SetActive(false); continue; }
                DrawArc(ring.Line, Mathf.Lerp(0.12f, ring.Radius, 1f - (1f - t) * (1f - t)), 1f);
                ring.Line.widthMultiplier = 0.07f * (1f - t);
            }
        }

        private void AnimateFlower(float dt, float time)
        {
            if (flowerAge < 0f) return;
            flowerAge += dt;
            for (int i = 0; i < PetalCount; i++)
            {
                var petal = petals[i];
                if (petal == null) continue;
                float bloom = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01((flowerAge - i * 0.045f) / 0.8f));
                petal.gameObject.SetActive(true);
                float angle = i * Mathf.PI * 2f / PetalCount;
                petal.position = flowerPosition + new Vector3(Mathf.Cos(angle) * bloom * 0.82f, 0.16f + Mathf.Sin(time * 1.5f + i) * 0.035f, Mathf.Sin(angle) * bloom * 0.82f);
                petal.rotation = Quaternion.Euler(0f, -angle * Mathf.Rad2Deg, 0f);
                petal.localScale = new Vector3(0.48f, 0.10f, 0.22f) * bloom;
            }
        }

        private void Burst(Vector3 position, Color color, int count, float duration, float size)
        {
            for (int i = 0; i < count; i++)
            {
                float angle = i * 2.399963f;
                var spark = GetSpark(position, color, duration * (0.8f + (i % 4) * 0.07f), size);
                float speed = 0.6f + (i % 5) * 0.17f;
                spark.Velocity = new Vector3(Mathf.Cos(angle) * speed, 1f + (i % 3) * 0.35f, Mathf.Sin(angle) * speed);
            }
        }

        private Spark GetSpark(Vector3 position, Color color, float duration, float size)
        {
            var spark = sparks[nextSpark];
            nextSpark = (nextSpark + 1) % SparkLimit;
            spark.Age = 0f;
            spark.Duration = duration;
            spark.Size = size;
            spark.Flying = false;
            spark.Origin = position;
            spark.Transform.position = position;
            spark.Transform.localScale = Vector3.one * size;
            spark.Transform.gameObject.SetActive(true);
            SetColor(spark.Transform.GetComponent<Renderer>(), color);
            return spark;
        }

        private void EmitRing(Vector3 position, Color color, float radius, float duration)
        {
            var ring = rings[nextRing];
            nextRing = (nextRing + 1) % RingLimit;
            ring.Age = 0f;
            ring.Duration = duration;
            ring.Radius = radius;
            ring.Line.transform.position = position + Vector3.up * 0.075f;
            ring.Line.widthMultiplier = 0.07f;
            DrawArc(ring.Line, 0.12f, 1f);
            SetColor(ring.Line, color);
            ring.Line.gameObject.SetActive(true);
        }

        private bool CanEmit() => isActiveAndEnabled && Application.isPlaying && EnsureBuilt();

        private bool EnsureBuilt()
        {
            if (root != null) return true;
            Shader shader = null;
            Material source = null;
            if (world != null)
            {
                foreach (var renderer in world.GetComponentsInChildren<Renderer>(true))
                    if (renderer.sharedMaterial != null) { source = renderer.sharedMaterial; break; }
            }
            if (source == null)
            {
                shader = Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Sprites/Default");
                if (shader == null) return false;
            }
            material = source != null ? new Material(source) : new Material(shader);
            material.name = "CourtyardFeedback_Runtime";
            material.EnableKeyword("_EMISSION");
            if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", Color.white);
            if (material.HasProperty("_Color")) material.SetColor("_Color", Color.white);
            if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", 0.2f);
            if (material.HasProperty("_Cull")) material.SetFloat("_Cull", (float)CullMode.Off);
            properties = new MaterialPropertyBlock();
            crystalMesh = CreateCrystalMesh();
            // Deliberately outside the UI hierarchy: a Canvas can be scaled or screen-space.
            root = new GameObject("CourtyardResonanceFeedback") { layer = 2 };
            stabilityRing = CreateRing("Stability", Mint);
            chargeRing = CreateRing("Charge", Gold);
            bankedRing = CreateRing("BankedEnergy", Mint);
            for (int i = 0; i < CrystalLimit; i++) crystals[i] = CreateCrystal("CarriedCrystal", Gold);
            for (int i = 0; i < SparkLimit; i++) sparks[i] = new Spark { Transform = CreateCrystal("Spark", Gold) };
            for (int i = 0; i < RingLimit; i++) rings[i] = new Ring { Line = CreateRing("Pulse", Mint) };
            for (int i = 0; i < PetalCount; i++) petals[i] = CreateCrystal("FlowerPetal", i % 2 == 0 ? Gold : Mint);
            for (int i = 0; i < voices.Length; i++)
            {
                voices[i] = root.AddComponent<AudioSource>();
                voices[i].playOnAwake = false;
                voices[i].spatialBlend = 0f;
                voices[i].volume = 0.18f;
                voices[i].mute = muted;
                voices[i].ignoreListenerPause = false;
                voices[i].ignoreListenerVolume = false;
                tones[i] = CreateTone(i);
            }
            return true;
        }

        private Transform CreateCrystal(string name, Color color)
        {
            var go = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer)) { layer = 2 };
            go.transform.SetParent(root.transform, false);
            go.GetComponent<MeshFilter>().sharedMesh = crystalMesh;
            ConfigureRenderer(go.GetComponent<Renderer>(), color);
            go.SetActive(false);
            return go.transform;
        }

        private LineRenderer CreateRing(string name, Color color)
        {
            var go = new GameObject(name, typeof(LineRenderer)) { layer = 2 };
            go.transform.SetParent(root.transform, false);
            var line = go.GetComponent<LineRenderer>();
            ConfigureRenderer(line, color);
            line.useWorldSpace = false;
            line.loop = false;
            line.positionCount = RingSegments + 1;
            line.widthMultiplier = 0.04f;
            line.numCapVertices = 2;
            line.numCornerVertices = 2;
            line.alignment = LineAlignment.View;
            go.SetActive(false);
            return line;
        }

        private void ConfigureRenderer(Renderer renderer, Color color)
        {
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.lightProbeUsage = LightProbeUsage.Off;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
            SetColor(renderer, color);
        }

        private void SetColor(Renderer renderer, Color color)
        {
            properties.Clear();
            properties.SetColor("_BaseColor", color);
            properties.SetColor("_Color", color);
            properties.SetColor("_EmissionColor", color * 0.6f);
            renderer.SetPropertyBlock(properties);
        }

        private static void DrawArc(LineRenderer line, float radius, float fraction)
        {
            for (int i = 0; i <= RingSegments; i++)
            {
                float angle = i / (float)RingSegments * Mathf.PI * 2f * fraction - Mathf.PI * 0.5f;
                line.SetPosition(i, new Vector3(Mathf.Cos(angle) * radius, 0f, Mathf.Sin(angle) * radius));
            }
        }

        private static Mesh CreateCrystalMesh()
        {
            var points = new[] { Vector3.up, Vector3.down, Vector3.right, Vector3.forward, Vector3.left, Vector3.back };
            var faces = new[] { 0, 3, 2, 0, 4, 3, 0, 5, 4, 0, 2, 5, 1, 2, 3, 1, 3, 4, 1, 4, 5, 1, 5, 2 };
            var vertices = new Vector3[faces.Length];
            var triangles = new int[faces.Length];
            for (int i = 0; i < faces.Length; i++) { vertices[i] = points[faces[i]]; triangles[i] = i; }
            var mesh = new Mesh { name = "CourtyardFeedbackCrystal_Runtime", vertices = vertices, triangles = triangles };
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        private static AudioClip CreateTone(int kind)
        {
            const int rate = 22050;
            float duration = kind == 3 ? 0.9f : kind == 2 ? 0.52f : 0.3f;
            var samples = new float[Mathf.CeilToInt(rate * duration)];
            float phase = 0f;
            for (int i = 0; i < samples.Length; i++)
            {
                float t = i / (float)rate;
                float progress = t / duration;
                float frequency = kind == 1 ? Mathf.Lerp(330f, 140f, progress) : kind == 2 ? 440f * Mathf.Pow(2f, Mathf.Floor(t / 0.13f) / 4f) : kind == 3 ? 523.25f : 659.25f;
                phase += Mathf.PI * 2f * frequency / rate;
                float envelope = Mathf.Min(1f, t / 0.012f) * Mathf.Pow(1f - progress, 2f);
                float tone = Mathf.Sin(phase) * 0.65f + Mathf.Sin(phase * 2f) * 0.12f;
                if (kind == 3) tone += Mathf.Sin(2f * Mathf.PI * 659.25f * t) * 0.18f + Mathf.Sin(2f * Mathf.PI * 783.99f * t) * 0.12f;
                samples[i] = tone * envelope * 0.32f;
            }
            var clip = AudioClip.Create("CourtyardFeedbackTone_" + kind, samples.Length, 1, rate, false);
            clip.SetData(samples, 0);
            return clip;
        }

        private void PlayTone(int kind, float pitch)
        {
            // Arrival can bank, then complete in the same frame. Both milestone
            // sounds have priority over the ordinary landing pulse.
            if (kind < 2 && Time.unscaledTime < nextSoundTime) return;
            nextSoundTime = Time.unscaledTime + 0.065f;
            var voice = voices[nextVoice];
            nextVoice = (nextVoice + 1) % voices.Length;
            voice.Stop();
            voice.clip = tones[kind];
            voice.pitch = pitch;
            voice.Play();
        }

        private void OnDisable() => ReleaseResources();
        private void OnDestroy() => ReleaseResources();

        private void ReleaseResources()
        {
            ResetFeedback();
            if (root != null) { root.SetActive(false); DestroyOwned(root); }
            if (material != null) DestroyOwned(material);
            if (crystalMesh != null) DestroyOwned(crystalMesh);
            for (int i = 0; i < tones.Length; i++)
            {
                if (tones[i] != null) DestroyOwned(tones[i]);
                tones[i] = null;
                voices[i] = null;
            }
            root = null;
            material = null;
            crystalMesh = null;
            stabilityRing = chargeRing = bankedRing = null;
            properties = null;
            for (int i = 0; i < sparks.Length; i++) sparks[i] = null;
            for (int i = 0; i < rings.Length; i++) rings[i] = null;
            for (int i = 0; i < crystals.Length; i++) crystals[i] = null;
            for (int i = 0; i < petals.Length; i++) petals[i] = null;
            nextSpark = nextRing = nextVoice = 0;
        }

        private static void DestroyOwned(Object owned)
        {
            if (Application.isPlaying) Destroy(owned);
            else DestroyImmediate(owned);
        }
    }
}
