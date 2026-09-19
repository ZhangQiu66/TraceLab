import { create } from "zustand";
import type { Pt } from "./geo";
import { pathLength } from "./geo";
import {
  type Plan,
  type PlanStats,
  type ShapeId,
  type TracePoint,
  MOTIONS,
  buildShape,
  buildTrace,
  motionOf,
  plan,
  profileSamples,
  smoothThrough,
  summarize,
} from "./trajectory";
import {
  type BookmarkStore,
  type SavedPlace,
  type SavedRoute,
  deletePlace as delPlace,
  deleteRoute as delRoute,
  loadBookmarks,
  savePlace as putPlace,
  saveRoute as putRoute,
} from "./bookmarks";

export type TileSource = "carto" | "amap" | "osm";
export type PlayState = "idle" | "ready" | "playing" | "paused" | "finished" | "holding";

export const RATES = [1, 2, 4, 8, 16] as const;
export const DEFAULT_ORIGIN: Pt = { lat: 36.8132, lng: 118.0482 };
export const DEFAULT_DEST: Pt = { lat: 36.8362, lng: 118.0918 };

export type Prefs = {
  motionId: string;
  shape: ShapeId;
  cruiseKmh: string;
  autoStops: boolean;
  p1: string;
  p2: string;
  origin: Pt;
  dest: Pt;
  hz: number;
  jitter: number;
  rate: number;
  tileSource: TileSource;
  loop: boolean;
};

const PREF_KEY = "tracelab.prefs.v1";
const TRACE_KEY = "tracelab.trace.v1";

export const defaultPrefs = (): Prefs => ({
  motionId: "drive",
  shape: "SPLINE",
  cruiseKmh: "",
  autoStops: true,
  p1: "22",
  p2: "0",
  origin: { ...DEFAULT_ORIGIN },
  dest: { ...DEFAULT_DEST },
  hz: 1,
  jitter: 5,
  rate: 4,
  tileSource: "carto",
  loop: false,
});

export type ProfileSample = { t: number; kmh: number; s: number };

export type LabState = {
  hydrated: boolean;
  prefs: Prefs;
  pickMode: boolean;
  follow: boolean;
  overlay: boolean;
  draft: Pt[];
  route: Pt[];
  stops: Pt[];
  trace: TracePoint[];
  stats: PlanStats | null;
  profile: ProfileSample[];
  index: number;
  simBaseMs: number;
  wallBaseMs: number;
  playing: boolean;
  hold: SavedPlace | null;
  status: string;
  hint: string;
  hintAt: number;
  motionLabel: string;
  shapeLabel: string;
  lastSpeed: number;
  lastPos: Pt | null;
  lastBearing: number;
  lastPhase: string;
  lastAlt: number;
  lastAcc: number;
  fitNonce: number;
  fitPts: Pt[];
  mapCenter: Pt;
  mapZoom: number;
  bookmarks: BookmarkStore;
  paramsOpen: boolean;
  bookmarksOpen: boolean;
};

type LabActions = {
  hydrate: () => void;
  flash: (msg: string) => void;
  setPrefs: (patch: Partial<Prefs>) => void;
  setPickMode: (v: boolean) => void;
  setFollow: (v: boolean) => void;
  setOverlay: (v: boolean) => void;
  setParamsOpen: (v: boolean) => void;
  setBookmarksOpen: (v: boolean) => void;
  setMapView: (center: Pt, zoom: number) => void;
  addDraft: (p: Pt) => void;
  undo: () => void;
  clear: () => void;
  generate: (opts?: { silent?: boolean; keepProgress?: boolean }) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stop: () => void;
  restart: () => void;
  seek: (fraction: number) => void;
  setRate: (n: number) => void;
  cycleRate: () => void;
  tick: (now: number) => void;
  jumpTo: (place: SavedPlace) => void;
  useRoute: (route: SavedRoute) => void;
  saveCurrentRoute: (name: string) => void;
  saveCurrentPlace: (name: string) => void;
  removeRoute: (id: string) => void;
  removePlace: (id: string) => void;
  requestFit: (pts?: Pt[]) => void;
  applyLive: () => void;
};

