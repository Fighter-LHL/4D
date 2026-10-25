import { dialToW } from './geometry.mjs';
import { W_PARAMS } from './controls.mjs';

export const BASE_COMMIT = '359ea294b8934f1d61473e3ae47247e56a406d75';
export const COPY_VERSION = 'w1-copy-3';
export const PARAMS_VERSION = 'w1-params-2';
// levels-2: the gate gains a cold ball, so only the +W route opens.
export const LEVEL_VERSION = 'w1-levels-2';
export const STUDY_CHAIN = Object.freeze(['gate', 'station-routes', '2-3']);
export const STUDY_COPY = Object.freeze({
  gate: { objective: '到达金色出口。', hints: ['往 +W 和 −W 都走一走，比较球的变化。', '通路让开时，留意出口是否仍然亮着。'], done: '已到达出口。' },
  'station-routes': { objective: '把晶核送到金色接收台。', hints: ['留意开口旁的球体、线路和机械锁。', '一处开口让路时，另一处未必也能通过。'], done: '晶核已送达。' },
  '2-3': { objective: '到达金色出口。', hints: ['观察相邻球体之间的空隙。', '沿W移动时，留意途中出现的空隙。'], done: '已到达出口。' },
  fetch: { objective: '把屋里的晶核带到金色接收台。', hints: ['沿W移动时，留意房间边界的变化。', '拿起晶核后，看看你占的空间有什么变化。'], done: '晶核已送达。' },
});
export const studyLevel = (level, enabled) => enabled && STUDY_COPY[level?.id] ? { ...level, ...STUDY_COPY[level.id] } : level;

// Static build receipt: verify the shipped source manifest before claiming its
// commit. Editing source without refreshing the receipt yields an unknown SHA.
export async function readStudyBuild(fetcher = fetch, digest = async (text) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}) {
  try {
    const build = await fetcher('./study-build.json').then((r) => r.json());
    if (!/^[a-f0-9]{40}$/.test(build.buildCommit) || !Array.isArray(build.files) || !build.files.length)
      return { buildCommit: null, status: 'unsealed' };
    if (!build.files.every((name) => /^[a-z0-9-]+\.(mjs|html|css)$/.test(name)))
      return { buildCommit: null, status: 'invalid_manifest' };
    const hashes = await Promise.all([...build.files].sort().map(async (name) => {
      const response = await fetcher(`./${name}`);
      if (!response.ok) throw new Error('Missing source');
      return `${name}\0${await digest(await response.text())}\n`;
    }));
    const sourceDigest = await digest(hashes.join(''));
    return { buildCommit: sourceDigest === build.sourceDigest ? build.buildCommit : null,
      declaredBuildCommit: build.buildCommit, sourceDigest,
      status: sourceDigest === build.sourceDigest ? 'verified' : 'source_mismatch' };
  } catch { return { buildCommit: null, status: 'unavailable' }; }
}

// In-memory, event-based log. Human predictions, understanding and gaze are
// deliberately not inferred from input. Export covers unfinished runs too.
export class StudySession {
  constructor(config, build, now = performance.now(), id = crypto.randomUUID()) {
    this.started = now;
    this.id = id;
    this.config = config;
    this.metadata = { baseCommit: BASE_COMMIT, buildCommit: build.buildCommit ?? null,
      sourceDigest: build.sourceDigest ?? null, buildStatus: build.status ?? 'unverified', declaredBuildCommit: build.declaredBuildCommit ?? null, copyVersion: COPY_VERSION, paramsVersion: PARAMS_VERSION, levelVersion: LEVEL_VERSION,
      parameters: W_PARAMS, actualCondition: config.condition, requestedCondition: config.requested };
    this.events = [];
    this.ended = false;
  }
  record(type, snapshot = {}, extra = {}, now = performance.now()) {
    if (this.ended) return;
    this.events.push({ type, t_ms: Math.max(0, Math.round(now - this.started)), session_id: this.id,
      condition: this.config.condition, level: snapshot.level ?? null, input_source: snapshot.source ?? null,
      actual_W: snapshot.dial == null ? null : dialToW(snapshot.dial), requested_W: null,
      x: snapshot.run?.pos?.[0] ?? null, z: snapshot.run?.pos?.[1] ?? null,
      carrying: snapshot.run?.carrying ?? false, socketPowered: snapshot.run?.socketPowered?.() ?? false,
      relayLatched: snapshot.run?.relayLatched ?? false, gesture_id: snapshot.gesture ?? null,
      fieldEpoch: snapshot.epoch ?? 0, reason: null, ...extra });
  }
  finish(snapshot, now = performance.now()) {
    this.record('session_end', snapshot, { reason: 'observer_sealed', gates: 'not_assessed' }, now);
    this.ended = true;
  }
  export(now = performance.now()) {
    return { schema: 'w1-session-1', session_id: this.id, ...this.metadata,
      elapsed_ms: this.ended ? this.events.at(-1).t_ms : Math.max(0, Math.round(now - this.started)),
      sealed: this.ended, events: this.events };
  }
}
