// Render-only props. These analytic surfaces never enter the collision field.
// Their footprint stays around the existing device marker / actor carry ring.
export const SCENE_DETAILS = `
vec3 detailLight(vec3 base, vec3 n, vec3 rd, float metal) {
  float sun = max(dot(n, SUN_DIR), 0.0);
  float fill = max(dot(n, normalize(vec3(0.65, 0.35, -0.5))), 0.0);
  vec3 c = base * (0.48 + 0.55 * sun + 0.16 * fill);
  c += SUN_COL * pow(max(dot(reflect(-SUN_DIR, n), -rd), 0.0), 28.0) * metal * 0.3;
  return c;
}

void detailBox(vec3 ro, vec3 rd, vec3 center, vec3 halfSize, vec3 base, float metal,
    inout float nearest, inout vec3 color) {
  float t = boxSpan(ro, rd, center, halfSize).x;
  if (t <= 0.0 || t >= nearest) return;
  vec3 p = ro + rd * t;
  vec3 n = boxNormal(p, center, halfSize);
  float edge = 1.0 - smoothstep(0.002, 0.012, boxEdge(p, center, halfSize));
  color = detailLight(mix(base, IVORY, edge * 0.24), n, rd, metal);
  nearest = t;
}

float detailEllipsoid(vec3 ro, vec3 rd, vec3 center, vec3 size, out vec3 normal) {
  vec3 p = (ro - center) / size;
  vec3 d = rd / size;
  float a = dot(d, d);
  float b = dot(p, d);
  float h = b * b - a * (dot(p, p) - 1.0);
  normal = vec3(0.0, 1.0, 0.0);
  if (h < 0.0) return -1.0;
  float t = (-b - sqrt(h)) / a;
  if (t <= 0.0) return -1.0;
  normal = normalize((ro + rd * t - center) / (size * size));
  return t;
}

void detailOval(vec3 ro, vec3 rd, vec3 center, vec3 size, vec3 base,
    inout float nearest, inout vec3 color) {
  vec3 n;
  float t = detailEllipsoid(ro, rd, center, size, n);
  if (t <= 0.0 || t >= nearest) return;
  color = detailLight(base, n, rd, 0.0);
  nearest = t;
}

// Hollow cylindrical rim, including the annular top and bottom. The open
// centre reads as a real socket instead of a solid object hiding the core.
void detailRim(vec3 ro, vec3 rd, vec2 xz, vec2 heights, vec2 radii, vec3 base,
    inout float nearest, inout vec3 color) {
  vec2 p = ro.xz - xz;
  float a = dot(rd.xz, rd.xz);
  float b = dot(p, rd.xz);
  for (int k = 0; k < 2; k += 1) {
    float radius = k == 0 ? radii.x : radii.y;
    float disc = b * b - a * (dot(p, p) - radius * radius);
    if (a > 0.00001 && disc >= 0.0) {
      for (int side = 0; side < 2; side += 1) {
        float t = (-b + (side == 0 ? -1.0 : 1.0) * sqrt(disc)) / a;
        vec3 q = ro + rd * t;
        if (t > 0.0 && t < nearest && q.y >= heights.x && q.y <= heights.y) {
          vec3 n = normalize(vec3(q.x - xz.x, 0.0, q.z - xz.y)) * (k == 0 ? -1.0 : 1.0);
          color = detailLight(base, n, rd, 1.0);
          nearest = t;
        }
      }
    }
    if (abs(rd.y) > 0.00001) {
      float y = k == 0 ? heights.x : heights.y;
      float t = (y - ro.y) / rd.y;
      float d = length((ro + rd * t).xz - xz);
      if (t > 0.0 && t < nearest && d >= radii.x && d <= radii.y) {
        color = detailLight(mix(base, IVORY, 0.25), vec3(0.0, k == 0 ? -1.0 : 1.0, 0.0), rd, 1.0);
        nearest = t;
      }
    }
  }
}

// Hooded courier: cloth mantle, satchel, boots and hands. Local +Z is the
// facing direction; the carried core fits inside the existing 0.40 ring.
float hitActor(vec3 ro, vec3 rd, vec2 pos, float yaw, float bob, float carrying,
    float flashAmt, vec3 layerTint, out vec3 color) {
  vec2 fwd = vec2(sin(yaw), cos(yaw));
  vec2 right = vec2(fwd.y, -fwd.x);
  vec2 rel = ro.xz - pos;
  vec3 p = vec3(dot(rel, right), ro.y, dot(rel, fwd));
  vec3 d = vec3(dot(rd.xz, right), rd.y, dot(rd.xz, fwd));
  color = vec3(0.0);
  if (boxSpan(p, d, vec3(0.0, 0.4, 0.08), vec3(0.43, 0.43, 0.44)).x < 0.0) return -1.0;
  float nearest = 1e6;
  vec3 cloth = mix(IVORY, ALERT, clamp(flashAmt, 0.0, 1.0));
  vec3 coat = mix(vec3(0.18, 0.30, 0.30), layerTint, 0.08);
  vec3 leather = vec3(0.34, 0.22, 0.14);
  vec3 n;
  float t = hitCone(p, d, vec2(0.0), 0.12, 0.46 + bob, 0.155, 0.095, n);
  if (t > 0.0 && t < nearest) {
    vec3 q = p + d * t;
    float pleat = 0.5 + 0.5 * cos(atan(q.x, q.z) * 8.0);
    float hem = 1.0 - smoothstep(0.0, 0.025, q.y - 0.12);
    color = detailLight(mix(coat * (0.88 + pleat * 0.12), GOLD, hem * 0.65), n, d, 0.0);
    nearest = t;
  }
  // The asymmetry of a satchel and its flap makes the back readable too.
  detailBox(p, d, vec3(0.025, 0.34 + bob, -0.135), vec3(0.105, 0.115, 0.055), leather, 0.0, nearest, color);
  detailBox(p, d, vec3(0.025, 0.43 + bob, -0.142), vec3(0.11, 0.025, 0.065), leather * 1.35, 0.0, nearest, color);
  detailBox(p, d, vec3(0.025, 0.345 + bob, -0.194), vec3(0.025, 0.038, 0.008), GOLD, 1.0, nearest, color);
  // Broad ivory shoulder mantle, separate from the dark pleated coat.
  detailOval(p, d, vec3(0.0, 0.46 + bob, 0.0), vec3(0.185, 0.085, 0.125), cloth, nearest, color);
  detailBox(p, d, vec3(0.0, 0.44 + bob, 0.119), vec3(0.025, 0.032, 0.012), GOLD, 1.0, nearest, color);
  t = detailEllipsoid(p, d, vec3(0.0, 0.61 + bob, 0.0), vec3(0.105, 0.125, 0.105), n);
  if (t > 0.0 && t < nearest) {
    vec3 q = p + d * t - vec3(0.0, 0.61 + bob, 0.0);
    float face = step(0.055, q.z) * step(abs(q.x), 0.078) * step(abs(q.y + 0.015), 0.057);
    vec3 base = mix(cloth, vec3(0.035, 0.075, 0.09), face);
    float eyes = (1.0 - smoothstep(0.009, 0.016, abs(abs(q.x) - 0.034))) * (1.0 - smoothstep(0.005, 0.012, abs(q.y + 0.003)));
    color = detailLight(base, n, d, 0.0) + IVORY * face * eyes * 0.65;
    nearest = t;
  }
  for (int side = 0; side < 2; side += 1) {
    float s = side == 0 ? -1.0 : 1.0;
    detailOval(p, d, vec3(s * 0.075, 0.06, s * bob * 1.3), vec3(0.063, 0.06, 0.085), leather * 0.65, nearest, color);
    detailOval(p, d, vec3(s * 0.16, 0.345 + bob, carrying * 0.075), vec3(0.05, 0.11, 0.06 + carrying * 0.025), coat, nearest, color);
    detailOval(p, d, vec3(s * mix(0.17, 0.125, carrying), mix(0.26, 0.42, carrying) + bob, mix(0.025, 0.225, carrying)), vec3(0.04, 0.04, 0.045), cloth, nearest, color);
  }
  if (carrying > 0.5) {
    float edge;
    t = hitCrystal(p, d, vec3(0.0, 0.49 + bob, 0.23), 0.14, n, edge);
    if (t > 0.0 && t < nearest) { nearest = t; color = shadeCrystal(d, n, edge); }
  }
  return nearest < 1e5 ? nearest : -1.0;
}

float hitSocket(vec3 ro, vec3 rd, out vec3 color) {
  vec3 p = ro - vec3(uSocket.x, 0.0, uSocket.y);
  color = vec3(0.0);
  if (uSocket.z < 0.5 || boxSpan(p, rd, vec3(0.0, 0.18, 0.0), vec3(0.36, 0.2, 0.36)).x < 0.0) return -1.0;
  float t = 1e6;
  vec3 metal = vec3(0.32, 0.25, 0.16);
  vec3 signal = mix(vec3(0.11, 0.25, 0.28), vec3(0.35, 0.88, 0.98), uSocket.w) + vec3(0.18, 0.22, 0.20) * uPowerFx.y;
  detailBox(p, rd, vec3(0.0, 0.035, 0.0), vec3(0.29, 0.035, 0.29), vec3(0.14, 0.21, 0.23), 0.0, t, color);
  detailRim(p, rd, vec2(0.0), vec2(0.07, 0.15), vec2(0.18, 0.29), metal, t, color);
  detailRim(p, rd, vec2(0.0), vec2(0.15, 0.17), vec2(0.235, 0.265), signal, t, color);
  for (int k = 0; k < 4; k += 1) {
    float contact = mix(0.25, 0.215, uPowerFx.z);
    vec2 offset = k == 0 ? vec2(contact, 0.0) : k == 1 ? vec2(-contact, 0.0) : k == 2 ? vec2(0.0, contact) : vec2(0.0, -contact);
    detailBox(p, rd, vec3(offset.x, 0.20, offset.y), vec3(0.045, 0.075, 0.045), metal, 1.0, t, color);
    detailBox(p, rd, vec3(offset.x, 0.278, offset.y), vec3(0.035, 0.008, 0.035), signal, 1.0, t, color);
  }
  return t < 1e5 ? t : -1.0;
}

float hitLatch(vec3 ro, vec3 rd, out vec3 color) {
  vec3 p = ro - vec3(uLatch.x, 0.0, uLatch.y);
  color = vec3(0.0);
  if (uLatch.z < 0.5 || boxSpan(p, rd, vec3(0.0, 0.25, 0.0), vec3(0.3, 0.28, 0.3)).x < 0.0) return -1.0;
  float t = 1e6;
  vec3 brass = vec3(0.53, 0.36, 0.16);
  detailBox(p, rd, vec3(0.0, 0.035, 0.0), vec3(0.25, 0.035, 0.25), vec3(0.16, 0.21, 0.22), 0.0, t, color);
  for (int k = 0; k < 2; k += 1) {
    float x = k == 0 ? -0.12 : 0.12;
    detailBox(p, rd, vec3(x, 0.15, 0.0), vec3(0.045, 0.09, 0.07), brass, 1.0, t, color);
  }
  detailBox(p, rd, vec3(0.0, 0.075, 0.18), vec3(0.105, 0.01, 0.024), mix(GOLD * 0.35, ITEM_COL, uLatch.w), 1.0, t, color);
  // A tilted lever with a broad grip. State changes only with the real latch.
  float angle = mix(-0.55, 0.65, uLatchFx.z);
  float c = cos(angle), s = sin(angle);
  vec3 q = p - vec3(0.0, 0.20, 0.0);
  vec3 lr = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
  vec3 ld = vec3(rd.x, rd.y * c - rd.z * s, rd.y * s + rd.z * c);
  detailBox(lr, ld, vec3(0.0, 0.12, 0.0), vec3(0.025, 0.14, 0.025), brass, 1.0, t, color);
  detailBox(lr, ld, vec3(0.0, 0.26, 0.0), vec3(0.16, 0.035, 0.04), IVORY * 0.8, 0.0, t, color);
  return t < 1e5 ? t : -1.0;
}

float hitReceiver(vec3 ro, vec3 rd, out vec3 color) {
  vec3 p = ro - vec3(uGoal.x, 0.0, uGoal.y);
  color = vec3(0.0);
  if (uGoal.w <= 0.0 || boxSpan(p, rd, vec3(0.0, 0.12, 0.0), vec3(0.36, 0.16, 0.36)).x < 0.0) return -1.0;
  float t = 1e6;
  float done = step(1.5, uGoal.w);
  vec3 brass = vec3(0.56, 0.40, 0.19);
  detailBox(p, rd, vec3(0.0, 0.035, 0.0), vec3(0.30, 0.035, 0.30), vec3(0.19, 0.24, 0.24), 0.0, t, color);
  detailRim(p, rd, vec2(0.0), vec2(0.07, 0.12), vec2(0.21, 0.32), brass, t, color);
  detailRim(p, rd, vec2(0.0), vec2(0.12, 0.135), vec2(0.29, 0.315), mix(GOLD, ITEM_COL, done), t, color);
  for (int k = 0; k < 4; k += 1) {
    float arrival = clamp((0.3 - uGoal.z) / 0.06, 0.0, 1.0);
    vec2 corner = vec2(k < 2 ? -1.0 : 1.0, (k == 0 || k == 2) ? -1.0 : 1.0) * mix(0.22, 0.18, done * arrival);
    detailBox(p, rd, vec3(corner.x, 0.16, corner.y), vec3(0.045, 0.07, 0.045), brass, 1.0, t, color);
  }
  return t < 1e5 ? t : -1.0;
}

// Permanent scenery lives on the plinth rim, outside the walking bounds.
// It has no W-dependent visibility and supplies no hidden geometry hints.
float hitStationDressing(vec3 ro, vec3 rd, out vec3 color) {
  color = vec3(0.0);
  if (uSocket.z < 0.0) return -1.0;
  float t = 1e6;
  for (int k = 0; k < 4; k += 1) {
    vec2 corner = vec2(k < 2 ? -1.0 : 1.0, (k == 0 || k == 2) ? -1.0 : 1.0) * (uBounds.xy + 0.13);
    vec3 p = ro - vec3(corner.x, 0.0, corner.y);
    if (boxSpan(p, rd, vec3(0.0, 0.18, 0.0), vec3(0.115, 0.19, 0.115)).x < 0.0) continue;
    detailBox(p, rd, vec3(0.0, 0.035, 0.0), vec3(0.105, 0.035, 0.105), vec3(0.30, 0.35, 0.33), 0.0, t, color);
    detailBox(p, rd, vec3(0.0, 0.15, 0.0), vec3(0.065, 0.10, 0.065), vec3(0.34, 0.25, 0.16), 1.0, t, color);
    float previous = t;
    detailBox(p, rd, vec3(0.0, 0.26, 0.0), vec3(0.069, 0.025, 0.069), GOLD * 0.85, 0.0, t, color);
    if (t < previous) color += GOLD * 0.22;
    detailBox(p, rd, vec3(0.0, 0.30, 0.0), vec3(0.082, 0.015, 0.082), vec3(0.32, 0.30, 0.25), 1.0, t, color);
  }
  return t < 1e5 ? t : -1.0;
}

vec3 stationFloorDetails(vec2 p, vec3 floorColor) {
  float edgeDistance = max(abs(p.x) - uBounds.x, abs(p.y) - uBounds.y);
  float border = 1.0 - smoothstep(0.012, 0.026, abs(edgeDistance - 0.13));
  floorColor = mix(floorColor, vec3(0.42, 0.32, 0.20), border * 0.70);
  // Mineral staining and chipped paving stay at the perimeter, where they
  // cannot compete with the core, circuit or true collision outlines.
  float wear = smoothstep(-0.65, -0.1, edgeDistance);
  float mottled = smoothstep(0.30, 0.72, sin(p.x * 8.1 + sin(p.y * 5.0)) * sin(p.y * 7.2));
  floorColor = mix(floorColor, vec3(0.23, 0.30, 0.23), wear * mottled * 0.38);
  // Flush inspection covers, with small slotted vents and corner fasteners.
  for (int side = 0; side < 2; side += 1) {
    vec2 q = p - vec2((side == 0 ? -1.0 : 1.0) * (uBounds.x - 0.30), side == 0 ? -0.80 : 0.90);
    vec2 a = abs(q);
    if (a.x < 0.15 && a.y < 0.34) {
      float lip = 1.0 - smoothstep(0.008, 0.024, min(0.15 - a.x, 0.34 - a.y));
      float slot = (1.0 - smoothstep(0.008, 0.020, abs(fract(q.y / 0.10) - 0.5) * 0.10)) * (1.0 - smoothstep(0.08, 0.11, a.x));
      floorColor = mix(vec3(0.22, 0.25, 0.23) * (1.0 - slot * 0.45), vec3(0.47, 0.39, 0.27), lip * 0.65);
      float bolt = 1.0 - smoothstep(0.008, 0.017, length(a - vec2(0.105, 0.285)));
      floorColor = mix(floorColor, IVORY * 0.55, bolt * 0.65);
    }
  }
  // Clamps on the existing socket cable. They are flat material details.
  vec2 ab = uRelayPorts.xy - uSocket.xy;
  float along = dot(p - uSocket.xy, ab) / max(dot(ab, ab), 0.001);
  float side = length(p - uSocket.xy - ab * along);
  float clip = 1.0 - smoothstep(0.025, 0.045, abs(fract(along * 4.0) - 0.5));
  if (along > 0.12 && along < 0.90 && side < 0.09) floorColor = mix(floorColor, vec3(0.55, 0.43, 0.26), clip * 0.80);
  return floorColor;
}
`;
