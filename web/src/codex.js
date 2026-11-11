import { CURIOSITY_CATALOG } from './exploration-radar.js';
import { ALL_ROOM_TEMPLATES, HIDDEN_ROUTE_RECIPES } from './rooms.js';
import { FLATLAND_LEVELS } from './flatland/levels.js';
import { normalizeProgress } from './flatland/progress.js';
import { FRIENDS, normalizeCollection } from './flatland/discoveries.js';
import { gardenCollection } from './flatland/companions.js';

export const CODEX_STORAGE_KEY = 'wslice-codex-v1';
const RANK_ORDER = ['—', 'B', 'A', 'S', 'S+'];

function betterRank(current = '—', candidate = '—') {
  const curIdx = RANK_ORDER.indexOf(current);
  const candIdx = RANK_ORDER.indexOf(candidate);
  return candIdx > curIdx ? candidate : (curIdx >= 0 ? current : '—');
}

function defaultState() {
  return {
    version: 1,
    curiosities: {},
    secrets: {},
    rooms: {},
    riftClears: 0,
    chapters: {
      intro: { runs: 0, clears: 0, bestScore: 0, bestRank: '—' },
      expedition: { runs: 0, clears: 0, bestScore: 0, bestRank: '—', sanctumChoirClears: 0 },
    },
  };
}

function resolveStorage(storageOrOptions) {
  if (storageOrOptions && typeof storageOrOptions.getItem === 'function') return storageOrOptions;
  if (storageOrOptions && typeof storageOrOptions === 'object' && 'storage' in storageOrOptions) {
    return storageOrOptions.storage;
  }
  return globalThis.localStorage;
}

export class CodexStore {
  constructor(storageOrOptions = globalThis.localStorage) {
    this.storage = resolveStorage(storageOrOptions);
    this.data = this._load();
  }

