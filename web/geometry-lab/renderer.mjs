// The player's view: the current 3D section, ray-traced analytically.
// Bodies are frosted glass tinted by where they live in W; the floor carries
// the pattern of the parallel-world layer the slice is in.
import { createProgram, uniformLocations, fitCanvas, Orbit, watchContext, GLSL_BOX, GLSL_PATTERN } from './gl-core.mjs';

const MAX = 8;

const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform vec3 uEye;
uniform float uLookY;
uniform vec4 uSph[${MAX}];
uniform vec3 uSphTint[${MAX}];
uniform vec2 uSphGhost[${MAX}];
uniform float uSphCount;
uniform vec3 uBoxC[${MAX}];
uniform vec4 uBoxH[${MAX}];
uniform vec3 uBoxTint[${MAX}];
uniform float uBoxCount;
uniform vec4 uToken;
uniform vec4 uActor;
uniform vec4 uItem;
uniform vec4 uSocket;
uniform vec4 uLatch;
uniform vec4 uRelayPorts;
uniform vec4 uGoal;
uniform vec3 uStart;
uniform vec3 uBounds;
uniform vec3 uTrail[8];
uniform vec4 uRipples[4];
uniform vec3 uRippleTint[4];
uniform vec4 uLayerA;
uniform vec4 uLayerB;
uniform float uLayerMix;

const vec3 BG_LOW = vec3(0.13, 0.15, 0.26);
const vec3 BG_HIGH = vec3(0.24, 0.22, 0.36);
const vec3 IVORY = vec3(0.98, 0.95, 0.90);
const vec3 SHADOW_TINT = vec3(0.16, 0.18, 0.32);
const vec3 TOKEN = vec3(0.99, 0.95, 0.88);
const vec3 ALERT = vec3(0.96, 0.42, 0.38);
const vec3 GOLD = vec3(0.98, 0.80, 0.42);
const vec3 ITEM_COL = vec3(0.28, 0.94, 0.78);
const vec3 SUN_DIR = vec3(-0.48, 0.78, 0.40);
${GLSL_BOX}
${GLSL_PATTERN}

