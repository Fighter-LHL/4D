// The W map: the whole level in (x, W, z) with W drawn vertically. Every
// body becomes a glass volume showing all the W it occupies; the current
// slice is a glowing plane, and the exact section is painted onto it.
import { MAX_BODIES_PER_TYPE, createProgram, uniformLocations, fitCanvas, Orbit, watchContext, GLSL_BOX } from './gl-core.mjs';

const MAX = MAX_BODIES_PER_TYPE;
export const MAP_SCALE = 1.0; // screen units per unit of W

const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform vec3 uEye;
uniform vec3 uFrame;
uniform float uScale;
uniform float uPlane;
uniform vec3 uPlaneTint;
uniform vec3 uBoxC[${MAX}];
uniform vec3 uBoxH[${MAX}];
uniform vec3 uBoxTint[${MAX}];
uniform float uBoxCount;
uniform vec4 uSph[${MAX}];
uniform float uSphWRadius[${MAX}];
uniform vec3 uSphTint[${MAX}];
uniform float uSphCount;
uniform vec3 uToken;
uniform vec4 uGoal;
uniform vec3 uLayers[5];
uniform vec2 uBlocked[${MAX}];
uniform float uBlockedCount;

const vec3 TOKEN = vec3(1.0, 0.93, 0.8);
const vec3 ALERT = vec3(1.0, 0.38, 0.32);
const vec3 GOLD = vec3(1.0, 0.8, 0.38);
${GLSL_BOX}

// W may have a different semi-axis from the spatial X/Z directions.
vec2 ballSpan(vec3 ro, vec3 rd, vec4 s, float wRadius) {
  if (s.w <= 0.00001 || wRadius <= 0.00001) return vec2(-1.0);
  vec3 radii = vec3(s.w, wRadius * uScale, s.w);
  vec3 o = (ro - s.xyz) / radii;
  vec3 d = rd / radii;
  float a = dot(d, d);
  float b = dot(o, d);
  float c = dot(o, o) - 1.0;
  float h = b * b - a * c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2((-b - h) / a, (-b + h) / a);
}

// Closest approach between the ray and a vertical segment x/z = pos.
float column(vec3 ro, vec3 rd, vec2 pos, float halfH, float width, out float s) {
  vec3 w = ro - vec3(pos.x, 0.0, pos.y);
  float denom = 1.0 - rd.y * rd.y;
  s = 0.0;
  if (denom < 0.0001) return 0.0;
  float d = dot(rd, w);
  float t = (rd.y * w.y - d) / denom;
  s = (w.y - rd.y * d) / denom;
  vec3 diff = (ro + rd * t) - vec3(pos.x, s, pos.y);
  if (t <= 0.0 || abs(s) > halfH) return 0.0;
  return 1.0 - smoothstep(width * 0.35, width, length(diff));
}