function playStateOf(s: LabState): PlayState {
  if (s.hold) return "holding";
  if (s.trace.length === 0) return "idle";
  if (s.playing) return "playing";
  if (s.index >= s.trace.length - 1 && s.trace.length > 1) return "finished";
  if (s.index > 0) return "paused";
  return "ready";
}

function persistPrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function persistTrace(s: Pick<LabState, "trace" | "route" | "stops" | "stats" | "motionLabel" | "shapeLabel" | "draft" | "profile">) {
  try {
    localStorage.setItem(
      TRACE_KEY,
      JSON.stringify({
        trace: s.trace,
        route: s.route,
        stops: s.stops,
        stats: s.stats,
        motionLabel: s.motionLabel,
        shapeLabel: s.shapeLabel,
        draft: s.draft,
        profile: s.profile,
      }),
    );
  } catch {
    /* ignore quota */
  }
}

function cruiseMs(prefs: Prefs): number | null {
  const n = Number(prefs.cruiseKmh);
  return Number.isFinite(n) && n > 0 ? n / 3.6 : null;
}

export const useLab = create<LabState & LabActions>((set, get) => ({
  hydrated: false,
  prefs: defaultPrefs(),
  pickMode: false,
  follow: true,
  overlay: false,
  draft: [],
  route: [],
  stops: [],
  trace: [],
  stats: null,
  profile: [],
  index: 0,
  simBaseMs: 0,
  wallBaseMs: 0,
  playing: false,
  hold: null,
  status: "在地图上点两点以上，或直接生成默认路线",
  hint: "",
  hintAt: 0,
  motionLabel: "驾车",
  shapeLabel: "",
  lastSpeed: 0,
  lastPos: null,
  lastBearing: 0,
  lastPhase: "",
  lastAlt: 0,
  lastAcc: 0,
  fitNonce: 0,
  fitPts: [],
  mapCenter: { ...DEFAULT_ORIGIN },
  mapZoom: 14,
  bookmarks: { routes: [], places: [] },
  paramsOpen: false,
  bookmarksOpen: false,

  hydrate: () => {
    if (get().hydrated) return;
    let prefs = defaultPrefs();
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) prefs = { ...prefs, ...(JSON.parse(raw) as Prefs) };
    } catch {
      /* ignore */
    }
    const bookmarks = loadBookmarks();
    let restored = false;
    try {
      const raw = localStorage.getItem(TRACE_KEY);
      if (raw) {
        const t = JSON.parse(raw) as Partial<LabState>;
        if (t.trace && t.trace.length >= 2) {
          set({
            hydrated: true,
            prefs,
            bookmarks,
            trace: t.trace,
            route: t.route ?? [],
            stops: t.stops ?? [],
            stats: t.stats ?? null,
            profile: t.profile ?? [],
            draft: t.draft ?? [],
            motionLabel: t.motionLabel ?? motionOf(prefs.motionId).label,
            shapeLabel: t.shapeLabel ?? "",
            status: `已恢复上次的轨迹 · ${t.trace.length} 个点`,
            index: 0,
            lastPos: { lat: t.trace[0].lat, lng: t.trace[0].lng },
            lastBearing: t.trace[0].bearing,
            lastSpeed: t.trace[0].speed,
            mapCenter: t.route?.[0] ?? prefs.origin,
            fitPts: t.route && t.route.length >= 2 ? t.route : t.trace.map((p) => ({ lat: p.lat, lng: p.lng })),
            fitNonce: 1,
          });
          restored = true;
        }
      }
    } catch {
      /* ignore */
    }
    if (!restored) {
      set({ hydrated: true, prefs, bookmarks, mapCenter: prefs.origin });
      get().generate({ silent: true });
    }
  },

  flash: (msg) => set({ hint: msg, hintAt: Date.now() }),

  setPrefs: (patch) => {
    const prefs = { ...get().prefs, ...patch };
    persistPrefs(prefs);
    set({ prefs });
  },

  setPickMode: (v) => set({ pickMode: v }),
  setFollow: (v) => set({ follow: v }),
  setOverlay: (v) => set({ overlay: v }),
  setParamsOpen: (v) => set({ paramsOpen: v }),
  setBookmarksOpen: (v) => set({ bookmarksOpen: v }),
  setMapView: (center, zoom) => set({ mapCenter: center, mapZoom: zoom }),

  addDraft: (p) => {
    const draft = [...get().draft, p];
    set({ draft });
    const n = draft.length;
    get().flash(`已选第 ${n} 个点`);
  },

  undo: () => {
    const draft = get().draft.slice(0, -1);
    set({ draft });
    get().flash(draft.length ? `已撤销 · 剩 ${draft.length} 个点` : "已撤完");
  },

  clear: () => {
    const { draft } = get();
    if (draft.length) {
      set({ draft: [] });
      get().flash("已清空选点");
      return;
    }
    set({
      playing: false,
      index: 0,
      simBaseMs: 0,
      trace: [],
      route: [],
      stops: [],
      stats: null,
      profile: [],
      hold: null,
      lastSpeed: 0,
      lastPos: null,
      status: "已清空轨迹",
    });
    try {
      localStorage.removeItem(TRACE_KEY);
    } catch {
      /* ignore */
    }
    get().flash("已清空轨迹（刷新也不会再出现）");
  },

  generate: (opts) => {
    const s = get();
    const fromDraft = s.draft.length >= 2;
    const motion = motionOf(s.prefs.motionId);
    let points: Pt[];
    let shapeLabel: string;
    try {
      if (opts?.keepProgress && s.route.length >= 2) {
        points = s.route;
        shapeLabel = s.shapeLabel || (fromDraft ? "手绘" : SHAPE_LABEL(s.prefs.shape));
      } else if (fromDraft) {
        points = smoothThrough(s.draft);
        shapeLabel = "手绘";
      } else {
        points = buildShape(
          s.prefs.shape,
          s.prefs.origin,
          s.prefs.dest,
          Number(s.prefs.p1) || 0,
          Number(s.prefs.p2) || 0,
        );
        shapeLabel = SHAPE_LABEL(s.prefs.shape);
      }
      const p: Plan = plan(points, motion.id, cruiseMs(s.prefs), s.prefs.autoStops);
      const trace = buildTrace(p, clampHz(s.prefs.hz), clampJitter(s.prefs.jitter));
      const stats = summarize(p);
      const stops = p.stopS.map((ss) => {
        const i = Math.min(p.dense.length - 1, Math.max(0, Math.round(ss)));
        return p.dense[i];
      });
      const profile = profileSamples(p);
      const frac = opts?.keepProgress && s.trace.length > 1 ? s.index / s.trace.length : 0;
      const index = Math.round(frac * trace.length);
      const simBaseMs = trace[Math.min(index, trace.length - 1)]?.dtMs ?? 0;
      const srcText = fromDraft
        ? `按你选的 ${s.draft.length} 个点`
        : `用起终点 ${s.prefs.origin.lat.toFixed(4)},${s.prefs.origin.lng.toFixed(4)}`;
      const next: Partial<LabState> = {
        route: points,
        trace,
        stats,
        stops,
        profile,
        index,
        simBaseMs,
        wallBaseMs: performance.now(),
        playing: opts?.keepProgress ? s.playing : false,
        hold: null,
        motionLabel: motion.label,
        shapeLabel,
        status: opts?.keepProgress
          ? `已按新参数重新规划 · ${trace.length} 个点 · 保持在第 ${(frac * 100).toFixed(0)}%`
          : `已生成 ${trace.length} 个点，点「开始」回放`,
        lastPos: trace[index] ? { lat: trace[index].lat, lng: trace[index].lng } : points[0],
        lastSpeed: 0,
        lastPhase: "",
        fitPts: points,
        fitNonce: opts?.keepProgress ? s.fitNonce : s.fitNonce + 1,
      };
      set(next);
      persistTrace({ ...get(), ...next } as LabState);
      if (!opts?.silent && !opts?.keepProgress) {
        get().flash(`已生成 ${trace.length} 个点（${srcText}）· ${(stats.distanceM / 1000).toFixed(2)} km`);
      }
    } catch (e) {
      get().flash(e instanceof Error ? `生成失败：${e.message}` : "生成失败");
    }
  },

  play: () => {
    const s = get();
    if (s.trace.length < 2 && !s.hold) {
      get().flash("先点「生成轨迹」或在地图上选点");
      return;
    }
    set({ playing: true, wallBaseMs: performance.now(), hold: null, follow: true });
  },

  pause: () => {
    const s = get();
    const now = performance.now();
    const sim = s.simBaseMs + (now - s.wallBaseMs) * s.prefs.rate;
    set({ playing: false, simBaseMs: sim, wallBaseMs: now });
  },

  togglePlay: () => {
    const s = get();
    if (s.playing) s.pause();
    else s.play();
  },

  stop: () => {
    set({
      playing: false,
      index: 0,
      simBaseMs: 0,
      hold: null,
      lastSpeed: 0,
      lastPhase: "",
      status: "已停止 · 轨迹保留",
    });
    const { trace } = get();
    if (trace[0]) set({ lastPos: { lat: trace[0].lat, lng: trace[0].lng }, lastBearing: trace[0].bearing });
  },

  restart: () => {
    set({
      playing: true,
      index: 0,
      simBaseMs: 0,
      wallBaseMs: performance.now(),
      hold: null,
      follow: true,
      status: "从起点重新走",
    });
  },

  seek: (fraction) => {
    const { trace, playing } = get();
    if (trace.length < 2) return;
    const index = Math.round(clamp01(fraction) * (trace.length - 1));
    const p = trace[index];
    set({
      index,
      simBaseMs: p.dtMs,
      wallBaseMs: performance.now(),
      lastPos: { lat: p.lat, lng: p.lng },
      lastSpeed: p.speed,
      lastBearing: p.bearing,
      lastAlt: p.alt,
      lastAcc: p.accuracy,
    });
    if (!playing) set({ playing: false });
  },

  setRate: (n) => {
    const s = get();
    const now = performance.now();
    const sim = s.playing ? s.simBaseMs + (now - s.wallBaseMs) * s.prefs.rate : s.simBaseMs;
    const prefs = { ...s.prefs, rate: n };
    persistPrefs(prefs);
    set({ prefs, simBaseMs: sim, wallBaseMs: now });
    get().flash(`回放倍率 ${n}× · 立即生效`);
  },

  cycleRate: () => {
    const cur = get().prefs.rate;
    const next = RATES.find((r) => r > cur + 1e-6) ?? RATES[0];
    get().setRate(next);
  },

  tick: (now) => {
    const s = get();
    if (s.hold) return;
    if (!s.playing || s.trace.length < 2) return;
    const sim = s.simBaseMs + (now - s.wallBaseMs) * s.prefs.rate;
    const tr = s.trace;
    let lo = 0;
    let hi = tr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tr[mid].dtMs <= sim) lo = mid;
      else hi = mid - 1;
    }
    const index = lo;
    if (index >= tr.length - 1) {
      if (s.prefs.loop) {
        set({ simBaseMs: 0, wallBaseMs: now, index: 0 });
        return;
      }
      const last = tr[tr.length - 1];
      set({
        playing: false,
        index: tr.length - 1,
        simBaseMs: last.dtMs,
        lastPos: { lat: last.lat, lng: last.lng },
        lastSpeed: 0,
        lastBearing: last.bearing,
        lastAlt: last.alt,
        lastAcc: last.accuracy,
        lastPhase: "done",
        status: "已走完全程",
      });
      return;
    }
    if (index === s.index) return;
    const p = tr[index];
    set({
      index,
      lastPos: { lat: p.lat, lng: p.lng },
      lastSpeed: p.speed,
      lastBearing: p.bearing,
      lastAlt: p.alt,
      lastAcc: p.accuracy,
      lastPhase: p.speed < 0.3 ? "stop" : "cruise",
    });
  },

  jumpTo: (place) => {
    set({
      hold: place,
      playing: false,
      lastPos: { lat: place.lat, lng: place.lng },
      lastSpeed: 0,
      lastPhase: "stop",
      mapCenter: { lat: place.lat, lng: place.lng },
      status: `已瞬移到「${place.name}」`,
      follow: false,
    });
    get().flash(`定位钉在「${place.name}」· 点「停止」退出`);
  },

  useRoute: (route) => {
    const prefs = {
      ...get().prefs,
      motionId: route.motionId,
      cruiseKmh: route.cruiseKmh != null ? route.cruiseKmh.toFixed(1) : "",
      autoStops: route.autoStops,
      hz: route.hz,
      jitter: route.jitter,
    };
    persistPrefs(prefs);
    set({ prefs, draft: route.points, bookmarksOpen: false });
    get().generate();
    get().flash(`已取用「${route.name}」· ${route.points.length} 个点`);
  },

  saveCurrentRoute: (name) => {
    const s = get();
    const pts = s.draft.length >= 2 ? s.draft : s.route;
    if (pts.length < 2) {
      get().flash("先选点或生成一条轨迹，再存");
      return;
    }
    const bookmarks = putRoute(s.bookmarks, {
      name: name.trim() || `路线 ${s.bookmarks.routes.length + 1}`,
      points: pts,
      motionId: s.prefs.motionId,
      cruiseKmh: cruiseMs(s.prefs) != null ? Number(s.prefs.cruiseKmh) : null,
      autoStops: s.prefs.autoStops,
      hz: s.prefs.hz,
      jitter: s.prefs.jitter,
      distanceM: pathLength(pts),
    });
    set({ bookmarks });
    get().flash(`已保存路线「${name}」`);
  },

  saveCurrentPlace: (name) => {
    const s = get();
    const pt = s.lastPos ?? s.mapCenter;
    const bookmarks = putPlace(s.bookmarks, {
      name: name.trim() || `点位 ${s.bookmarks.places.length + 1}`,
      lat: pt.lat,
      lng: pt.lng,
    });
    set({ bookmarks });
    get().flash(`已保存点位「${name}」`);
  },

  removeRoute: (id) => set({ bookmarks: delRoute(get().bookmarks, id) }),
  removePlace: (id) => set({ bookmarks: delPlace(get().bookmarks, id) }),

  requestFit: (pts) => {
    const s = get();
    const target = pts && pts.length >= 2 ? pts : s.draft.length >= 2 ? s.draft : s.route;
    if (target.length < 2) {
      get().flash("还没有可全览的路线");
      return;
    }
    set({ fitPts: target, fitNonce: s.fitNonce + 1 });
  },

  applyLive: () => {
    const s = get();
    if (s.route.length < 2) {
      get().flash("参数已保存 · 下次生成时生效");
      return;
    }
    get().generate({ keepProgress: true });
  },
}));

export function currentPlayState(): PlayState {
  return playStateOf(useLab.getState());
}

function SHAPE_LABEL(id: ShapeId): string {
  const map: Record<ShapeId, string> = {
    STRAIGHT: "直线",
    SPLINE: "样条曲线",
    ARC: "圆弧",
    MANHATTAN: "街区折线",
    ZIGZAG: "锯齿波浪",
    CIRCLE: "环形绕圈",
  };
  return map[id];
}

function clampHz(v: number) {
  return Math.min(10, Math.max(0.2, v || 1));
}
function clampJitter(v: number) {
  return Math.min(50, Math.max(0, v || 0));
}
function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export { MOTIONS };