float wire(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
  return 1.0 - smoothstep(0.014, 0.034, length(p - a - ab * t));
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

// Monument-Valley-inspired minimalist traveler: slender conical cloak, dark head,
// and an ivory conical hat/spire, plus the floating sacred octahedron when carrying.
float hitActor(vec3 ro, vec3 rd, vec2 pos, float yaw, float bob, float carrying, float flashAmt, vec3 layerTint, out vec3 outCol) {
  outCol = vec3(0.0);
  vec2 fwd = vec2(sin(yaw), cos(yaw));
  float tBest = 1e6;
  int part = 0;
  vec3 bestN = vec3(0.0, 1.0, 0.0);
  float cEdge = 0.0;

  vec3 nCone;
  // Conical cloak
  float tCloak = hitCone(ro, rd, pos, 0.03 + bob * 0.4, 0.45 + bob * 0.7, 0.165, 0.048, nCone);
  if (tCloak > 0.0 && tCloak < tBest) { tBest = tCloak; part = 1; bestN = nCone; }
  // Head sphere
  vec3 headC = vec3(pos.x, 0.49 + bob * 0.85, pos.y);
  float tHead = hitSphere(ro, rd, vec4(headC, 0.072));
  if (tHead > 0.0 && tHead < tBest) {
    tBest = tHead;
    part = 2;
    bestN = normalize(ro + rd * tHead - headC);
  }
  // Conical hat / spire (tilted slightly back along -fwd)
  vec2 hatXZ = pos - fwd * 0.022;
  float tHat = hitCone(ro, rd, hatXZ, 0.52 + bob, 0.78 + bob, 0.135, 0.012, nCone);
  if (tHat > 0.0 && tHat < tBest) { tBest = tHat; part = 3; bestN = nCone; }

  if (carrying > 0.5) {
    vec3 carryC = vec3(pos.x, 0.96 + bob * 1.1, pos.y);
    vec3 cn;
    float ce;
    float tCr = hitCrystal(ro, rd, carryC, 0.17, cn, ce);
    if (tCr > 0.0 && tCr < tBest) { tBest = tCr; part = 4; bestN = cn; cEdge = ce; }
  }

  if (part == 0) return -1.0;
  if (part == 4) {
    outCol = shadeCrystal(rd, bestN, cEdge);
    return tBest;
  }
  vec3 p = ro + rd * tBest;
  float sun = max(dot(bestN, SUN_DIR), 0.0);
  vec3 ivory = mix(IVORY, ALERT, clamp(flashAmt, 0.0, 1.0));
  if (part == 2) {
    // Dark minimal head with subtle rim
    outCol = vec3(0.11, 0.13, 0.22) + ivory * 0.15 * sun;
    return tBest;
  }
  // Tri-tone gouache shading on cloak and conical hat
  vec3 lit = ivory * 1.02;
  vec3 mid = mix(ivory * 0.86, layerTint, 0.16);
  vec3 shd = mix(ivory * 0.64, SHADOW_TINT, 0.38);
  vec3 col = sun > 0.45 ? mix(mid, lit, (sun - 0.45) / 0.55) : mix(shd, mid, sun / 0.45);
  if (part == 1) {
    float hem = 1.0 - smoothstep(0.0, 0.035, p.y - (0.03 + bob * 0.4));
    col = mix(col, mix(GOLD, layerTint, 0.4), hem * 0.65);
  } else if (part == 3) {
    float brim = 1.0 - smoothstep(0.0, 0.03, p.y - (0.52 + bob));
    col = mix(col, GOLD, brim * 0.55);
  }
  outCol = col;
  return tBest;
}

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

vec4 shadeHit(int kind, float t, vec3 ro, vec3 rd, vec3 hc, vec4 hh, vec3 tint, bool behindSolid) {
  vec3 p = ro + rd * t;
  if (kind == 1) {
    vec3 n = normalize(p - hc);
    float sun = max(dot(n, SUN_DIR), 0.0);
    vec3 topCol = mix(tint, IVORY, 0.38);
    vec3 shdCol = mix(tint * 0.62, SHADOW_TINT, 0.38);
    vec3 c = mix(shdCol, topCol, smoothstep(-0.2, 0.65, dot(n, SUN_DIR)));
    float eq = 1.0 - smoothstep(0.008, 0.022, abs(n.y));
    float ring2 = 1.0 - smoothstep(0.008, 0.02, abs(abs(n.y) - 0.5));
    c = mix(c, GOLD, eq * 0.55 + ring2 * 0.25);
    c += IVORY * pow(max(dot(reflect(-SUN_DIR, n), -rd), 0.0), 32.0) * 0.25;
    float alpha = behindSolid ? 0.52 : 0.92;
    return vec4(c, alpha);
  }
  vec3 n = boxNormal(p, hc, hh.xyz);
  float wEdge = clamp((hh.w - 0.2) / 0.8, 0.0, 1.0);
  float edgeDist = boxEdge(p, hc, hh.xyz);
  float bevel = 1.0 - smoothstep(0.0, 0.028, edgeDist);
  vec3 c = archTone(tint, n);
  if (n.y > 0.5) {
    // Recessed capstone border on the top of each wall
    float inner = 1.0 - smoothstep(0.005, 0.016, abs(edgeDist - 0.045));
    c = mix(c, IVORY, bevel * 0.45 + inner * 0.25);
  } else {
    // Architectural cornice band near the top of the wall + subtle vertical fluting
    float topDist = (hc.y + hh.y) - p.y;
    float cornice = 1.0 - smoothstep(0.0, 0.055, topDist);
    float corniceLine = 1.0 - smoothstep(0.004, 0.014, abs(topDist - 0.065));
    float flute = sin((p.x + p.z) * 14.0) * 0.03;
    c += flute * c;
    c = mix(c, mix(tint, IVORY, 0.42), cornice * 0.45 + corniceLine * 0.35 + bevel * 0.28);
  }
  if (wEdge < 0.95) {
    float stripe = 0.5 + 0.5 * sin((p.x + p.y * 1.6 + p.z) * 20.0);
    c = mix(c, IVORY, (1.0 - wEdge) * stripe * 0.28);
  }
  float baseAlpha = 0.55 + 0.39 * wEdge;
  float alpha = behindSolid ? min(baseAlpha, 0.46) : baseAlpha;
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
  vec3 skyLow = mix(BG_LOW, layerTint * 0.38, 0.35);
  vec3 skyHigh = mix(BG_HIGH, mix(layerTint, IVORY, 0.35) * 0.52, 0.42);
  vec3 bg = mix(skyLow, skyHigh, skyGrad);
  bg += mix(layerTint, GOLD, 0.4) * 0.12 * exp(-length(uv - vec2(-0.35, 0.42)) * 1.6);
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
    vec3 deckBase = mix(vec3(0.24, 0.26, 0.38), layerTint * 0.55 + vec3(0.18, 0.19, 0.28), 0.62);
    if (pn.y < 0.5) {
      // Cliff sides of the floating island: tri-tone masonry + upper cornice lip
      vec3 sideCol = archTone(deckBase, pn);
      float lip = 1.0 - smoothstep(0.0, 0.07, -p.y);
      float course = 1.0 - smoothstep(0.0, 0.015, abs(fract(p.y * 3.5) - 0.5) - 0.44);
      sideCol = mix(sideCol, mix(deckBase, IVORY, 0.4), lip * 0.45);
      sideCol *= 1.0 - course * 0.08;
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
      if (uBounds.z > 0.5) {
        vec2 out2 = abs(p.xz) - uBounds.xy;
        float maxOut = max(out2.x, out2.y);
        float rimBand = smoothstep(-0.04, 0.02, maxOut);
        float borderLine = 1.0 - smoothstep(0.006, 0.022, abs(maxOut));
        fl = mix(fl, mix(deckBase, IVORY, 0.36), rimBand * 0.35 + borderLine * 0.45);
      }
      fl = mix(fl, mix(uLayerA.rgb, uLayerB.rgb, uLayerMix) * 0.9 + IVORY * 0.2, (pa * (1.0 - uLayerMix) + pb * uLayerMix) * 0.16);
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
      if (abs(uItem.w) > 0.001) {
        vec2 iq = abs(p.xz - uItem.xz);
        float idist = (iq.x + iq.y) * 0.72;
        float irad = abs(uItem.w);
        float iRing = 1.0 - smoothstep(0.008, 0.024, abs(idist - irad));
        float iDash = uItem.w > 0.0 ? 1.0 : step(0.45, fract((p.x - p.z) * 6.0));
        fl = mix(fl, ITEM_COL, iRing * iDash * 0.75);
      }
      if (uSocket.z >= 0.0) {
        vec3 blue = vec3(0.22, 0.80, 0.96);
        float d = length(p.xz - uSocket.xy);
        float ring = 1.0 - smoothstep(0.012, 0.03, abs(d - 0.34));
        float inset = 1.0 - smoothstep(0.15, 0.2, d);
        float cable = wire(p.xz, uSocket.xy, uRelayPorts.xy);
        float power = mix(0.24, 0.95, uSocket.w);
        fl = mix(fl, blue, cable * power);
        fl = mix(fl, blue, uSocket.z * (ring * 0.95 + inset * 0.55));
        float pin = 1.0 - smoothstep(0.035, 0.065, length(p.xz - uRelayPorts.xy));
        fl = mix(fl, mix(blue * 0.5, IVORY, uSocket.w), pin);
      }
      if (uLatch.z >= 0.0) {
        vec2 q = abs(p.xz - uLatch.xy);
        float plate = 1.0 - smoothstep(0.01, 0.028, abs(max(q.x, q.y) - 0.23));
        float handle = wire(p.xz, uLatch.xy + vec2(-0.12, -0.1 + uLatch.w * 0.2), uLatch.xy + vec2(0.12, -0.1 + uLatch.w * 0.2));
        float cable = wire(p.xz, uLatch.xy, uRelayPorts.zw);
        fl = mix(fl, GOLD, cable * mix(0.22, 0.85, uLatch.w));
        fl = mix(fl, mix(GOLD, ITEM_COL, uLatch.w), (plate + handle) * uLatch.z);
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
      fl = mix(fl, fl * vec3(0.54, 0.56, 0.72), shadow);
      color = fl;
    }
  }

  float solidT = floorT;
  bool hitCharacterOrItem = false;
  if (uActor.w > 0.5) {
    vec3 actorCol;
    float tAct = hitActor(ro, rd, uToken.xy, uActor.x, uActor.y, uActor.z, uToken.w, layerTint, actorCol);
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
  vec3 hc = vec3(0.0);
  vec4 hh = vec4(0.0);
  vec3 tint = vec3(0.0);
  float bestT2 = solidT;
  int kind2 = 0;
  vec3 hc2 = vec3(0.0);
  vec4 hh2 = vec4(0.0);
  vec3 tint2 = vec3(0.0);
  for (int i = 0; i < ${MAX}; i += 1) {
    if (float(i) >= uSphCount) break;
    float t = hitSphere(ro, rd, uSph[i]);
    if (t > 0.0 && t < bestT) {
      bestT2 = bestT; kind2 = kind; hc2 = hc; hh2 = hh; tint2 = tint;
      bestT = t; kind = 1; hc = uSph[i].xyz; hh = vec4(0.0, 0.0, 0.0, uSph[i].w); tint = uSphTint[i];
    } else if (t > 0.0 && t < bestT2) {
      bestT2 = t; kind2 = 1; hc2 = uSph[i].xyz; hh2 = vec4(0.0, 0.0, 0.0, uSph[i].w); tint2 = uSphTint[i];
    }
  }
  for (int i = 0; i < ${MAX}; i += 1) {
    if (float(i) >= uBoxCount) break;
    if (uBoxH[i].y < 0.001 || uBoxH[i].w < 0.001) continue;
    vec2 span = boxSpan(ro, rd, uBoxC[i], uBoxH[i].xyz);
    if (span.x > 0.0 && span.x < bestT) {
      bestT2 = bestT; kind2 = kind; hc2 = hc; hh2 = hh; tint2 = tint;
      bestT = span.x; kind = 2; hc = uBoxC[i]; hh = uBoxH[i]; tint = uBoxTint[i];
    } else if (span.x > 0.0 && span.x < bestT2) {
      bestT2 = span.x; kind2 = 2; hc2 = uBoxC[i]; hh2 = uBoxH[i]; tint2 = uBoxTint[i];
    }
  }
  if (kind2 > 0) {
    vec4 g2 = shadeHit(kind2, bestT2, ro, rd, hc2, hh2, tint2, hitCharacterOrItem);
    color = mix(color, g2.rgb, g2.a * 0.88);
  }
  if (kind > 0) {
    vec4 g1 = shadeHit(kind, bestT, ro, rd, hc, hh, tint, hitCharacterOrItem);
    color = mix(color, g1.rgb, g1.a);
  }

  color *= 1.0 - 0.12 * pow(length(uv) / 1.7, 2.0);
  color = pow(max(color, vec3(0.0)), vec3(0.92));
  gl_FragColor = vec4(color, 1.0);
}
`;

const NAMES = ['uResolution', 'uEye', 'uLookY', 'uSph', 'uSphTint', 'uSphGhost', 'uSphCount', 'uBoxC', 'uBoxH', 'uBoxTint', 'uBoxCount',
  'uToken', 'uActor', 'uItem', 'uSocket', 'uLatch', 'uRelayPorts', 'uGoal', 'uStart', 'uBounds', 'uTrail', 'uRipples', 'uRippleTint', 'uLayerA', 'uLayerB', 'uLayerMix'];
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
    const sphGhost = new Float32Array(MAX * 2);
    const boxC = new Float32Array(MAX * 3);
    const boxH = new Float32Array(MAX * 4);
    const boxTint = new Float32Array(MAX * 3);
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
        nb += 1;
      } else if (s.type === 'sphere' && ns < MAX) {
        // The dashed danger circle stays while the sphere is present but smaller.
        sph.set([...s.center, s.radius], ns * 4);
        sphGhost.set([s.maxR || 0.35, walkGhost], ns * 2);
        sphTint.set(s.tint, ns * 3);
        ns += 1;
      }
    }
    gl.uniform4fv(u.uSph, sph);
    gl.uniform3fv(u.uSphTint, sphTint);
    gl.uniform2fv(u.uSphGhost, sphGhost);
    gl.uniform1f(u.uSphCount, ns);
    gl.uniform3fv(u.uBoxC, boxC);
    gl.uniform4fv(u.uBoxH, boxH);
    gl.uniform3fv(u.uBoxTint, boxTint);
    gl.uniform1f(u.uBoxCount, nb);

    const { field, token, goalState } = frame;
    const goalW = !field ? -2 : (token?.won ? 2 : (goalState?.open ? 0.25 + 0.75 * goalState.wEdge : -(goalState?.wGhost ?? 0.5)));
    gl.uniform4f(u.uToken, ...(token ? [token.pos[0], token.pos[1], field.tokenRadius, token.flash] : [0, 0, 0, -1]));
    gl.uniform4f(u.uActor, ...(token ? [token.yaw ?? 1.57, token.bob ?? 0, token.carrying ? 1 : 0, 1] : [0, 0, 0, 0]));
    gl.uniform4f(u.uItem, ...itemUniform);
    const relay = frame.relay;
    for (const [name, device, active] of [['uSocket', relay?.socket, relay?.powered], ['uLatch', relay?.latch, relay?.latched]]) {
      const visible = device ? (Math.abs(frame.w - device.w) <= device.wReach ? 1 : 0.28) : -1;
      gl.uniform4f(u[name], device?.x ?? 0, device?.z ?? 0, visible, active ? 1 : 0);
    }
    gl.uniform4f(u.uRelayPorts, ...(relay ? [...relay.powerPort, ...relay.returnPort] : [0, 0, 0, 0]));
    gl.uniform4f(u.uGoal, ...(field ? [field.goal[0], field.goal[1], 0.3, goalW] : [0, 0, 0, -2]));
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
