// Shared WebGL plumbing for the full-screen ray-traced views.
export const VERTEX = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

export function createProgram(gl, fragment) {
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
  const source = precision?.precision ? fragment : fragment.replace('precision highp float;', 'precision mediump float;');
  const vertex = compile(gl.VERTEX_SHADER, VERTEX);
  const frag = compile(gl.FRAGMENT_SHADER, source);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  return program;
}

// Array uniforms resolve as either `name[0]` or `name` depending on driver.
export function uniformLocations(gl, program, names) {
  const out = {};
  for (const name of names) {
    out[name] = gl.getUniformLocation(program, `${name}[0]`) ?? gl.getUniformLocation(program, name);
  }
  return out;
}

// Size the drawing buffer to the element, with a capped pixel ratio and
// width so large screens never render more than they need.
export function fitCanvas(canvas, maxWidth = 1600, maxRatio = 1.75) {
  const box = canvas.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const ratio = Math.min(window.devicePixelRatio || 1, maxRatio, maxWidth / box.width);
  const width = Math.max(1, Math.round(box.width * ratio));
  const height = Math.max(1, Math.round(box.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, aspect: box.width / box.height };
}

// Drag-to-orbit, wheel-to-zoom. Calls onChange after each interaction; the
// owner decides when to redraw, so idle views stay idle.
export class Orbit {
  constructor(canvas, view, onChange) {
    this.home = { ...view };
    Object.assign(this, view);
    this.onChange = onChange;
    let pointer = null;
    canvas.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
      canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      this.yaw -= (event.clientX - pointer.x) * 0.006;
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch + (event.clientY - pointer.y) * 0.004));
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      this.onChange();
    });
    const release = () => { pointer = null; canvas.classList.remove('dragging'); };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance + event.deltaY * 0.006));
      this.onChange();
    }, { passive: false });
  }

  reset(view = {}) {
    Object.assign(this.home, view);
    Object.assign(this, this.home);
    this.onChange();
  }

  eye(lookY, narrow) {
    const d = this.distance * (narrow ? 1.18 : 1);
    return [
      Math.sin(this.yaw) * Math.cos(this.pitch) * d,
      lookY + Math.sin(this.pitch) * d,
      Math.cos(this.yaw) * Math.cos(this.pitch) * d,
    ];
  }
}

export function watchContext(canvas, onLost, onRestored) {
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); onLost(); });
  canvas.addEventListener('webglcontextrestored', onRestored);
}

// Shared GLSL snippets.
export const GLSL_BOX = `
vec2 boxSpan(vec3 ro, vec3 rd, vec3 c, vec3 h) {
  vec3 m = vec3(1.0) / rd;
  vec3 n = m * (ro - c);
  vec3 k = abs(m) * h;
  vec3 t1 = -n - k;
  vec3 t2 = -n + k;
  float tN = max(max(t1.x, t1.y), t1.z);
  float tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tF < 0.0) return vec2(-1.0);
  return vec2(tN, tF);
}
vec3 boxNormal(vec3 p, vec3 c, vec3 h) {
  vec3 d = (p - c) / h;
  vec3 a = abs(d);
  if (a.x > a.y && a.x > a.z) return vec3(sign(d.x), 0.0, 0.0);
  if (a.y > a.z) return vec3(0.0, sign(d.y), 0.0);
  return vec3(0.0, 0.0, sign(d.z));
}
// World distance from a point on a box surface to the nearest edge.
float boxEdge(vec3 p, vec3 c, vec3 h) {
  vec3 d = h - abs(p - c);
  vec3 a = abs((p - c) / h);
  if (a.x > a.y && a.x > a.z) return min(d.y, d.z);
  if (a.y > a.z) return min(d.x, d.z);
  return min(d.x, d.y);
}
`;

// Five floor patterns, one per parallel-world layer. w is the line width.
export const GLSL_PATTERN = `
float lineAt(float v, float w) { return 1.0 - smoothstep(w * 0.5, w, abs(fract(v) - 0.5)); }
float pattern(float id, vec2 p, float w) {
  if (id < 0.5) { vec2 q = fract(p * 2.0) - 0.5; return 1.0 - smoothstep(0.05, 0.05 + w * 2.0, length(q)); }
  if (id < 1.5) return lineAt((p.x + p.y) * 1.6 + 0.5, w * 1.6);
  if (id < 2.5) return max(lineAt(p.x * 1.0 + 0.5, w), lineAt(p.y * 1.0 + 0.5, w));
  if (id < 3.5) {
    float a = lineAt(p.y * 1.3 + 0.5, w * 1.3);
    float b = lineAt((p.y * 0.5 + p.x * 0.866) * 1.3 + 0.5, w * 1.3);
    float c = lineAt((p.y * 0.5 - p.x * 0.866) * 1.3 + 0.5, w * 1.3);
    return max(a, max(b, c));
  }
  return lineAt(length(p) * 1.6 + 0.5, w * 1.6);
}
`;
