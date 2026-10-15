// Dependency-free analytic ray/sphere rendering. Geometry comes from geometry.mjs.
const VERTEX = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform vec3 uEye;
uniform float uLookY;
uniform vec4 uSpheres[8];
uniform float uSphereAlt[8];
uniform float uCount;
uniform vec4 uBoxC[4];
uniform vec4 uBoxH[4];
uniform float uBoxCount;
uniform vec4 uToken;
uniform vec4 uGoal;
uniform vec3 uStart;
uniform vec3 uBounds;
uniform vec3 uTrail[8];
uniform vec4 uRipples[4];

float hitSphere(vec3 ro, vec3 rd, vec4 sphere) {
  if (sphere.w <= 0.00001) return -1.0;
  vec3 oc = ro - sphere.xyz;
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + sphere.w * sphere.w;
  if (h < 0.0) return -1.0;
  float t = -b - sqrt(h);
  return t > 0.0 ? t : -1.0;
}

// Distance test between the view ray and a vertical beam standing on the
// floor, so the token and goal stay visible even inside sealed walls.
float beamHit(vec3 ro, vec3 rd, vec2 pos, float h) {
  vec3 w = ro - vec3(pos.x, 0.0, pos.y);
  float denom = 1.0 - rd.y * rd.y;
  if (denom < 0.0001) return 0.0;
  float d = dot(rd, w);
  float t = (rd.y * w.y - d) / denom;
  float s = (w.y - rd.y * d) / denom;
  vec3 diff = (ro + rd * t) - vec3(pos.x, s, pos.y);
  return (t > 0.0 && s > -0.05 && s < h && length(diff) < 0.055) ? 1.0 : 0.0;
}

float hitBox(vec3 ro, vec3 rd, vec3 c, vec3 h) {
  vec3 m = vec3(1.0) / rd;
  vec3 n = m * (ro - c);
  vec3 k = abs(m) * h;
  vec3 t1 = -n - k;
  vec3 t2 = -n + k;
  float tN = max(max(t1.x, t1.y), t1.z);
  float tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tF < 0.0) return -1.0;
  return tN > 0.0 ? tN : -1.0;
}

vec3 boxNormal(vec3 p, vec3 c, vec3 h) {
  vec3 d = (p - c) / h;
  vec3 a = abs(d);
  if (a.x > a.y && a.x > a.z) return vec3(sign(d.x), 0.0, 0.0);
  if (a.y > a.z) return vec3(0.0, sign(d.y), 0.0);
  return vec3(0.0, 0.0, sign(d.z));
}

float shadowBox(vec3 p, vec4 c, vec3 h) {
  if (h.y < 0.001) return 1.0;
  vec2 d = abs(p.xz - c.xz + vec2(0.25, -0.16) * c.y) - h.xz;
  float dist = length(max(d, vec2(0.0)));
  return 1.0 - exp(-dist * dist / 0.35) * 0.5;
}

vec3 boxMaterial(vec3 p, vec3 n, vec3 rd, bool alt) {
  vec3 base = alt ? vec3(0.44, 0.63, 0.60) : vec3(0.70, 0.72, 0.62);
  vec3 key = normalize(vec3(-0.65, 1.0, 0.8));
  float diffuse = max(dot(n, key), 0.0);
  float spec = pow(max(dot(reflect(-key, n), -rd), 0.0), 40.0);
  return base * (0.24 + 0.72 * diffuse) * (1.0 + n.y * 0.08)
       + vec3(1.0, 0.97, 0.8) * spec * 0.18;
}

float shadow(vec3 p, vec4 sphere) {
  if (sphere.w < 0.0001) return 1.0;
  vec2 offset = p.xz - sphere.xz + vec2(0.25, -0.16) * sphere.y;
  float width = sphere.w * 0.85 + 0.3;
  float strength = min(0.8, sphere.w * 0.5);
  return 1.0 - exp(-dot(offset, offset) / (width * width)) * strength;
}

