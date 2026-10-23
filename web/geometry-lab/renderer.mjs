// The player's view: the current 3D section, ray-traced analytically.
// Bodies are frosted glass tinted by where they live in W; the floor carries
// the pattern of the parallel-world layer the slice is in.
import { MAX_BODIES_PER_TYPE, createProgram, uniformLocations, fitCanvas, Orbit, watchContext, GLSL_BOX, GLSL_PATTERN } from './gl-core.mjs';
import { SCENE_DETAILS } from './scene-details.mjs';

const MAX = MAX_BODIES_PER_TYPE;

const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform vec3 uEye;
uniform float uLookY;
uniform vec4 uSph[${MAX}];
uniform vec3 uSphTint[${MAX}];
uniform float uSphRole[${MAX}];
uniform vec2 uSphGhost[${MAX}];
uniform float uSphCount;
uniform vec3 uBoxC[${MAX}];
uniform vec4 uBoxH[${MAX}];
uniform vec3 uBoxTint[${MAX}];
uniform float uBoxRole[${MAX}];
uniform float uBoxCount;
uniform vec4 uToken;
uniform vec4 uActor;
uniform vec2 uActorPos;
uniform vec4 uItem;
uniform vec4 uSocket;
uniform vec4 uLatch;
uniform vec4 uRelayPorts;
uniform float uRelayUsed;
uniform vec3 uPowerFx;
uniform vec3 uLatchFx;
uniform vec4 uStation;
uniform vec4 uEntrance;
uniform vec4 uChannel;
uniform float uProps;
uniform vec4 uGoal;
uniform vec3 uStart;
uniform vec3 uBounds;
uniform vec3 uTrail[8];
uniform vec4 uRipples[4];
uniform vec3 uRippleTint[4];
uniform vec4 uLayerA;
uniform vec4 uLayerB;
uniform float uLayerMix;

const vec3 BG_LOW = vec3(0.014, 0.030, 0.037);
const vec3 BG_HIGH = vec3(0.042, 0.070, 0.079);
const vec3 IVORY = vec3(0.94, 0.92, 0.84);
const vec3 SHADOW_TINT = vec3(0.035, 0.065, 0.080);
const vec3 TOKEN = vec3(0.98, 0.94, 0.85);
const vec3 ALERT = vec3(0.96, 0.42, 0.36);
const vec3 GOLD = vec3(0.96, 0.77, 0.42);
const vec3 ITEM_COL = vec3(0.30, 0.94, 0.78);
const vec3 SUN_DIR = vec3(-0.52, 0.74, 0.40);
const vec3 SUN_COL = vec3(1.0, 0.87, 0.68);
const vec3 COOL_COL = vec3(0.32, 0.72, 0.82);
${GLSL_BOX}
${GLSL_PATTERN}

float wire(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
  return 1.0 - smoothstep(0.014, 0.034, length(p - a - ab * t));
}

// One pulse travels along an existing physical cable, then fades completely.
float cablePulse(vec2 p, vec2 a, vec2 b, vec3 fx, bool reverse) {
  if (fx.x < 0.0) return 0.0;
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
  float head = clamp(fx.x / 0.68, 0.0, 1.0);
  if (reverse) head = 1.0 - head;
  float side = length(p - a - ab * t);
  float along = abs(t - head) * length(ab);
  return exp(-side * side * 420.0 - along * along * 65.0) * fx.y;
}

float hitSphere(vec3 ro, vec3 rd, vec4 s) {
  if (s.w <= 0.00001) return -1.0;
  vec3 oc = ro - s.xyz;
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + s.w * s.w;
  if (h < 0.0) return -1.0;
  float t = -b - sqrt(h);
  return t > 0.0 ? t : -1.0;
}

// Ray vs capped vertical cone: y in [y0, y1], radius linearly from r0 to r1.
float hitCone(vec3 ro, vec3 rd, vec2 xz, float y0, float y1, float r0, float r1, out vec3 outN) {
  outN = vec3(0.0, 1.0, 0.0);
  float h = y1 - y0;
  float k = (r1 - r0) / h;
  vec2 ox = ro.xz - xz;
  float oy = ro.y - y0;
  float R0 = r0 + k * oy;
  float dR = k * rd.y;
  float a = dot(rd.xz, rd.xz) - dR * dR;
  float b = dot(ox, rd.xz) - R0 * dR;
  float c = dot(ox, ox) - R0 * R0;
  float disc = b * b - a * c;
  if (disc < 0.0) return -1.0;
  float s = sqrt(disc);
  for (int i = 0; i < 2; i += 1) {
    float t = (i == 0 ? (-b - s) : (-b + s)) / a;
    if (t <= 0.001) continue;
    float y = ro.y + rd.y * t;
    if (y >= y0 && y <= y1) {
      vec2 p = ox + rd.xz * t;
      outN = normalize(vec3(p.x, -k * length(p), p.y));
      return t;
    }
  }
  return -1.0;
}

// Analytical ray vs rotated octahedron crystal (4 slab intersections).
float hitCrystal(vec3 ro, vec3 rd, vec3 c, float r, out vec3 outN, out float outEdge) {
  outN = vec3(0.0, 1.0, 0.0);
  outEdge = 0.0;
  if (r <= 0.001) return -1.0;
  vec3 p0 = ro - c;
  vec3 d0 = rd;
  vec3 p = vec3(p0.x * 0.8 - p0.z * 0.6, p0.y * 0.72, p0.x * 0.6 + p0.z * 0.8);
  vec3 d = vec3(d0.x * 0.8 - d0.z * 0.6, d0.y * 0.72, d0.x * 0.6 + d0.z * 0.8);
  float s = r * 1.18;
  float tN = -1e5;
  float tF = 1e5;
  vec3 nLocal = vec3(0.0, 1.0, 0.0);
  for (int k = 0; k < 4; k += 1) {
    vec3 nk = k == 0 ? vec3(1.0, 1.0, 1.0)
            : k == 1 ? vec3(1.0, 1.0, -1.0)
            : k == 2 ? vec3(1.0, -1.0, 1.0)
                     : vec3(-1.0, 1.0, 1.0);
    float pn = dot(p, nk);
    float dn = dot(d, nk);
    if (abs(dn) < 1e-5) {
      if (abs(pn) > s) return -1.0;
    } else {
      float t1 = (-s - pn) / dn;
      float t2 = (s - pn) / dn;
      float sgn = -1.0;
      if (t1 > t2) { float tmp = t1; t1 = t2; t2 = tmp; sgn = 1.0; }
      if (t1 > tN) { tN = t1; nLocal = nk * sgn; }
      if (t2 < tF) tF = t2;
    }
  }
  if (tN > tF || tF < 0.0) return -1.0;
  float t = tN > 0.0 ? tN : tF;
  vec3 hp = p + d * t;
  float e0 = abs(abs(hp.x) + abs(hp.y) - s);
  float e1 = abs(abs(hp.y) + abs(hp.z) - s);
  float e2 = abs(abs(hp.x) + abs(hp.z) - s);
  outEdge = 1.0 - smoothstep(0.0, r * 0.14, min(e0, min(e1, e2)));
  outN = normalize(vec3(nLocal.x * 0.8 + nLocal.z * 0.6, nLocal.y * 0.72, -nLocal.x * 0.6 + nLocal.z * 0.8));
  return t;
}