vec3 layerColor(float y) {
  float u = clamp((y / uScale + 2.0) / 0.8, 0.0, 4.999);
  if (u < 1.0) return uLayers[0];
  if (u < 2.0) return uLayers[1];
  if (u < 3.0) return uLayers[2];
  if (u < 4.0) return uLayers[3];
  return uLayers[4];
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  vec3 forward = normalize(-uEye);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 rd = normalize(forward * 2.4 + right * uv.x + up * uv.y);
  vec3 ro = uEye;
  vec3 color = mix(vec3(0.008, 0.018, 0.022), vec3(0.028, 0.048, 0.054), clamp(uv.y * 0.5 + 0.6, 0.0, 1.0));

  vec2 frame = boxSpan(ro, rd, vec3(0.0), uFrame);
  if (frame.y < 0.0) { gl_FragColor = vec4(pow(color, vec3(0.9)), 1.0); return; }
  float tNear = max(frame.x, 0.0);
  float tFar = frame.y;

  // Back walls carry the five layer bands; the floor is a faint grid.
  vec3 pb = ro + rd * tFar;
  vec3 nb = boxNormal(pb, vec3(0.0), uFrame);
  float edgeB = 1.0 - smoothstep(0.0, 0.012 * tFar, boxEdge(pb, vec3(0.0), uFrame));
  if (abs(nb.y) < 0.5) {
    float u = (pb.y / uScale + 2.0) / 0.8;
    float border = 1.0 - smoothstep(0.0, 0.02 * tFar, abs(fract(u + 0.5) - 0.5) * 0.8 * uScale);
    color += layerColor(pb.y) * (0.07 + border * 0.12);
  } else if (nb.y < 0.0) {
    vec2 cell = abs(fract(pb.xz * 2.0 + 0.5) - 0.5);
    color += vec3(0.055, 0.080, 0.086) * (1.0 - smoothstep(0.0, 0.03 * tFar, min(cell.x, cell.y) * 0.5));
  }
  color += vec3(0.36, 0.46, 0.48) * edgeB * 0.5;

  float tPlane = abs(rd.y) > 0.0001 ? (uPlane - ro.y) / rd.y : -1.0;
  vec3 pp = ro + rd * tPlane;
  bool onPlane = tPlane > tNear && tPlane < tFar && abs(pp.x) <= uFrame.x && abs(pp.z) <= uFrame.z;
  float cut = onPlane ? tPlane : 1e6;

  vec3 front = vec3(0.0);
  vec3 back = vec3(0.0);
  vec4 section = vec4(0.0);
  for (int i = 0; i < ${MAX}; i += 1) {
    if (float(i) >= uBoxCount) break;
    if (uBoxH[i].y < 0.001) continue;
    vec2 span = boxSpan(ro, rd, uBoxC[i], uBoxH[i]);
    if (span.y < 0.0) continue;
    float a = max(span.x, tNear);
    float b = min(span.y, tFar);
    if (b <= a) continue;
    vec3 tint = uBoxTint[i];
    vec3 pe = ro + rd * a;
    float rim = 1.0 - smoothstep(0.0, 0.01 * a + 0.01, boxEdge(pe, uBoxC[i], uBoxH[i]));
    float fThick = max(0.0, min(b, cut) - a);
    float bThick = max(0.0, b - max(a, cut));
    front += tint * (1.0 - exp(-fThick * 1.4)) * 0.3;
    back += tint * (1.0 - exp(-bThick * 1.4)) * 0.3;
    if (a < cut) front += tint * rim * 0.7; else back += tint * rim * 0.7;
    if (onPlane) {
      vec3 d = abs(pp - uBoxC[i]) - uBoxH[i];
      if (d.x < 0.0 && d.y < 0.0 && d.z < 0.0) {
        float outline = 1.0 - smoothstep(0.0, 0.012 * tPlane, -max(d.x, d.z));
        section = vec4(tint * (0.75 + outline * 0.9), 0.92);
      }
    }
  }
  for (int i = 0; i < ${MAX}; i += 1) {
    if (float(i) >= uSphCount) break;
    vec2 span = ballSpan(ro, rd, uSph[i], uSphWRadius[i]);
    if (span.y < 0.0) continue;
    float a = max(span.x, tNear);
    float b = min(span.y, tFar);
    if (b <= a) continue;
    vec3 tint = uSphTint[i];
    vec3 radii = vec3(uSph[i].w, uSphWRadius[i] * uScale, uSph[i].w);
    vec3 n = normalize((ro + rd * a - uSph[i].xyz) / (radii * radii));
    float fres = pow(1.0 - abs(dot(n, rd)), 2.5);
    float fThick = max(0.0, min(b, cut) - a);
    float bThick = max(0.0, b - max(a, cut));
    front += tint * (1.0 - exp(-fThick * 1.2)) * 0.28;
    back += tint * (1.0 - exp(-bThick * 1.2)) * 0.28;
    if (a < cut) front += tint * fres * 0.6; else back += tint * fres * 0.6;
    if (onPlane) {
      vec3 q = pp - uSph[i].xyz;
      float dy = q.y / (uScale * uSphWRadius[i]);
      float rr2 = uSph[i].w * uSph[i].w * (1.0 - dy * dy);
      if (rr2 > 0.0) {
        float dist = length(q.xz);
        float rr = sqrt(rr2);
        if (dist < rr) {
          float outline = 1.0 - smoothstep(0.0, 0.012 * tPlane, rr - dist);
          section = vec4(tint * (0.75 + outline * 0.9), 0.92);
        }
      }
    }
  }

  color += back;
  if (onPlane) {
    vec2 cell = abs(fract(pp.xz * 2.0 + 0.5) - 0.5);
    float grid = 1.0 - smoothstep(0.0, 0.02 * tPlane, min(cell.x, cell.y) * 0.5);
    vec2 edge2 = uFrame.xz - abs(pp.xz);
    float border = 1.0 - smoothstep(0.0, 0.014 * tPlane, min(edge2.x, edge2.y));
    color = mix(color, uPlaneTint * 0.55, 0.16);
    color += uPlaneTint * (grid * 0.05 + border * 0.9);
    color = mix(color, section.rgb, section.a);
    if (uToken.z > 0.5) {
      float kd = length(pp.xz - uToken.xy);
      vec3 tc = mix(TOKEN, ALERT, clamp(uToken.z - 1.0, 0.0, 1.0));
      color += tc * (exp(-kd * kd * 40.0) * 0.65);
      color = mix(color, tc, 1.0 - smoothstep(0.07, 0.1, kd));
    }
    if (uGoal.w > uGoal.z && uPlane >= uGoal.z && uPlane <= uGoal.w) {
      float gd = length(pp.xz - uGoal.xy);
      color += GOLD * (exp(-gd * gd * 32.0) * 0.65);
      color = mix(color, GOLD, 1.0 - smoothstep(0.08, 0.11, gd));
    }
  }
  color += front;

  float s;
  if (uGoal.w > uGoal.z) {
    float gc = column(ro, rd, uGoal.xy, uFrame.y, 0.048, s);
    if (gc > 0.001) {
      bool inGoalW = s >= uGoal.z && s <= uGoal.w;
      float gDash = inGoalW ? 1.0 : step(0.5, fract(s * 7.0));
      color += GOLD * gc * gDash * (inGoalW ? 0.92 : 0.22);
    }
  }
  if (uToken.z > 0.5) {
    float c = column(ro, rd, uToken.xy, uFrame.y, 0.032, s);
    if (c > 0.001) {
      // Exact W intervals from blockedWIntervals, shared with the rail.
      bool blockedAtS = false;
      float sw = s / uScale;
      for (int i = 0; i < ${MAX}; i += 1) {
        if (float(i) >= uBlockedCount) break;
        if (sw > uBlocked[i].x && sw < uBlocked[i].y) blockedAtS = true;
      }
      float dash = blockedAtS ? 1.0 : step(0.5, fract(s * 7.0));
      float flashAmt = clamp(uToken.z - 1.0, 0.0, 1.0);
      vec3 tc = blockedAtS ? ALERT : mix(TOKEN, ALERT, flashAmt);
      float intensity = blockedAtS ? (0.78 + 0.22 * flashAmt) : (0.45 + 0.35 * flashAmt);
      color += tc * c * dash * intensity;
    }
  }
  color = pow(max(color, vec3(0.0)), vec3(0.9));
  gl_FragColor = vec4(color, 1.0);
}
`;

const NAMES = ['uResolution', 'uEye', 'uFrame', 'uScale', 'uPlane', 'uPlaneTint', 'uBoxC', 'uBoxH', 'uBoxTint', 'uBoxCount',
  'uSph', 'uSphWRadius', 'uSphTint', 'uSphCount', 'uToken', 'uGoal', 'uLayers', 'uBlocked', 'uBlockedCount'];
// Same default yaw as the slice view, so both views face the same way.
const VIEW = { yaw: 0.45, pitch: 0.36, distance: 9.5, minPitch: -0.6, maxPitch: 1.4, minDistance: 4, maxDistance: 22 };

export class MapRenderer {
  constructor(canvas, onError) {
    this.canvas = canvas;
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

  // Frame the whole map box so the full W extent is always in view.
  fitTo(bounds, yaw = 0.45) {
    const radius = Math.hypot(bounds.x, bounds.z, 2 * MAP_SCALE);
    this.orbit.reset({ distance: radius * 2.3, yaw });
  }

  render(frame) {
    this.frame = frame;
    this.draw();
  }

  draw() {
    if (this.lost || !this.frame || this.canvas.offsetParent === null) return;
    const size = fitCanvas(this.canvas, 900, 1.5);
    if (!size) return;
    const { gl, u, frame } = this;
    const S = MAP_SCALE;
    gl.viewport(0, 0, size.width, size.height);
    gl.uniform2f(u.uResolution, size.width, size.height);
    gl.uniform3f(u.uEye, ...this.orbit.eye(0, size.aspect < 1));
    gl.uniform3f(u.uFrame, frame.bounds.x, 2 * S, frame.bounds.z);
    gl.uniform1f(u.uScale, S);
    gl.uniform1f(u.uPlane, frame.w * S);
    gl.uniform3f(u.uPlaneTint, ...frame.planeTint);

    const boxC = new Float32Array(MAX * 3);
    const boxH = new Float32Array(MAX * 3);
    const boxTint = new Float32Array(MAX * 3);
    const sph = new Float32Array(MAX * 4);
    const sphWRadius = new Float32Array(MAX);
    const sphTint = new Float32Array(MAX * 3);
    let nb = 0;
    let ns = 0;
    for (const f of frame.footprints) {
      if (!f.exists) continue;
      if (f.type === 'box' && nb < MAX) {
        // Clip the W extent to the dial range [-2, 2].
        const lo = Math.max(-2, f.center[2] - f.half[2]);
        const hi = Math.min(2, f.center[2] + f.half[2]);
        if (hi <= lo) continue;
        boxC.set([f.center[0], ((lo + hi) / 2) * S, f.center[1]], nb * 3);
        boxH.set([f.half[0], ((hi - lo) / 2) * S, f.half[1]], nb * 3);
        boxTint.set(f.tint, nb * 3);
        nb += 1;
      } else if (f.type === 'sphere' && ns < MAX) {
        sph.set([f.center[0], f.center[2] * S, f.center[1], f.radius], ns * 4);
        sphWRadius[ns] = f.wRadius ?? f.radius;
        sphTint.set(f.tint, ns * 3);
        ns += 1;
      }
    }
    gl.uniform3fv(u.uBoxC, boxC);
    gl.uniform3fv(u.uBoxH, boxH);
    gl.uniform3fv(u.uBoxTint, boxTint);
    gl.uniform1f(u.uBoxCount, nb);
    gl.uniform4fv(u.uSph, sph);
    gl.uniform1fv(u.uSphWRadius, sphWRadius);
    gl.uniform3fv(u.uSphTint, sphTint);
    gl.uniform1f(u.uSphCount, ns);
    const [glo, ghi] = frame.field?.goalW ?? [-2, 2];
    gl.uniform3f(u.uToken, ...(frame.token ? [frame.token.pos[0], frame.token.pos[1], 1 + Math.min(1, frame.token.flash || 0)] : [0, 0, 0]));
    gl.uniform4f(u.uGoal, ...(frame.goal ? [frame.goal[0], frame.goal[1], glo * S, ghi * S] : [0, 0, 0, -1]));
    gl.uniform3fv(u.uLayers, new Float32Array(frame.layerColors.flat()));
    const blocked = new Float32Array(MAX * 2);
    const intervals = (frame.blocked ?? []).slice(0, MAX);
    intervals.forEach((pair, i) => blocked.set(pair, i * 2));
    gl.uniform2fv(u.uBlocked, blocked);
    gl.uniform1f(u.uBlockedCount, intervals.length);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