vec3 material(vec3 p, vec3 normal, vec3 rd, bool second) {
  vec3 base = second ? vec3(0.41, 0.64, 0.60) : vec3(0.73, 0.81, 0.48);
  vec3 key = normalize(vec3(-0.65, 1.0, 0.8));
  float diffuse = max(dot(normal, key), 0.0);
  float fill = max(dot(normal, normalize(vec3(1.0, 0.3, -0.5))), 0.0);
  float specular = pow(max(dot(reflect(-key, normal), -rd), 0.0), 65.0);
  float rim = pow(1.0 - max(dot(normal, -rd), 0.0), 3.0);
  vec3 color = base * (0.19 + 0.73 * diffuse + 0.15 * fill);
  color += vec3(1.0, 0.96, 0.76) * specular * 0.27;
  color += base * rim * 0.2;
  float latitude = acos(clamp(normal.y, -1.0, 1.0));
  float longitude = atan(normal.z, normal.x);
  float lines = min(abs(sin(latitude * 12.0)), abs(sin(longitude * 12.0)) * max(sin(latitude), 0.2));
  float grid = 1.0 - smoothstep(0.014, 0.045, lines);
  color = mix(color, color * 0.68, grid * 0.45);
  float equator = 1.0 - smoothstep(0.005, 0.012, abs(normal.y));
  color = mix(color, vec3(0.92, 0.98, 0.73), equator * 0.34);
  return color;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  vec3 forward = normalize(vec3(0.0, uLookY, 0.0) - uEye);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 rd = normalize(forward * 2.6 + right * uv.x + up * uv.y);
  vec3 ro = uEye;
  float atmosphere = exp(-length(uv - vec2(0.0, 0.12)) * 1.2);
  vec3 color = mix(vec3(0.052, 0.078, 0.065), vec3(0.105, 0.15, 0.113), atmosphere);
  float floorT = rd.y < -0.0001 ? -ro.y / rd.y : 10000.0;
  if (floorT > 0.0 && floorT < 40.0) {
    vec3 p = ro + rd * floorT;
    float fade = exp(-length(p.xz) * 0.15);
    vec2 cell = abs(fract(p.xz + 0.5) - 0.5);
    float gridWidth = min(0.025, 0.0035 * floorT);
    float grid = 1.0 - smoothstep(gridWidth * 0.5, gridWidth, min(cell.x, cell.y));
    vec3 floorColor = vec3(0.078, 0.11, 0.087) + vec3(0.048, 0.061, 0.037) * grid * fade;
    float ring = 1.0 - smoothstep(0.008, 0.022, abs(length(p.xz) - 2.2));
    floorColor += vec3(0.11, 0.14, 0.06) * ring;
    float origin = (1.0 - smoothstep(0.006, 0.02, min(abs(p.x), abs(p.z)))) * (1.0 - smoothstep(0.2, 0.35, max(abs(p.x), abs(p.z))));
    floorColor += vec3(0.15, 0.2, 0.09) * origin;
    if (uBounds.z > 0.5) {
      float border = 1.0 - smoothstep(0.012, 0.032, min(abs(abs(p.x) - uBounds.x), abs(abs(p.z) - uBounds.y)));
      floorColor += vec3(0.16, 0.19, 0.10) * border;
    }
    if (uStart.z > 0.5) {
      float startDisc = 1.0 - smoothstep(0.15, 0.19, length(p.xz - uStart.xy));
      floorColor += vec3(0.09, 0.12, 0.07) * startDisc;
    }
    if (uGoal.w > -0.5) {
      float goalDist = length(p.xz - uGoal.xy);
      float goalRing = 1.0 - smoothstep(0.012, 0.030, abs(goalDist - uGoal.z));
      float goalFill = 1.0 - smoothstep(uGoal.z * 0.7, uGoal.z, goalDist);
      vec3 goalColor = uGoal.w > 0.5 ? vec3(0.95, 0.86, 0.45) : vec3(0.60, 0.76, 0.36);
      floorColor = mix(floorColor, goalColor, clamp(goalRing + goalFill * 0.35, 0.0, 0.8));
    }
    if (uToken.w > -0.5) {
      float tokenDist = length(p.xz - uToken.xy);
      float disc = 1.0 - smoothstep(uToken.z * 0.82, uToken.z, tokenDist);
      float rim = 1.0 - smoothstep(0.014, 0.030, abs(tokenDist - uToken.z * 1.15));
      vec3 tokenColor = mix(vec3(0.85, 0.95, 0.55), vec3(0.96, 0.42, 0.28), clamp(uToken.w, 0.0, 1.0));
      floorColor = mix(floorColor, tokenColor * 1.12, clamp(disc + rim * 0.8, 0.0, 0.95));
    }
    for (int i = 0; i < 8; i += 1) {
      if (uTrail[i].z <= 0.001) break;
      float td = length(p.xz - uTrail[i].xy);
      floorColor = mix(floorColor, vec3(0.55, 0.68, 0.34), uTrail[i].z * (1.0 - smoothstep(0.06, 0.15, td)));
    }
    for (int i = 0; i < 4; i += 1) {
      if (uRipples[i].w < 0.5) break;
      float rr = length(p.xz - uRipples[i].xy);
      float prog = uRipples[i].z;
      float ring = (1.0 - smoothstep(0.02, 0.08, abs(rr - prog * 1.7))) * (1.0 - prog);
      floorColor += vec3(0.30, 0.36, 0.18) * ring;
    }
    for (int i = 0; i < 8; i += 1) {
      if (float(i) >= uCount) break;
      floorColor *= shadow(p, uSpheres[i]);
    }
    for (int i = 0; i < 4; i += 1) {
      if (float(i) >= uBoxCount) break;
      floorColor *= shadowBox(p, uBoxC[i], uBoxH[i].xyz);
    }
    color = mix(color, floorColor, exp(-floorT * 0.008));
  }
  float bestT = floorT;
  vec4 hitSphereData = vec4(0.0);
  vec3 hitBC = vec3(0.0);
  vec3 hitBH = vec3(0.0);
  bool hitIsBox = false;
  bool hitAlt = false;
  for (int i = 0; i < 8; i += 1) {
    if (float(i) >= uCount) break;
    float t = hitSphere(ro, rd, uSpheres[i]);
    if (t > 0.0 && t < bestT) {
      bestT = t;
      hitSphereData = uSpheres[i];
      hitIsBox = false;
      hitAlt = uSphereAlt[i] > 0.5;
    }
  }
  for (int i = 0; i < 4; i += 1) {
    if (float(i) >= uBoxCount) break;
    float t = hitBox(ro, rd, uBoxC[i].xyz, uBoxH[i].xyz);
    if (t > 0.0 && t < bestT) {
      bestT = t;
      hitSphereData = vec4(0.0);
      hitBC = uBoxC[i].xyz;
      hitBH = uBoxH[i].xyz;
      hitIsBox = true;
      hitAlt = uBoxC[i].w > 0.5;
    }
  }
  if (hitIsBox) {
    vec3 p = ro + rd * bestT;
    color = boxMaterial(p, boxNormal(p, hitBC, hitBH), rd, hitAlt);
  } else if (hitSphereData.w > 0.0) {
    vec3 p = ro + rd * bestT;
    vec3 normal = normalize(p - hitSphereData.xyz);
    color = material(p, normal, rd, hitAlt);
  }
  if (uGoal.w > -0.5 && beamHit(ro, rd, uGoal.xy, 1.7) > 0.5) {
    color = mix(color, vec3(0.95, 0.86, 0.45), uGoal.w > 0.5 ? 0.8 : 0.55);
  }
  if (uToken.w > -0.5 && beamHit(ro, rd, uToken.xy, 1.9) > 0.5) {
    vec3 beamColor = mix(vec3(0.85, 0.95, 0.55), vec3(0.96, 0.42, 0.28), clamp(uToken.w, 0.0, 1.0));
    color = mix(color, beamColor * 1.1, 0.8);
  }
  float sceneT = min(floorT, bestT);
  color = mix(color, vec3(0.052, 0.078, 0.065), 1.0 - exp(-max(sceneT, 0.0) * 0.014));
  float vignette = 1.0 - 0.14 * pow(length(uv) / 1.5, 2.0);
  color *= max(0.65, vignette);
  color = pow(color, vec3(0.87));
  gl_FragColor = vec4(color, 1.0);
}
`;

const MAX_SECTIONS = 8;
const HIDDEN = -1;

export class SliceRenderer {
  constructor(canvas, onError) {
    this.canvas = canvas;
    this.onError = onError;
    this.sections = [];
    this.markers = null;
    this.yaw = 0.38;
    this.pitch = 0.22;
    this.distance = 7.2;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!this.gl) throw new Error('WebGL unavailable');
    this.initialize();
    this.bindControls();
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
      onError(true);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.initialize();
        this.lost = false;
        this.draw();
        onError(false);
      } catch (error) { console.error(error); onError(true); }
    });
  }

  initialize() {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    };
    const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const fragmentSource = precision?.precision ? FRAGMENT : FRAGMENT.replace('precision highp float;', 'precision mediump float;');
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.uniforms = {};
    for (const name of ['uResolution', 'uEye', 'uLookY', 'uCount', 'uBoxCount', 'uToken', 'uGoal', 'uStart', 'uBounds']) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
    this.uniforms.uSpheres = gl.getUniformLocation(this.program, 'uSpheres[0]') || gl.getUniformLocation(this.program, 'uSpheres');
    this.uniforms.uSphereAlt = gl.getUniformLocation(this.program, 'uSphereAlt[0]') || gl.getUniformLocation(this.program, 'uSphereAlt');
    this.uniforms.uBoxC = gl.getUniformLocation(this.program, 'uBoxC[0]') || gl.getUniformLocation(this.program, 'uBoxC');
    this.uniforms.uBoxH = gl.getUniformLocation(this.program, 'uBoxH[0]') || gl.getUniformLocation(this.program, 'uBoxH');
    this.uniforms.uTrail = gl.getUniformLocation(this.program, 'uTrail[0]') || gl.getUniformLocation(this.program, 'uTrail');
    this.uniforms.uRipples = gl.getUniformLocation(this.program, 'uRipples[0]') || gl.getUniformLocation(this.program, 'uRipples');
  }

  bindControls() {
    let pointer = null;
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add('dragging');
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      this.yaw -= (event.clientX - pointer.x) * 0.006;
      this.pitch = Math.max(0.02, Math.min(1.05, this.pitch + (event.clientY - pointer.y) * 0.004));
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      this.draw();
    });
    const release = () => { pointer = null; this.canvas.classList.remove('dragging'); };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener('lostpointercapture', release);
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.distance = Math.max(4.8, Math.min(12, this.distance + event.deltaY * 0.006));
      this.draw();
    }, { passive: false });
    this.canvas.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '='].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.directionHandler?.(event.key)) return;
      if (event.key === 'ArrowLeft') this.yaw -= 0.1;
      if (event.key === 'ArrowRight') this.yaw += 0.1;
      if (event.key === 'ArrowUp') this.pitch = Math.min(1.05, this.pitch + 0.07);
      if (event.key === 'ArrowDown') this.pitch = Math.max(0.02, this.pitch - 0.07);
      if (event.key === '+' || event.key === '=') this.distance = Math.max(4.8, this.distance - 0.3);
      if (event.key === '-') this.distance = Math.min(12, this.distance + 0.3);
      this.draw();
    });
  }

  resetView() {
    this.yaw = 0.38;
    this.pitch = 0.22;
    this.distance = 7.2;
    this.draw();
  }

  setSections(sections) {
    this.sections = sections.slice(0, MAX_SECTIONS);
    this.draw();
  }

  setMarkers(markers) {
    this.markers = markers;
    this.draw();
  }

  setRipples(ripples) {
    this.ripples = ripples;
    this.draw();
  }

  draw() {
    if (this.lost) return;
    const { canvas, gl, uniforms } = this;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    // Cap render resolution; idle scenes do not request animation frames.
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75, 1600 / box.width);
    const width = Math.max(1, Math.round(box.width * ratio));
    const height = Math.max(1, Math.round(box.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height);
    gl.uniform2f(uniforms.uResolution, width, height);
    const distance = this.distance * (box.width / box.height < 1.2 ? 1.18 : 1);
    gl.uniform3f(uniforms.uEye, Math.sin(this.yaw) * Math.cos(this.pitch) * distance, 1.12 + Math.sin(this.pitch) * distance, Math.cos(this.yaw) * Math.cos(this.pitch) * distance);
    const packed = new Float32Array(MAX_SECTIONS * 4);
    const sphereAlt = new Float32Array(MAX_SECTIONS);
    const boxC = new Float32Array(16);
    const boxH = new Float32Array(16);
    let sphereCount = 0;
    let boxCount = 0;
    this.sections.forEach((section) => {
      if (section.type === 'box') {
        if (boxCount < 4) {
          boxC.set([...section.center, section.alt ? 1 : 0], boxCount * 4);
          boxH.set([...(section.kind === 'box' ? section.half : [0, 0, 0]), 0], boxCount * 4);
          boxCount += 1;
        }
      } else if (sphereCount < MAX_SECTIONS) {
        packed.set([...section.center, section.radius], sphereCount * 4);
        sphereAlt[sphereCount] = section.alt ? 1 : 0;
        sphereCount += 1;
      }
    });
    gl.uniform4fv(uniforms.uSpheres, packed);
    gl.uniform1fv(uniforms.uSphereAlt, sphereAlt);
    gl.uniform4fv(uniforms.uBoxC, boxC);
    gl.uniform4fv(uniforms.uBoxH, boxH);
    gl.uniform1f(uniforms.uCount, sphereCount);
    gl.uniform1f(uniforms.uBoxCount, boxCount);
    const corridor = this.markers;
    gl.uniform1f(uniforms.uLookY, corridor ? 0.5 : 1.12);
    gl.uniform4f(uniforms.uToken, ...(corridor ? [corridor.token[0], corridor.token[1], corridor.tokenRadius, corridor.flash] : [0, 0, 0, HIDDEN]));
    gl.uniform4f(uniforms.uGoal, ...(corridor ? [corridor.goal[0], corridor.goal[1], 0.3, corridor.won ? 1 : 0] : [0, 0, 0, HIDDEN]));
    gl.uniform3f(uniforms.uStart, ...(corridor ? [corridor.start[0], corridor.start[1], 1] : [0, 0, 0]));
    gl.uniform3f(uniforms.uBounds, ...(corridor ? [corridor.bounds.x, corridor.bounds.z, 1] : [0, 0, 0]));
    const trailData = new Float32Array(24);
    (corridor?.trail ?? []).slice(0, 8).forEach((p, i) => trailData.set(p, i * 3));
    gl.uniform3fv(uniforms.uTrail, trailData);
    const rippleData = new Float32Array(16);
    (this.ripples ?? []).slice(0, 4).forEach((r, i) => rippleData.set([r[0], r[1], r[2], 1], i * 4));
    gl.uniform4fv(uniforms.uRipples, rippleData);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