  _readRaw(key, fallback = null) {
    try {
      return this.storage?.getItem?.(key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  _writeRaw(key, value) {
    try {
      this.storage?.setItem?.(key, value);
    } catch {
      // Private browsing / sandboxed contexts degrade gracefully in memory.
    }
  }

  _load() {
    try {
      const parsed = JSON.parse(this._readRaw(CODEX_STORAGE_KEY, 'null'));
      if (!parsed || typeof parsed !== 'object') return defaultState();
      const base = defaultState();
      return {
        version: 1,
        curiosities: parsed.curiosities && typeof parsed.curiosities === 'object' ? { ...parsed.curiosities } : {},
        secrets: parsed.secrets && typeof parsed.secrets === 'object' ? { ...parsed.secrets } : {},
        rooms: parsed.rooms && typeof parsed.rooms === 'object' ? { ...parsed.rooms } : {},
        riftClears: Number.isFinite(parsed.riftClears) && parsed.riftClears >= 0 ? Math.floor(parsed.riftClears) : 0,
        chapters: {
          intro: { ...base.chapters.intro, ...(parsed.chapters?.intro || {}) },
          expedition: { ...base.chapters.expedition, ...(parsed.chapters?.expedition || {}) },
        },
      };
    } catch {
      return defaultState();
    }
  }

  save() {
    this._writeRaw(CODEX_STORAGE_KEY, JSON.stringify(this.data));
  }

  recordRoomVisit(roomId) {
    if (!roomId || !ALL_ROOM_TEMPLATES.some(t => t.id === roomId)) return false;
    const prev = this.data.rooms[roomId] || { visited: false, clears: 0 };
    if (!prev.visited) {
      this.data.rooms[roomId] = { ...prev, visited: true };
      this.save();
      return true;
    }
    return false;
  }

  recordRoomClear(roomId) {
    if (!roomId || !ALL_ROOM_TEMPLATES.some(t => t.id === roomId)) return false;
    const prev = this.data.rooms[roomId] || { visited: true, clears: 0 };
    this.data.rooms[roomId] = { visited: true, clears: (prev.clears || 0) + 1 };
    this.save();
    return true;
  }

  recordAnomaly(anomalyId, layer = 0) {
    if (!anomalyId || !CURIOSITY_CATALOG.some(c => c.id === anomalyId)) return false;
    const prev = this.data.curiosities[anomalyId];
    const isNew = !prev;
    this.data.curiosities[anomalyId] = {
      count: (prev?.count || 0) + 1,
      firstLayer: prev?.firstLayer ?? layer,
    };
    this.save();
    return isNew;
  }

  recordSecretUnlock(routeId) {
    if (!routeId || !HIDDEN_ROUTE_RECIPES.some(r => r.id === routeId)) return false;
    const prev = this.data.secrets[routeId] || { unlocked: 0, riftClears: 0 };
    const isNew = !prev.unlocked;
    this.data.secrets[routeId] = { ...prev, unlocked: (prev.unlocked || 0) + 1 };
    this.save();
    return isNew;
  }

  recordRiftClear(unlockedRouteIds = []) {
    this.data.riftClears = (this.data.riftClears || 0) + 1;
    for (const routeId of unlockedRouteIds) {
      if (!HIDDEN_ROUTE_RECIPES.some(r => r.id === routeId)) continue;
      const prev = this.data.secrets[routeId] || { unlocked: 1, riftClears: 0 };
      this.data.secrets[routeId] = { ...prev, riftClears: (prev.riftClears || 0) + 1 };
    }
    this.save();
    return true;
  }

  recordSanctumChoirClear() {
    this.data.chapters.expedition.sanctumChoirClears = (this.data.chapters.expedition.sanctumChoirClears || 0) + 1;
    this.save();
    return true;
  }

  recordRunFinish({ mode = 'intro', won = false, banked = 0, rank = 'B' } = {}) {
    const key = mode === 'expedition' ? 'expedition' : 'intro';
    const chapter = this.data.chapters[key];
    chapter.runs = (chapter.runs || 0) + 1;
    if (won) chapter.clears = (chapter.clears || 0) + 1;
    if (banked > (chapter.bestScore || 0)) chapter.bestScore = banked;
    if (won || banked > 0) chapter.bestRank = betterRank(chapter.bestRank, rank);
    this.save();
  }

  readFlatlandSummary() {
    const storyLevels = FLATLAND_LEVELS.filter(level => !level.endless);
    let clearedLevels = 0;
    let totalStars = 0;
    let friendsFound = 0;
    let gardensBloomed = 0;
    const gardensTotal = FLATLAND_LEVELS.filter(level => level.garden).length;

    try {
      const rawStars = JSON.parse(this._readRaw('wslice-flatland-stars', '{}')) || {};
      const rawVisits = JSON.parse(this._readRaw('wslice-flatland-visits', '{}')) || {};
      const normalizedStars = normalizeProgress(rawStars, FLATLAND_LEVELS);
      for (const level of FLATLAND_LEVELS) {
        const entry = rawStars[level.id];
        const starCount = normalizedStars[level.id]
          ?? (Array.isArray(entry) ? entry.filter(Boolean).length : 0);
        totalStars += starCount;
        if (!level.endless && (starCount > 0 || rawVisits?.[level.id] === true)) {
          clearedLevels += 1;
        }
      }
    } catch { /* ignore */ }

    try {
      const rawFriends = JSON.parse(this._readRaw('wslice-flatland-friends', '{}')) || {};
      friendsFound = normalizeCollection(rawFriends).found.length;
    } catch { /* ignore */ }

    try {
      const rawGardens = JSON.parse(this._readRaw('wslice-flatland-gardens', '{}')) || {};
      gardensBloomed = gardenCollection(rawGardens, FLATLAND_LEVELS).count;
    } catch { /* ignore */ }

    return {
      clearedLevels,
      totalLevels: storyLevels.length,
      totalStars,
      friendsFound,
      friendsTotal: FRIENDS.length,
      gardensBloomed,
      gardensTotal,
    };
  }

  summary() {
    const layerLabels = ['Ⅰ 潮汐层', 'Ⅱ 回声层', 'Ⅲ 绽放层'];
    const curiosityItems = CURIOSITY_CATALOG.map(item => {
      const record = this.data.curiosities[item.id] || null;
      return {
        ...item,
        discovered: Boolean(record),
        count: record?.count || 0,
        layerLabel: layerLabels[record?.firstLayer ?? item.layer] || '异维层',
      };
    });
    const secretItems = HIDDEN_ROUTE_RECIPES.map(recipe => {
      const record = this.data.secrets[recipe.id] || null;
      return {
        ...recipe,
        discovered: Boolean(record?.unlocked),
        unlockedCount: record?.unlocked || 0,
        riftClears: record?.riftClears || 0,
      };
    });
    const roomItems = ALL_ROOM_TEMPLATES.map(tpl => {
      const record = this.data.rooms[tpl.id] || null;
      const clears = record?.clears || 0;
      return {
        id: tpl.id,
        name: tpl.name,
        mechanic: tpl.mechanic,
        description: tpl.description,
        mechanismCount: tpl.order.length,
        isFinale: tpl.id === 'sanctum',
        visited: Boolean(record?.visited || clears > 0),
        clears,
      };
    });

    const flatland = this.readFlatlandSummary();
    const curiosityIds = curiosityItems.filter(c => c.discovered).map(c => c.id);
    const secretIds = secretItems.filter(s => s.discovered).map(s => s.id);
    const visitedIds = roomItems.filter(r => r.visited).map(r => r.id);
    const clearedIds = roomItems.filter(r => r.clears > 0).map(r => r.id);

    const totalEntries = curiosityItems.length + secretItems.length + roomItems.length;
    const unlockedEntries = curiosityIds.length + secretIds.length + clearedIds.length;
    const sanctumChoirClears = this.data.chapters.expedition.sanctumChoirClears || 0;
    const routeRiftSum = secretItems.reduce((acc, item) => acc + item.riftClears, 0);
    const riftClears = Math.max(this.data.riftClears || 0, routeRiftSum);

    return {
      curiosities: {
        discovered: curiosityIds.length,
        total: curiosityItems.length,
        ids: curiosityIds,
        items: curiosityItems,
      },
      secrets: {
        unlocked: secretIds.length,
        total: secretItems.length,
        ids: secretIds,
        items: secretItems,
      },
      rooms: {
        visited: visitedIds.length,
        cleared: clearedIds.length,
        total: roomItems.length,
        visitedIds,
        clearedIds,
        items: roomItems,
      },
      flatland,
      chapters: {
        intro: { ...this.data.chapters.intro },
        expedition: { ...this.data.chapters.expedition },
      },
      riftClears,
      sanctumChoirClears,
      counts: {
        curiosities: curiosityIds.length,
        curiositiesTotal: curiosityItems.length,
        secrets: secretIds.length,
        secretsTotal: secretItems.length,
        rooms: visitedIds.length,
        roomsCleared: clearedIds.length,
        roomsTotal: roomItems.length,
        unlockedEntries,
        totalEntries,
        completionPercent: totalEntries ? Math.round((unlockedEntries / totalEntries) * 100) : 0,
      },
      expeditionRecommended: this.data.chapters.intro.clears > 0,
    };
  }
}