vec3 shadeCrystal(vec3 rd, vec3 n, float edge) {
  float sun = max(dot(n, SUN_DIR), 0.0);
  float side = max(dot(n, vec3(0.6, 0.2, 0.75)), 0.0);
  vec3 c = ITEM_COL * (0.42 + 0.48 * sun + 0.18 * side);
  c = mix(c, vec3(0.92, 1.0, 0.96), sun * 0.35 + edge * 0.65);
  return c;
}

${SCENE_DETAILS}

// Monument-Valley architectural tri-tone shading: distinct sunlit top, warm front
// wall with cornice & fluted pilasters, and cool-shadowed side wall.
vec3 archTone(vec3 base, vec3 n) {
  vec3 topCol = mix(base, IVORY, 0.46);
  vec3 leftCol = mix(base, IVORY, 0.16) * 0.92;
  vec3 rightCol = mix(base * 0.66, SHADOW_TINT, 0.34);
  if (n.y > 0.5) return topCol;
  if (n.y < -0.5) return rightCol * 0.7;
  return n.x < -0.1 || n.z > 0.1 ? leftCol : rightCol;
}

vec4 shadeHit(int kind, float t, vec3 ro, vec3 rd, vec3 hc, vec4 hh, vec3 tint, int role, bool behindSolid) {
  vec3 p = ro + rd * t;
  if (kind == 1) {
    vec3 n = normalize(p - hc);
    float sun = max(dot(n, SUN_DIR), 0.0);
    vec3 topCol = mix(tint, IVORY, 0.34);
    vec3 shdCol = mix(tint * 0.58, SHADOW_TINT, 0.34);
    vec3 c = mix(shdCol, topCol, smoothstep(-0.2, 0.65, dot(n, SUN_DIR)));
    c *= 0.90 + 0.10 * sun;
    float eq = 1.0 - smoothstep(0.008, 0.022, abs(n.y));
    float ring2 = 1.0 - smoothstep(0.008, 0.02, abs(abs(n.y) - 0.5));
    c = mix(c, GOLD, eq * 0.48 + ring2 * 0.22);
    c += IVORY * pow(max(dot(reflect(-SUN_DIR, n), -rd), 0.0), 32.0) * 0.22;
    if (role == 7) {
      // Mineral shell: broad cut-face shading, with the exact sphere silhouette
      // and radius left intact so changing W still reads as a true section.
      vec3 facetN = normalize(floor(n * 4.0 + 0.5));
      vec3 mineral = mix(vec3(0.39, 0.50, 0.51), tint, 0.20);
      c = detailLight(mineral, facetN, rd, 0.35);
      float vein = 1.0 - smoothstep(0.008, 0.035, abs(n.y + n.x * 0.28 - 0.18));
      c = mix(c, IVORY * 0.85, vein * 0.48);
      c += pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * vec3(0.10, 0.16, 0.17);
    }
    float alpha = behindSolid ? 0.48 : 0.90;
    return vec4(c, alpha);
  }
  vec3 n = boxNormal(p, hc, hh.xyz);
  float wEdge = clamp((hh.w - 0.2) / 0.8, 0.0, 1.0);
  float edgeDist = boxEdge(p, hc, hh.xyz);
  float bevel = 1.0 - smoothstep(0.0, 0.030, edgeDist);
  vec3 c;
  float alpha = 0.90;

  if (role == 1) {
    // Powered gate: dark conductor bronze with cool capacitive ribs and pins.
    vec3 copper = vec3(0.44, 0.245, 0.165);
    vec3 base = mix(copper, tint * 0.42, 0.15);
    float ribs = smoothstep(0.52, 0.96, abs(sin(p.z * 38.0 + p.y * 2.2)));
    float pins = smoothstep(0.86, 0.99, abs(sin(p.x * 22.0 + p.z * 7.0)));
    c = archTone(base, n) * (0.80 + 0.20 * ribs);
    c = mix(c, vec3(0.27, 0.84, 0.93), ribs * 0.12 * (0.55 + 0.45 * wEdge));
    c = mix(c, vec3(0.72, 0.92, 0.95), pins * 0.07);
    c = mix(c, IVORY, bevel * 0.20);
    alpha = 0.94;
  } else if (role == 2 || role == 5) {
    // Phase wall: compressed mineral bands. It stays solid exactly where it
    // exists; its edge is crisp so a powered gate behind it never reads open.
    vec3 mineral = mix(role == 5 ? vec3(0.37, 0.49, 0.50) : vec3(0.55, 0.47, 0.43), tint, 0.16);
    float bands = 0.5 + 0.5 * sin(p.y * 46.0 + p.z * 4.0);
    c = mix(mineral * 0.64, mineral * 1.14, bands);
    float seam = smoothstep(0.68, 0.99, abs(sin(p.y * 11.0 + p.z * 3.2)));
    c = mix(c, role == 5 ? IVORY : vec3(0.92, 0.42, 0.33), seam * 0.22);
    float facet = 1.0 - smoothstep(0.0, 0.055, abs(fract((p.y + p.z) * 2.5) - 0.5));
    c = mix(c, mix(mineral, IVORY, 0.60), facet * 0.22);
    c = mix(c, mix(vec3(0.10, 0.11, 0.11), tint, 0.28), bevel * 0.60);
    float topEdge = 1.0 - smoothstep(0.0, 0.04, (hc.y + hh.y) - p.y);
    c = mix(c, mix(tint, IVORY, 0.54), topEdge * 0.32);
    // Energised frame: power reaches the north opening even while this
    // mineral wall is still solid at the current W.
    float sideEdge = 1.0 - smoothstep(0.018, 0.055, min(abs(p.z - (hc.z - hh.z)), abs(p.z - (hc.z + hh.z))));
    float lintel = 1.0 - smoothstep(0.018, 0.060, abs((hc.y + hh.y) - p.y - 0.018));
    float energised = (sideEdge + lintel * 0.55) * uSocket.w * (role == 2 ? 1.0 : 0.0);
    c = mix(c, vec3(0.30, 0.86, 0.96), energised * 0.82);
    alpha = 0.91;
  } else if (role == 3) {
    // Manual return gate: brass frame, with a lock bar at the centre.
    vec3 brass = vec3(0.44, 0.33, 0.16);
    vec3 base = mix(brass, tint * 0.32, 0.16);
    c = archTone(base, n);
    float pin = 1.0 - smoothstep(0.018, 0.060, abs(p.z - hc.z));
    float brace = 1.0 - smoothstep(0.012, 0.038, abs((hc.y + hh.y) - p.y - 0.10));
    c = mix(c, mix(GOLD, ITEM_COL, 0.24), pin * 0.52 + brace * 0.28);
    c = mix(c, IVORY, bevel * 0.32);
    alpha = 0.93;
  } else if (role == 6) {
    // Dressed slate blocks give the W channel a different material family
    // from the bronze mechanisms. Seams are surface ink, not extra geometry.
    vec3 slate = mix(vec3(0.25, 0.36, 0.38), tint, 0.10);
    c = archTone(slate, n);
    float topDist = hc.y + hh.y - p.y;
    float cap = 1.0 - smoothstep(0.07, 0.10, topDist);
    float row = floor(p.y / 0.22);
    float joint = min(abs(fract(p.x / 0.44 + mod(row, 2.0) * 0.5) - 0.5) * 0.44,
      abs(fract(p.y / 0.22) - 0.5) * 0.22);
    c *= 0.94 + 0.06 * sin(floor(p.x / 0.44) * 3.1 + row * 2.7);
    c = mix(c, slate * 0.48, (1.0 - smoothstep(0.003, 0.012, joint)) * (1.0 - cap) * 0.52);
    c = mix(c, vec3(0.72, 0.79, 0.75), cap * 0.62 + bevel * 0.18);
    alpha = 0.95;
  } else {
    vec3 base = mix(tint * 0.66 + vec3(0.105, 0.125, 0.122), IVORY * 0.42, 0.10);
    c = archTone(base, n);
    if (n.y > 0.5) {
      float inner = 1.0 - smoothstep(0.005, 0.016, abs(edgeDist - 0.045));
      c = mix(c, IVORY, bevel * 0.42 + inner * 0.22);
    } else {
      float topDist = (hc.y + hh.y) - p.y;
      float cornice = 1.0 - smoothstep(0.0, 0.055, topDist);
      float corniceLine = 1.0 - smoothstep(0.004, 0.014, abs(topDist - 0.065));
      float flute = sin((p.x + p.z) * 14.0) * 0.026;
      c += flute * c;
      c = mix(c, mix(tint, IVORY, 0.38), cornice * 0.42 + corniceLine * 0.32 + bevel * 0.26);
    }
    if (wEdge < 0.95) {
      float stripe = 0.5 + 0.5 * sin((p.x + p.y * 1.6 + p.z) * 20.0);
      c = mix(c, IVORY, (1.0 - wEdge) * stripe * 0.22);
    }
    if (role == 4) {
      // The permanent divider gets a cool shadow line at its foot.
      float foot = 1.0 - smoothstep(0.0, 0.05, p.y);
      c = mix(c, COOL_COL * 0.55, foot * 0.20);
    }
    alpha = 0.86 + 0.10 * wEdge;
  }

  if (behindSolid) alpha = min(alpha, 0.48);
  return vec4(c, clamp(alpha, 0.0, 0.96));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  vec3 look = vec3(0.0, uLookY, 0.0);
  vec3 forward = normalize(look - uEye);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  // Telephoto lens (4.3) gives Monument Valley's clean near-isometric proportions.
  vec3 rd = normalize(forward * 4.3 + right * uv.x + up * uv.y);
  vec3 ro = uEye;
  vec3 layerTint = mix(uLayerA.rgb, uLayerB.rgb, uLayerMix);
  float skyGrad = clamp(uv.y * 0.55 + 0.5, 0.0, 1.0);
  vec3 skyLow = mix(BG_LOW, layerTint * 0.20, 0.28);
  vec3 skyHigh = mix(BG_HIGH, mix(layerTint, IVORY, 0.30) * 0.34, 0.34);
  vec3 bg = mix(skyLow, skyHigh, skyGrad);
  bg += SUN_COL * 0.055 * exp(-length(uv - vec2(-0.52, 0.44)) * 1.55);
  bg += layerTint * 0.018 * exp(-length(uv - vec2(0.55, -0.28)) * 2.2);
  vec3 color = bg;

  // Sculpted 3D floating architectural plinth instead of an infinite dark grid.
  vec2 plinthHalfXZ = uBounds.z > 0.5 ? (uBounds.xy + vec2(0.28)) : vec2(2.6, 2.0);
  vec3 plinthC = vec3(0.0, -0.68, 0.0);
  vec3 plinthH = vec3(plinthHalfXZ.x, 0.68, plinthHalfXZ.y);
  vec2 plinthSpan = boxSpan(ro, rd, plinthC, plinthH);
  float floorT = 10000.0;
  if (plinthSpan.x > 0.0) {
    floorT = plinthSpan.x;
    vec3 p = ro + rd * floorT;
    vec3 pn = boxNormal(p, plinthC, plinthH);
    vec3 deckBase = mix(vec3(0.105, 0.140, 0.148), layerTint * 0.26 + vec3(0.038, 0.058, 0.062), 0.52);
    if (pn.y < 0.5) {
      // Cliff sides of the floating island: tri-tone masonry + upper cornice lip
      vec3 sideCol = archTone(deckBase, pn);
      float lip = 1.0 - smoothstep(0.0, 0.07, -p.y);
      float course = 1.0 - smoothstep(0.0, 0.015, abs(fract(p.y * 3.5) - 0.5) - 0.44);
      sideCol = mix(sideCol, mix(deckBase, IVORY, 0.4), lip * 0.45);
      sideCol *= 1.0 - course * 0.08;
      if (uSocket.z >= 0.0) {
        float across = abs(pn.x) > 0.5 ? p.z : p.x;
        float joint = 1.0 - smoothstep(0.006, 0.024, abs(fract(across / 0.72 + floor(-p.y / 0.28) * 0.5) - 0.5));
        sideCol *= 1.0 - joint * 0.12;
        float belt = 1.0 - smoothstep(0.02, 0.045, abs(p.y + 0.24));
        sideCol = mix(sideCol, vec3(0.37, 0.25, 0.16), belt * 0.65);
        float rivet = 1.0 - smoothstep(0.018, 0.033, length(vec2(fract(across / 0.72) - 0.5, (p.y + 0.24) * 1.4)));
        sideCol = mix(sideCol, GOLD * 0.60, rivet * 0.80);
      }
      float depthFade = clamp(1.0 + p.y * 0.72, 0.15, 1.0);
      color = mix(bg, sideCol, depthFade);
    } else {
      float lw = 0.032;
      float pa = pattern(uLayerA.w, p.xz, lw);
      float pb = pattern(uLayerB.w, p.xz, lw);
      // Crisp stone tile seams + layer inlay pattern
      vec2 tile = abs(fract(p.xz * 2.0) - 0.5);
      float seam = 1.0 - smoothstep(0.0, 0.025, 0.5 - max(tile.x, tile.y));
      vec3 fl = mix(deckBase, IVORY, 0.18) * (1.0 - seam * 0.08);
      if (uSocket.z >= 0.0) {
        // Quiet, staggered paving instead of a uniform fine grid. No marks
        // reveal a route sequence or a location where W is safe to change.
        float row = floor(p.z / 0.48);
        vec2 cell = vec2(p.x / 0.76 + mod(row, 2.0) * 0.5, p.z / 0.48);
        vec2 edge = min(fract(cell), 1.0 - fract(cell)) * vec2(0.76, 0.48);
        float grout = 1.0 - smoothstep(0.004, 0.014, min(edge.x, edge.y));
        float grain = sin(floor(cell.x) * 7.1 + row * 4.7) * 0.018;
        fl = mix(deckBase, vec3(0.64, 0.63, 0.55), 0.31) + grain;
        fl *= 1.0 - grout * 0.22;
        fl = stationFloorDetails(p.xz, fl);
        if (uChannel.w > 0.0 && p.x >= uChannel.x && p.x <= uChannel.y && abs(p.z - uChannel.z) < uChannel.w) {
          float slab = 1.0 - smoothstep(0.004, 0.018, abs(fract((p.x - uChannel.x) / 0.55) - 0.5) * 0.55);
          fl = mix(fl, vec3(0.30, 0.39, 0.40), 0.50) * (1.0 - slab * 0.18);
          float trim = 1.0 - smoothstep(0.008, 0.023, abs(abs(p.z - uChannel.z) - (uChannel.w - 0.08)));
          fl = mix(fl, vec3(0.63, 0.72, 0.68), trim * 0.30);
        }
      }
      if (uBounds.z > 0.5) {
        vec2 out2 = abs(p.xz) - uBounds.xy;
        float maxOut = max(out2.x, out2.y);
        float rimBand = smoothstep(-0.04, 0.02, maxOut);
        float borderLine = 1.0 - smoothstep(0.006, 0.022, abs(maxOut));
        fl = mix(fl, mix(deckBase, IVORY, 0.36), rimBand * 0.35 + borderLine * 0.45);
      }
      fl = mix(fl, mix(uLayerA.rgb, uLayerB.rgb, uLayerMix) * 0.68 + IVORY * 0.14, (pa * (1.0 - uLayerMix) + pb * uLayerMix) * 0.11);
      if (uStart.z > 0.5) {
        float sd = length(p.xz - uStart.xy);
        fl = mix(fl, IVORY, 0.28 * (1.0 - smoothstep(0.01, 0.025, abs(sd - 0.2))));
      }
      if (uGoal.w > -1.5) {
        float gd = length(p.xz - uGoal.xy);
        float outerRing = 1.0 - smoothstep(0.01, 0.026, abs(gd - uGoal.z));
        vec2 gq = abs(p.xz - uGoal.xy);
        float innerSocket = 1.0 - smoothstep(0.008, 0.022, abs((gq.x + gq.y) - 0.15));
        if (uGoal.w > 0.0) {
          float strength = min(uGoal.w, 1.0);
          float boost = uGoal.w > 1.5 ? 1.35 : (0.7 + 0.35 * strength);
          float fill = 1.0 - smoothstep(uGoal.z * 0.65, uGoal.z, gd);
          fl = mix(fl, GOLD * 1.08, clamp((outerRing * 0.9 + innerSocket * 0.8 + fill * 0.32) * boost, 0.0, 1.0));
        } else {
          float dash = step(0.45, fract(atan(p.z - uGoal.y, p.x - uGoal.x) * 3.82));
          fl = mix(fl, GOLD, (outerRing * dash + innerSocket * 0.4) * (-uGoal.w) * 0.65);
        }
      }
      if (uStation.x >= 0.0) {
        // Progress is engraved on the receiver: square stone, round copper.
        for (int k = 0; k < 2; k += 1) {
          vec2 pos = uGoal.xy + vec2(k == 0 ? -0.22 : 0.22, 0.52);
          vec2 q = abs(p.xz - pos);
          float d = k == 0 ? max(q.x, q.y) : length(q);
          float earned = k == 0 ? uStation.z : uStation.w;
          float rim = 1.0 - smoothstep(0.006, 0.018, abs(d - 0.11));
          float core = k == 0 ? (1.0 - smoothstep(0.028, 0.045, max(q.x, q.y)))
            : (1.0 - smoothstep(0.012, 0.025, q.y)) * (1.0 - smoothstep(0.04, 0.06, q.x));
          vec3 ink = k == 0 ? vec3(0.78, 0.87, 0.84) : GOLD;
          fl = mix(fl, ink, clamp(rim * mix(0.25, 0.9, earned) + core * earned, 0.0, 1.0));
        }
        // The airlock mark appears only after a successful opening, then rests.
        vec2 bay = vec2(mix(uChannel.x, uChannel.y, 0.45), uChannel.z);
        float pad = 1.0 - smoothstep(0.01, 0.028, abs(length(p.xz - bay) - 0.42));
        fl = mix(fl, IVORY, pad * uStation.x * 0.42);
        vec2 entry = abs(p.xz - uEntrance.xy) - uEntrance.zw;
        float outline = 1.0 - smoothstep(0.012, 0.032, abs(max(entry.x, entry.y)));
        fl = mix(fl, IVORY, outline * uStation.y * 0.9);
      }
      if (abs(uItem.w) > 0.001) {
        vec2 iq = abs(p.xz - uItem.xz);
        float idist = (iq.x + iq.y) * 0.72;
        float irad = abs(uItem.w);
        float iRing = 1.0 - smoothstep(0.008, 0.024, abs(idist - irad));
        float iDash = uItem.w > 0.0 ? 1.0 : step(0.45, fract((p.x - p.z) * 6.0));
        fl = mix(fl, ITEM_COL, iRing * iDash * 0.75);
      }
      if (uSocket.z >= 0.0) {
        vec3 blue = vec3(0.28, 0.79, 0.92);
        float d = length(p.xz - uSocket.xy);
        float ring = 1.0 - smoothstep(0.012, 0.030, abs(d - 0.62));
        float inner = 1.0 - smoothstep(0.012, 0.028, abs(d - 0.22));
        float basin = 1.0 - smoothstep(0.08, 0.19, d);
        float ang = atan(p.z - uSocket.y, p.x - uSocket.x);
        float prong = smoothstep(0.58, 0.92, abs(sin(ang * 1.5))) * (1.0 - smoothstep(0.10, 0.17, d));
        float cable = wire(p.xz, uSocket.xy, uRelayPorts.xy);
        float power = mix(mix(0.20, 0.62, uRelayUsed), 0.95, uSocket.w);
        float pool = exp(-d * d * 6.0) * (0.10 + 0.45 * uSocket.w);
        fl += blue * pool * 0.30;
        // Copper sheath under the existing cable; blue remains its power state.
        fl = mix(fl, vec3(0.53, 0.33, 0.19), wire(p.xz + vec2(0.0, 0.045), uSocket.xy, uRelayPorts.xy) * 0.60);
        fl = mix(fl, vec3(0.53, 0.33, 0.19), wire(p.xz - vec2(0.0, 0.045), uSocket.xy, uRelayPorts.xy) * 0.60);
        fl = mix(fl, mix(GOLD, blue, uSocket.w), cable * power * 0.88);
        fl = mix(fl, blue, uSocket.z * (ring * 0.90 + inner * 0.42 + prong * 0.55));
        fl = mix(fl, IVORY, ring * max(uStation.y, 0.0) * 0.85);
        fl = mix(fl, blue * 0.42, uSocket.z * basin * 0.42);
        float pin = 1.0 - smoothstep(0.032, 0.060, length(p.xz - uRelayPorts.xy));
        fl = mix(fl, mix(blue * 0.35, IVORY, uSocket.w), pin * 0.85);
        // Powered threshold: a cool bar across the actual north opening.
        float gap = 1.0 - smoothstep(0.44, 0.54, abs(p.z - uRelayPorts.y));
        float bar = 1.0 - smoothstep(0.045, 0.095, abs(abs(p.x) - 0.17));
        fl = mix(fl, blue, gap * bar * (0.10 + 0.72 * uSocket.w));
        float pulse = cablePulse(p.xz, uSocket.xy, uRelayPorts.xy, uPowerFx, uSocket.w < 0.5);
        fl += mix(GOLD, vec3(0.55, 0.94, 1.0), uSocket.w) * pulse * 0.72;
        if (uPowerFx.x >= 0.0) {
          float arrival = uSocket.w > 0.5 ? smoothstep(0.38, 0.68, uPowerFx.x) : 1.0 - smoothstep(0.0, 0.32, uPowerFx.x);
          fl += mix(GOLD, blue, uSocket.w) * gap * bar * arrival * uPowerFx.y * 0.65;
        }
      }
      if (uLatch.z >= 0.0) {
        vec2 q = abs(p.xz - uLatch.xy);
        float halo = 1.0 - smoothstep(0.012, 0.030, abs(length(q) - 0.62));
        float plate = 1.0 - smoothstep(0.010, 0.028, abs(max(q.x, q.y) - 0.23));
        float inner = 1.0 - smoothstep(0.010, 0.026, abs(max(q.x, q.y) - 0.15));
        float handle = wire(p.xz, uLatch.xy + vec2(-0.12, -0.10 + uLatch.w * 0.20), uLatch.xy + vec2(0.12, -0.10 + uLatch.w * 0.20));
        float lock = 1.0 - smoothstep(0.030, 0.060, length(p.xz - uLatch.xy - vec2(0.0, 0.055)));
        float cable = wire(p.xz, uLatch.xy, uRelayPorts.zw);
        fl = mix(fl, GOLD, cable * mix(0.16, 0.88, uLatch.w));
        fl = mix(fl, GOLD, halo * uLatch.z * 0.85);
        fl = mix(fl, mix(GOLD, ITEM_COL, uLatch.w * 0.55), (plate * 0.85 + inner * 0.30 + handle * 0.60) * uLatch.z);
        fl = mix(fl, mix(ALERT * 0.75, GOLD, uLatch.w), lock * uLatch.z * 0.55);
        // Latched threshold: warm-gold bar stays open across the south opening.
        float rgap = 1.0 - smoothstep(0.50, 0.60, abs(p.z - uRelayPorts.w));
        float rbar = 1.0 - smoothstep(0.045, 0.095, abs(abs(p.x) - 0.17));
        fl = mix(fl, mix(GOLD, ITEM_COL, 0.32), rgap * rbar * (0.10 + 0.72 * uLatch.w));
        fl += mix(GOLD, IVORY, 0.45) * cablePulse(p.xz, uLatch.xy, uRelayPorts.zw, uLatchFx, false) * 0.85;
        if (uLatchFx.x >= 0.0) fl += GOLD * rgap * rbar * smoothstep(0.35, 0.65, uLatchFx.x) * uLatchFx.y * 0.65;
      }
      for (int i = 0; i < 8; i += 1) {
        if (uTrail[i].z <= 0.001) break;
        float td = length(p.xz - uTrail[i].xy);
        fl = mix(fl, IVORY, uTrail[i].z * 0.45 * (1.0 - smoothstep(0.025, 0.075, td)));
      }
      for (int i = 0; i < 4; i += 1) {
        if (uRipples[i].w < 0.5) break;
        float rr = length(p.xz - uRipples[i].xy);
        float prog = uRipples[i].z;
        fl += uRippleTint[i] * (1.0 - smoothstep(0.018, 0.075, abs(rr - prog * 1.8))) * (1.0 - prog) * 0.55;
      }
      // Cast directional sun shadows & ambient occlusion from spheres and architectural walls.
      float shadow = 0.0;
      for (int i = 0; i < ${MAX}; i += 1) {
        if (float(i) >= uSphCount) break;
        vec4 s = uSph[i];
        vec2 sg = uSphGhost[i];
        if (sg.y > 0.001) {
          float gd = abs(length(p.xz - s.xz) - sg.x);
          float dash = step(0.45, fract(atan(p.z - s.z, p.x - s.x) * 3.82));
          fl = mix(fl, uSphTint[i], sg.y * dash * (1.0 - smoothstep(0.008, 0.026, gd)) * 0.75);
        }
        if (s.w < 0.0001) continue;
        if (hitSphere(p + vec3(0.0, 0.01, 0.0), SUN_DIR, s) > 0.0) shadow = max(shadow, 0.75);
        float ao = exp(- dot(p.xz - s.xz, p.xz - s.xz) / (s.w * s.w * 0.9 + 0.04));
        shadow = max(shadow, ao * 0.5);
      }
      for (int i = 0; i < ${MAX}; i += 1) {
        if (float(i) >= uBoxCount) break;
        vec4 h = uBoxH[i];
        if (h.w < -0.001) {
          float ghost = -h.w;
          vec2 d0 = abs(p.xz - uBoxC[i].xz) - h.xz;
          float outline = 1.0 - smoothstep(0.008, 0.025, abs(max(d0.x, d0.y)));
          float dash = step(0.42, fract((p.x + p.z) * 5.0));
          fl = mix(fl, uBoxTint[i], ghost * outline * dash * 0.7);
          continue;
        }
        if (h.y < 0.001 || h.w < 0.001) continue;
        float wEdge = clamp((h.w - 0.2) / 0.8, 0.0, 1.0);
        vec2 spanSh = boxSpan(p + vec3(0.0, 0.01, 0.0), SUN_DIR, uBoxC[i], h.xyz);
        if (spanSh.x > 0.0) shadow = max(shadow, 0.72 * (0.4 + 0.6 * wEdge));
        vec2 dFloor = abs(p.xz - uBoxC[i].xz) - h.xz;
        float distF = length(max(dFloor, vec2(0.0)));
        shadow = max(shadow, exp(-distF * 12.0) * 0.45);
      }
      if (uToken.w > -0.5) {
        vec2 rel = p.xz - uToken.xy;
        float kd = length(rel);
        shadow = max(shadow, exp(-kd * kd * 28.0) * 0.55);
        vec3 tc = mix(IVORY, ALERT, clamp(uToken.w, 0.0, 1.0));
        vec3 ringCol = uActor.z > 0.5 ? ITEM_COL : tc;
        float footRing = 1.0 - smoothstep(0.007, 0.022, abs(kd - uToken.z));
        fl = mix(fl, ringCol, footRing * (uActor.z > 0.5 ? 0.85 : 0.55));
      }
      fl = mix(fl, fl * vec3(0.50, 0.56, 0.62), shadow);
      color = fl;
    }
  }

  float solidT = floorT;
  vec3 dressingCol;
  float dressingT = hitStationDressing(ro, rd, dressingCol);
  if (dressingT > 0.0 && dressingT < solidT) { solidT = dressingT; color = dressingCol; }
  // Devices are low surface fixtures at existing interaction markers. They
  // share the nearest-hit pass with the courier and core, never collision.
  if (uProps > 0.5) {
    vec3 deviceCol;
    float dt = hitSocket(ro, rd, deviceCol);
    if (dt > 0.0 && dt < solidT) { solidT = dt; color = deviceCol; }
    dt = hitLatch(ro, rd, deviceCol);
    if (dt > 0.0 && dt < solidT) { solidT = dt; color = deviceCol; }
    dt = hitReceiver(ro, rd, deviceCol);
    if (dt > 0.0 && dt < solidT) { solidT = dt; color = deviceCol; }
  }
  bool hitCharacterOrItem = false;
  if (uActor.w > 0.5) {
    vec3 actorCol;
    float tAct = hitActor(ro, rd, uActorPos, uActor.x, uActor.y, uActor.z, uToken.w, layerTint, actorCol);
    if (tAct > 0.0 && tAct < solidT) {
      solidT = tAct;
      color = actorCol;
      hitCharacterOrItem = true;
    }
  }
  if (uItem.w > 0.001) {
    vec3 cN;
    float cEdge;
    float tCr = hitCrystal(ro, rd, uItem.xyz, uItem.w, cN, cEdge);
    if (tCr > 0.0 && tCr < solidT) {
      solidT = tCr;
      color = shadeCrystal(rd, cN, cEdge);
      hitCharacterOrItem = true;
    }
  }

  float bestT = solidT;
  int kind = 0;
  float role = 0.0;
  vec3 hc = vec3(0.0);
  vec4 hh = vec4(0.0);
  vec3 tint = vec3(0.0);
  float bestT2 = solidT;
  int kind2 = 0;
  float role2 = 0.0;
  vec3 hc2 = vec3(0.0);
  vec4 hh2 = vec4(0.0);
  vec3 tint2 = vec3(0.0);
  for (int i = 0; i < ${MAX}; i += 1) {
    if (float(i) >= uSphCount) break;
    float t = hitSphere(ro, rd, uSph[i]);
    if (t > 0.0 && t < bestT) {
      bestT2 = bestT; kind2 = kind; role2 = role; hc2 = hc; hh2 = hh; tint2 = tint;
      bestT = t; kind = 1; role = uSphRole[i]; hc = uSph[i].xyz; hh = vec4(0.0, 0.0, 0.0, uSph[i].w); tint = uSphTint[i];
    } else if (t > 0.0 && t < bestT2) {
      bestT2 = t; kind2 = 1; role2 = uSphRole[i]; hc2 = uSph[i].xyz; hh2 = vec4(0.0, 0.0, 0.0, uSph[i].w); tint2 = uSphTint[i];
    }
  }
  for (int i = 0; i < ${MAX}; i += 1) {
    if (float(i) >= uBoxCount) break;
    if (uBoxH[i].y < 0.001 || uBoxH[i].w < 0.001) continue;
    vec2 span = boxSpan(ro, rd, uBoxC[i], uBoxH[i].xyz);
    // The unpowered conductor gate sits a hair inside the phase wall. Bias it
    // forward in the visual hit order so the closed brass ribs stay readable;
    // collision never uses this offset.
    float gateBias = (uBoxRole[i] > 0.5 && uBoxRole[i] < 1.5) ? 0.035 : 0.0;
    float tBox = span.x - gateBias;
    if (tBox > 0.0 && tBox < bestT) {
      bestT2 = bestT; kind2 = kind; role2 = role; hc2 = hc; hh2 = hh; tint2 = tint;
      bestT = tBox; kind = 2; role = uBoxRole[i]; hc = uBoxC[i]; hh = uBoxH[i]; tint = uBoxTint[i];
    } else if (tBox > 0.0 && tBox < bestT2) {
      bestT2 = tBox; kind2 = 2; role2 = uBoxRole[i]; hc2 = uBoxC[i]; hh2 = uBoxH[i]; tint2 = uBoxTint[i];
    }
  }
  if (kind2 > 0) {
    vec4 g2 = shadeHit(kind2, bestT2, ro, rd, hc2, hh2, tint2, int(role2), hitCharacterOrItem);
    color = mix(color, g2.rgb, g2.a * 0.88);
  }
  if (kind > 0) {
    vec4 g1 = shadeHit(kind, bestT, ro, rd, hc, hh, tint, int(role), hitCharacterOrItem);
    color = mix(color, g1.rgb, g1.a);
  }

  color *= 1.0 - 0.12 * pow(length(uv) / 1.7, 2.0);
  color = pow(max(color, vec3(0.0)), vec3(0.92));
  gl_FragColor = vec4(color, 1.0);
}
`;

const NAMES = ['uResolution', 'uEye', 'uLookY', 'uSph', 'uSphTint', 'uSphRole', 'uSphGhost', 'uSphCount', 'uBoxC', 'uBoxH', 'uBoxTint', 'uBoxRole', 'uBoxCount',
  'uToken', 'uActor', 'uActorPos', 'uItem', 'uSocket', 'uLatch', 'uRelayPorts', 'uRelayUsed', 'uPowerFx', 'uLatchFx', 'uStation', 'uEntrance', 'uChannel', 'uProps', 'uGoal', 'uStart', 'uBounds', 'uTrail', 'uRipples', 'uRippleTint', 'uLayerA', 'uLayerB', 'uLayerMix'];
const VIEW = { yaw: 0.66, pitch: 0.58, distance: 12.2, minPitch: 0.2, maxPitch: 1.35, minDistance: 7.5, maxDistance: 20 };

export class SliceRenderer {
  constructor(canvas, onError) {
    this.canvas = canvas;
    this.onError = onError;
    this.frame = null;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!this.gl) throw new Error('WebGL unavailable');
    this.initialize();
    this.orbit = new Orbit(canvas, VIEW, () => this.draw());
    new ResizeObserver(() => this.draw()).observe(canvas);
    watchContext(canvas, () => { this.lost = true; onError(true); }, () => {
      try { this.initialize(); this.lost = false; this.draw(); onError(false); } catch (error) { console.error(error); onError(true); }
    });
  }

  initialize() {
    this.program = createProgram(this.gl, FRAGMENT);
    this.u = uniformLocations(this.gl, this.program, NAMES);
  }

  resetView(view) { this.orbit.reset(view); }

  viewEye(aspect) {
    const lookY = this.frame?.field ? 0.4 : 1.2;
    const eye = this.orbit.eye(lookY, false);
    // A narrow desktop panel needs more horizontal room, not a cropped board.
    const scale = Math.max(1, 1.2 / aspect);
    return [eye[0] * scale, lookY + (eye[1] - lookY) * scale, eye[2] * scale];
  }

  // Project a 3D world point [x, y, z] into percentage coordinates on the canvas.
  project(point) {
    const box = this.canvas.getBoundingClientRect();
    if (!box.width || !box.height || !this.frame) return null;
    const aspect = box.width / box.height;
    const lookY = this.frame.field ? 0.4 : 1.2;
    const eye = this.viewEye(aspect);
    const fx = -eye[0];
    const fy = lookY - eye[1];
    const fz = -eye[2];
    const fl = Math.hypot(fx, fy, fz) || 1;
    const fwd = [fx / fl, fy / fl, fz / fl];
    const rl = Math.hypot(fwd[2], fwd[0]) || 1;
    const right = [-fwd[2] / rl, 0, fwd[0] / rl];
    const up = [
      right[1] * fwd[2] - right[2] * fwd[1],
      right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[1] - right[1] * fwd[0],
    ];
    const vx = point[0] - eye[0];
    const vy = point[1] - eye[1];
    const vz = point[2] - eye[2];
    const depth = vx * fwd[0] + vy * fwd[1] + vz * fwd[2];
    if (depth <= 0.2) return null;
    const uvX = ((vx * right[0] + vy * right[1] + vz * right[2]) / depth) * 4.3;
    const uvY = ((vx * up[0] + vy * up[1] + vz * up[2]) / depth) * 4.3;
    const xPct = (0.5 + uvX / (2 * aspect)) * 100;
    const yPct = (0.5 - uvY / 2) * 100;
    if (xPct < 2 || xPct > 98 || yPct < 2 || yPct > 98) return null;
    return { x: xPct, y: yPct };
  }

  render(frame) {
    this.frame = frame;
    this.draw();
  }

  draw() {
    if (this.lost || !this.frame || this.canvas.offsetParent === null) return;
    const size = fitCanvas(this.canvas);
    if (!size) return;
    const { gl, u, frame } = this;
    gl.viewport(0, 0, size.width, size.height);
    gl.uniform2f(u.uResolution, size.width, size.height);
    const lookY = frame.field ? 0.4 : 1.2;
    gl.uniform3f(u.uEye, ...this.viewEye(size.aspect));
    gl.uniform1f(u.uLookY, lookY);

    const sph = new Float32Array(MAX * 4);
    const sphTint = new Float32Array(MAX * 3);
    const sphRole = new Float32Array(MAX);
    const sphGhost = new Float32Array(MAX * 2);
    const boxC = new Float32Array(MAX * 3);
    const boxH = new Float32Array(MAX * 4);
    const boxTint = new Float32Array(MAX * 3);
    const boxRole = new Float32Array(MAX);
    let ns = 0;
    let nb = 0;
    let itemUniform = [0, 0, 0, 0];
    for (const s of frame.sections) {
      const ghostAmt = Number(s.ghost) || 0;
      const walkGhost = ghostAmt * (0.28 + 0.65 * (s.wGhost ?? 0));
      if (s.isItem) {
        if (!frame.token?.carrying) {
          const rad = s.radius > 0 ? s.radius : (walkGhost > 0 ? -s.maxR : 0);
          itemUniform = [s.center[0], s.center[1], s.center[2], rad];
        }
        continue;
      }
      if (s.type === 'box' && nb < MAX) {
        // Proportion walls as courtyard walls (height ~0.68) so the isometric camera sees inside rooms.
        const eps = nb * 0.0012;
        const visHalfY = Math.min(s.half[1], 0.34) - eps * 0.5;
        const visCenterY = visHalfY;
        boxC.set([s.center[0], visCenterY, s.center[2]], nb * 3);
        const wState = s.kind === 'box' ? 0.2 + 0.8 * (s.wEdge ?? 1) : (walkGhost > 0 ? -walkGhost : 0);
        boxH.set([s.half[0] - eps, visHalfY, s.half[2] - eps, wState], nb * 4);
        boxTint.set(s.tint, nb * 3);
        boxRole[nb] = s.role ?? 0;
        nb += 1;
      } else if (s.type === 'sphere' && ns < MAX) {
        // The dashed danger circle stays while the sphere is present but smaller.
        sph.set([...s.center, s.radius], ns * 4);
        sphGhost.set([s.maxR || 0.35, walkGhost], ns * 2);
        sphTint.set(s.tint, ns * 3);
        sphRole[ns] = s.role ?? 0;
        ns += 1;
      }
    }
    gl.uniform4fv(u.uSph, sph);
    gl.uniform3fv(u.uSphTint, sphTint);
    gl.uniform1fv(u.uSphRole, sphRole);
    gl.uniform2fv(u.uSphGhost, sphGhost);
    gl.uniform1f(u.uSphCount, ns);
    gl.uniform3fv(u.uBoxC, boxC);
    gl.uniform4fv(u.uBoxH, boxH);
    gl.uniform3fv(u.uBoxTint, boxTint);
    gl.uniform1fv(u.uBoxRole, boxRole);
    gl.uniform1f(u.uBoxCount, nb);

    const { field, token, goalState } = frame;
    const goalW = !field ? -2 : (token?.won ? 2 : (goalState?.open ? 0.25 + 0.75 * goalState.wEdge : -(goalState?.wGhost ?? 0.5)));
    gl.uniform4f(u.uToken, ...(token ? [token.pos[0], token.pos[1], field.tokenRadius, token.flash] : [0, 0, 0, -1]));
    gl.uniform4f(u.uActor, ...(token ? [token.yaw ?? 1.57, token.bob ?? 0, token.carrying ? 1 : 0, 1] : [0, 0, 0, 0]));
    // Only the courier mesh steps aside. Position, carry radius and collision
    // rings stay at the runtime coordinates.
    const actorPos = token ? [...token.pos] : [0, 0];
    if (token && frame.relay) {
      const device = [frame.relay.socket, frame.relay.latch].find((d) => Math.hypot(token.pos[0] - d.x, token.pos[1] - d.z) < d.reach);
      if (device) {
        const dx = token.pos[0] - device.x, dz = token.pos[1] - device.z;
        const distance = Math.hypot(dx, dz);
        const shift = 0.16 * (1 - distance / device.reach);
        actorPos[0] += (distance > 1e-6 ? dx / distance : -Math.sin(token.yaw ?? 0)) * shift;
        actorPos[1] += (distance > 1e-6 ? dz / distance : -Math.cos(token.yaw ?? 0)) * shift;
      }
    }
    gl.uniform2f(u.uActorPos, ...actorPos);
    gl.uniform4f(u.uItem, ...itemUniform);
    gl.uniform1f(u.uProps, field?.item ? 1 : 0);
    // Material inlay follows the authored channel walls, not a second route
    // definition or a safety hint. It never changes with the active W.
    const channel = frame.sections.filter(s => s.type === 'box' && s.role === 6);
    if (channel.length === 2) {
      const [a, b] = channel;
      gl.uniform4f(u.uChannel, Math.min(a.center[0] - a.half[0], b.center[0] - b.half[0]),
        Math.max(a.center[0] + a.half[0], b.center[0] + b.half[0]),
        (a.center[2] + b.center[2]) / 2,
        (Math.abs(a.center[2] - b.center[2]) - a.half[2] - b.half[2]) / 2);
    } else gl.uniform4f(u.uChannel, 0, 0, 0, -1);
    const relay = frame.relay;
    for (const [name, device, active] of [['uSocket', relay?.socket, relay?.powered], ['uLatch', relay?.latch, relay?.latched]]) {
      const visible = device ? (Math.abs(frame.w - device.w) <= device.wReach ? 1 : 0.28) : -1;
      gl.uniform4f(u[name], device?.x ?? 0, device?.z ?? 0, visible, active ? 1 : 0);
    }
    gl.uniform4f(u.uRelayPorts, ...(relay ? [...relay.powerPort, ...relay.returnPort] : [0, 0, 0, 0]));
    gl.uniform1f(u.uRelayUsed, relay?.used ? 1 : 0);
    for (const [uniform, key, settled] of [['uPowerFx', 'power', relay?.powered], ['uLatchFx', 'latch', relay?.latched]]) {
      const fx = frame.mechanismEffects?.[key];
      gl.uniform3f(u[uniform], fx?.progress ?? -1, fx?.strength ?? 0, fx?.pose ?? Number(Boolean(settled)));
    }
    const station = frame.station;
    gl.uniform4f(u.uStation, ...(station ? [station.airlock ? 1 : 0, station.cue, station.seals.stone ? 1 : 0, station.seals.copper ? 1 : 0] : [-1, 0, 0, 0]));
    const entrance = station && frame.sections.find((s) => s.id === 'station-middle-door');
    gl.uniform4f(u.uEntrance, ...(entrance ? [entrance.center[0], entrance.center[2], entrance.half[0], entrance.half[2]] : [0, 0, 0, 0]));
    gl.uniform4f(u.uGoal, ...(field ? [field.goal[0], field.goal[1], 0.3 - 0.06 * (token?.arrival ?? 0), goalW] : [0, 0, 0, -2]));
    gl.uniform3f(u.uStart, ...(field ? [field.start[0], field.start[1], 1] : [0, 0, 0]));
    gl.uniform3f(u.uBounds, ...(field ? [field.bounds.x, field.bounds.z, 1] : [0, 0, 0]));
    const trail = new Float32Array(24);
    (frame.trail ?? []).slice(-8).forEach((p, i) => trail.set(p, i * 3));
    gl.uniform3fv(u.uTrail, trail);
    const ripples = new Float32Array(16);
    const rippleTint = new Float32Array(12);
    (frame.ripples ?? []).slice(0, 4).forEach((r, i) => {
      ripples.set([r.x, r.z, r.progress, 1], i * 4);
      rippleTint.set(r.tint, i * 3);
    });
    gl.uniform4fv(u.uRipples, ripples);
    gl.uniform3fv(u.uRippleTint, rippleTint);
    const { a, b, t } = frame.layer;
    gl.uniform4f(u.uLayerA, ...a.color, a.pattern);
    gl.uniform4f(u.uLayerB, ...b.color, b.pattern);
    gl.uniform1f(u.uLayerMix, t);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
