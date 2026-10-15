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
uniform float uSphCount;
uniform vec3 uBoxC[${MAX}];
uniform vec3 uBoxH[${MAX}];
uniform vec3 uBoxTint[${MAX}];
uniform float uBoxCount;
uniform vec4 uToken;
uniform vec4 uGoal;
uniform vec3 uStart;
uniform vec3 uBounds;
uniform vec3 uTrail[8];
uniform vec4 uRipples[4];
uniform vec3 uRippleTint[4];
uniform vec4 uLayerA;
uniform vec4 uLayerB;
uniform float uLayerMix;

const vec3 BG_LOW = vec3(0.022, 0.034, 0.066);
const vec3 BG_HIGH = vec3(0.062, 0.085, 0.16);
const vec3 TOKEN = vec3(1.0, 0.93, 0.8);
const vec3 ALERT = vec3(1.0, 0.38, 0.32);
const vec3 GOLD = vec3(1.0, 0.8, 0.38);
${GLSL_BOX}
${GLSL_PATTERN}

float hitSphere(vec3 ro, vec3 rd, vec4 s) {
  if (s.w <= 0.00001) return -1.0;
  vec3 oc = ro - s.xyz;
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + s.w * s.w;
  if (h < 0.0) return -1.0;
  float t = -b - sqrt(h);
  return t > 0.0 ? t : -1.0;
}

// Ray vs a vertical beam standing on the floor, so token and goal stay
// visible even behind walls.
float beam(vec3 ro, vec3 rd, vec2 pos, float h, float width) {
  vec3 w = ro - vec3(pos.x, 0.0, pos.y);
  float denom = 1.0 - rd.y * rd.y;
  if (denom < 0.0001) return 0.0;
  float d = dot(rd, w);
  float t = (rd.y * w.y - d) / denom;
  float s = (w.y - rd.y * d) / denom;
  vec3 diff = (ro + rd * t) - vec3(pos.x, s, pos.y);
  if (t <= 0.0 || s < -0.05 || s > h) return 0.0;
  return (1.0 - smoothstep(width * 0.4, width, length(diff))) * (1.0 - s / h * 0.7);
}

vec3 glass(vec3 base, vec3 n, vec3 rd, float edge) {
  vec3 key = normalize(vec3(-0.5, 1.0, 0.65));
  float diffuse = max(dot(n, key), 0.0);
  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.4);
  float spec = pow(max(dot(reflect(-key, n), -rd), 0.0), 48.0);
  vec3 c = base * (0.16 + 0.34 * diffuse);
  c += base * fresnel * 0.85;
  c += base * edge * 1.1;
  c += vec3(1.0) * spec * 0.35;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  vec3 look = vec3(0.0, uLookY, 0.0);
  vec3 forward = normalize(look - uEye);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 rd = normalize(forward * 2.6 + right * uv.x + up * uv.y);
  vec3 ro = uEye;
  vec3 layerTint = mix(uLayerA.rgb, uLayerB.rgb, uLayerMix);
  vec3 bg = mix(BG_LOW, BG_HIGH, clamp(uv.y * 0.5 + 0.55, 0.0, 1.0));
  bg += layerTint * 0.025 * exp(-length(uv - vec2(0.0, 0.25)) * 1.4);
  vec3 color = bg;

  float floorT = rd.y < -0.0001 ? -ro.y / rd.y : 10000.0;
  if (floorT > 0.0 && floorT < 60.0) {
    vec3 p = ro + rd * floorT;
    float fade = exp(-length(p.xz) * 0.12);
    float lw = min(0.09, 0.006 * floorT);
    float pa = pattern(uLayerA.w, p.xz, lw);
    float pb = pattern(uLayerB.w, p.xz, lw);
    vec3 fl = vec3(0.03, 0.044, 0.08);
    float inside = 1.0;
    if (uBounds.z > 0.5) {
      vec2 out2 = abs(p.xz) - uBounds.xy;
      inside = 1.0 - smoothstep(0.0, 0.05, max(out2.x, out2.y));
      float border = 1.0 - smoothstep(0.01, 0.035, abs(max(out2.x, out2.y)));
      fl += layerTint * border * 0.55;
    }
    fl += (uLayerA.rgb * pa * (1.0 - uLayerMix) + uLayerB.rgb * pb * uLayerMix) * 0.16 * fade * (0.35 + 0.65 * inside);
    if (uStart.z > 0.5) {
      float sd = length(p.xz - uStart.xy);
      fl += layerTint * 0.18 * (1.0 - smoothstep(0.012, 0.03, abs(sd - 0.2)));
    }
    if (uGoal.w > -0.5) {
      float gd = length(p.xz - uGoal.xy);
      float ring = 1.0 - smoothstep(0.012, 0.03, abs(gd - uGoal.z));
      float fill = 1.0 - smoothstep(uGoal.z * 0.6, uGoal.z, gd);
      fl += GOLD * (ring * 0.9 + fill * 0.22 + exp(-gd * gd * 6.0) * 0.12) * (uGoal.w > 0.5 ? 1.5 : 1.0);
    }
    for (int i = 0; i < 8; i += 1) {
      if (uTrail[i].z <= 0.001) break;
      float td = length(p.xz - uTrail[i].xy);
      fl += TOKEN * uTrail[i].z * 0.5 * (1.0 - smoothstep(0.03, 0.09, td));
    }
    for (int i = 0; i < 4; i += 1) {
      if (uRipples[i].w < 0.5) break;
      float rr = length(p.xz - uRipples[i].xy);
      float prog = uRipples[i].z;
      fl += uRippleTint[i] * (1.0 - smoothstep(0.02, 0.09, abs(rr - prog * 1.8))) * (1.0 - prog) * 0.7;
    }
    for (int i = 0; i < ${MAX}; i += 1) {
      if (float(i) >= uSphCount) break;
      vec4 s = uSph[i];
      if (s.w < 0.0001) continue;
      vec2 o = p.xz - s.xz + vec2(0.22, -0.14) * s.y;
      float pool = exp(-dot(o, o) / (s.w * s.w * 0.8 + 0.05));
      fl = fl * (1.0 - pool * 0.45) + uSphTint[i] * pool * 0.06;
    }
    for (int i = 0; i < ${MAX}; i += 1) {
      if (float(i) >= uBoxCount) break;
      vec3 h = uBoxH[i];
      if (h.y < 0.001) continue;
      vec2 d = abs(p.xz - uBoxC[i].xz + vec2(0.22, -0.14) * uBoxC[i].y) - h.xz;
      float dist = length(max(d, vec2(0.0)));
      float pool = exp(-dist * dist / 0.25);
      fl = fl * (1.0 - pool * 0.4) + uBoxTint[i] * pool * 0.05;
    }
    if (uToken.w > -0.5) {
      float kd = length(p.xz - uToken.xy);
      vec3 tc = mix(TOKEN, ALERT, clamp(uToken.w, 0.0, 1.0));
      fl += tc * exp(-kd * kd * 3.0) * 0.28;
      fl = mix(fl, tc, (1.0 - smoothstep(uToken.z * 0.75, uToken.z, kd)) * 0.95);
    }
    color = mix(bg, fl, exp(-floorT * 0.02));
  }

  float bestT = floorT;
  int kind = 0;
  vec3 hc = vec3(0.0);
  vec3 hh = vec3(0.0);
  vec3 tint = vec3(0.0);
  float radius = 0.0;
  for (int i = 0; i < ${MAX}; i += 1) {
    if (float(i) >= uSphCount) break;
    float t = hitSphere(ro, rd, uSph[i]);
    if (t > 0.0 && t < bestT) { bestT = t; kind = 1; hc = uSph[i].xyz; radius = uSph[i].w; tint = uSphTint[i]; }
  }
  for (int i = 0; i < ${MAX}; i += 1) {
    if (float(i) >= uBoxCount) break;
    if (uBoxH[i].y < 0.001) continue;
    vec2 span = boxSpan(ro, rd, uBoxC[i], uBoxH[i]);
    if (span.x > 0.0 && span.x < bestT) { bestT = span.x; kind = 2; hc = uBoxC[i]; hh = uBoxH[i]; tint = uBoxTint[i]; }
  }
  if (kind == 1) {
    vec3 p = ro + rd * bestT;
    vec3 n = normalize(p - hc);
    float lat = acos(clamp(n.y, -1.0, 1.0));
    float lon = atan(n.z, n.x);
    float lines = min(abs(sin(lat * 10.0)), abs(sin(lon * 10.0)) * max(sin(lat), 0.2));
    float grid = (1.0 - smoothstep(0.015, 0.05, lines)) * 0.25;
    float equator = 1.0 - smoothstep(0.004, 0.012, abs(n.y));
    vec3 g = glass(tint, n, rd, grid + equator * 0.6);
    float alpha = 0.7 + 0.25 * pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
    color = mix(color, g, alpha);
  } else if (kind == 2) {
    vec3 p = ro + rd * bestT;
    vec3 n = boxNormal(p, hc, hh);
    float edge = 1.0 - smoothstep(0.0, 0.04, boxEdge(p, hc, hh));
    vec3 g = glass(tint, n, rd, edge);
    color = mix(color, g, 0.62 + edge * 0.35);
  }

  if (uGoal.w > -0.5) color += GOLD * beam(ro, rd, uGoal.xy, 1.8, 0.06) * (uGoal.w > 0.5 ? 1.0 : 0.65);
  if (uToken.w > -0.5) color += mix(TOKEN, ALERT, clamp(uToken.w, 0.0, 1.0)) * beam(ro, rd, uToken.xy, 2.0, 0.055) * 0.9;

  float sceneT = min(floorT, bestT);
  color = mix(color, bg, 1.0 - exp(-max(sceneT, 0.0) * 0.022));
  color *= 1.0 - 0.18 * pow(length(uv) / 1.6, 2.0);
  color = pow(max(color, vec3(0.0)), vec3(0.9));
  gl_FragColor = vec4(color, 1.0);
}
`;

const NAMES = ['uResolution', 'uEye', 'uLookY', 'uSph', 'uSphTint', 'uSphCount', 'uBoxC', 'uBoxH', 'uBoxTint', 'uBoxCount',
  'uToken', 'uGoal', 'uStart', 'uBounds', 'uTrail', 'uRipples', 'uRippleTint', 'uLayerA', 'uLayerB', 'uLayerMix'];
const VIEW = { yaw: 0.45, pitch: 0.5, distance: 7.6, minPitch: 0.05, maxPitch: 1.35, minDistance: 4.5, maxDistance: 14 };

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
    gl.uniform3f(u.uEye, ...this.orbit.eye(lookY, size.aspect < 1.2));
    gl.uniform1f(u.uLookY, lookY);

    const sph = new Float32Array(MAX * 4);
    const sphTint = new Float32Array(MAX * 3);
    const boxC = new Float32Array(MAX * 3);
    const boxH = new Float32Array(MAX * 3);
    const boxTint = new Float32Array(MAX * 3);
    let ns = 0;
    let nb = 0;
    for (const s of frame.sections) {
      if (s.type === 'box' && nb < MAX) {
        boxC.set(s.center, nb * 3);
        boxH.set(s.kind === 'box' ? s.half : [0, 0, 0], nb * 3);
        boxTint.set(s.tint, nb * 3);
        nb += 1;
      } else if (s.type === 'sphere' && ns < MAX) {
        sph.set([...s.center, s.radius], ns * 4);
        sphTint.set(s.tint, ns * 3);
        ns += 1;
      }
    }
    gl.uniform4fv(u.uSph, sph);
    gl.uniform3fv(u.uSphTint, sphTint);
    gl.uniform1f(u.uSphCount, ns);
    gl.uniform3fv(u.uBoxC, boxC);
    gl.uniform3fv(u.uBoxH, boxH);
    gl.uniform3fv(u.uBoxTint, boxTint);
    gl.uniform1f(u.uBoxCount, nb);

    const { field, token } = frame;
    gl.uniform4f(u.uToken, ...(token ? [token.pos[0], token.pos[1], field.tokenRadius, token.flash] : [0, 0, 0, -1]));
    gl.uniform4f(u.uGoal, ...(field ? [field.goal[0], field.goal[1], 0.3, token?.won ? 1 : 0] : [0, 0, 0, -1]));
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
