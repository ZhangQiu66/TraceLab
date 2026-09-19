import {
  type Pt,
  R,
  Rng,
  clamp,
  curvatureRadius,
  distance,
  pointAtS,
  resample,
} from "./geo";

export type Motion = {
  id: string;
  label: string;
  cruise: number;
  accel: number;
  decel: number;
  latAccMax: number;
  stopEvery: number | null;
  stopJitter: number;
  stopProb: number;
  dwellMin: number;
  dwellMax: number;
  speedNoise: number;
  gpsSigma: number;
  accuracy: number;
  altAmp: number;
};

export const SHAPES = [
  { id: "STRAIGHT", label: "直线" },
  { id: "SPLINE", label: "样条曲线" },
  { id: "ARC", label: "圆弧" },
  { id: "MANHATTAN", label: "街区折线" },
  { id: "ZIGZAG", label: "锯齿波浪" },
  { id: "CIRCLE", label: "环形绕圈" },
] as const;

export type ShapeId = (typeof SHAPES)[number]["id"];

export type TracePoint = {
  dtMs: number;
  lat: number;
  lng: number;
  speed: number;
  bearing: number;
  alt: number;
  accuracy: number;
};

export type Leg = { sStart: number; sEnd: number; duration: number; maxSpeed: number };

export type Dwell = {
  index: number;
  s: number;
  start: number;
  end: number;
  duration: number;
};

export type Plan = {
  dense: Pt[];
  cum: number[];
  total: number;
  v: number[];
  tsMotion: number[];
  dwells: Dwell[];
  duration: number;
  stopS: number[];
  legs: Leg[];
  motion: Motion;
  cruise: number;
};

export type PlanStats = {
  points: number;
  distanceM: number;
  durationS: number;
  avgKmh: number;
  maxKmh: number;
  stopCount: number;
};

export type SimStat = {
  t: number;
  s: number;
  pos: Pt;
  heading: number;
  speed: number;
  accel: number;
  done: boolean;
  phase: "done" | "stop" | "accel" | "decel" | "cruise";
};

export const MOTIONS: Motion[] = [
  { id: "walk", label: "步行", cruise: 1.35, accel: 0.7, decel: 0.9, latAccMax: 1.0, stopEvery: null, stopJitter: 0, stopProb: 0, dwellMin: 0, dwellMax: 0, speedNoise: 0.12, gpsSigma: 4, accuracy: 6, altAmp: 1.5 },
  { id: "jog", label: "慢跑", cruise: 2.5, accel: 1.2, decel: 1.5, latAccMax: 1.5, stopEvery: null, stopJitter: 0, stopProb: 0, dwellMin: 0, dwellMax: 0, speedNoise: 0.08, gpsSigma: 3.5, accuracy: 5, altAmp: 2 },
  { id: "bike", label: "骑行", cruise: 5.5, accel: 0.9, decel: 1.2, latAccMax: 1.8, stopEvery: 900, stopJitter: 500, stopProb: 0.4, dwellMin: 3, dwellMax: 12, speedNoise: 0.1, gpsSigma: 4, accuracy: 6, altAmp: 2.5 },
  { id: "drive", label: "驾车", cruise: 11.11, accel: 1.6, decel: 2.2, latAccMax: 3.0, stopEvery: 550, stopJitter: 300, stopProb: 0.85, dwellMin: 12, dwellMax: 45, speedNoise: 0.06, gpsSigma: 5, accuracy: 8, altAmp: 3 },
  { id: "bus", label: "公交", cruise: 8.3, accel: 1.0, decel: 1.4, latAccMax: 2.2, stopEvery: 480, stopJitter: 120, stopProb: 0.95, dwellMin: 18, dwellMax: 40, speedNoise: 0.06, gpsSigma: 5, accuracy: 8, altAmp: 3 },
  { id: "rail", label: "地铁/列车", cruise: 16.7, accel: 0.85, decel: 1.0, latAccMax: 6.0, stopEvery: 1300, stopJitter: 250, stopProb: 1, dwellMin: 25, dwellMax: 45, speedNoise: 0.02, gpsSigma: 10, accuracy: 15, altAmp: 4 },
  { id: "still", label: "静止漂移", cruise: 0, accel: 0.1, decel: 0.1, latAccMax: 9, stopEvery: null, stopJitter: 0, stopProb: 0, dwellMin: 0, dwellMax: 0, speedNoise: 0, gpsSigma: 3, accuracy: 5, altAmp: 1 },
];

const V_MIN = 0.05;
const MIN_LEG_M = 12;

export function motionOf(id: string): Motion {
  return MOTIONS.find((m) => m.id === id) ?? MOTIONS[0];
}

export const PHASE_LABEL: Record<SimStat["phase"], string> = {
  done: "完成",
  stop: "停车",
  accel: "加速",
  decel: "减速",
  cruise: "巡航",
};

function toLocal(o: Pt, p: Pt): [number, number] {
  const mid = ((p.lat + o.lat) / 2) * Math.PI / 180;
  const x = ((p.lng - o.lng) * Math.PI / 180) * R * Math.cos(mid);
  const y = ((p.lat - o.lat) * Math.PI / 180) * R;
  return [x, y];
}

function fromLocal(o: Pt, x: number, y: number): Pt {
  const lat = o.lat + (y / R) * 180 / Math.PI;
  const lng = o.lng + (x / (R * Math.cos((o.lat * Math.PI) / 180))) * 180 / Math.PI;
  return { lat, lng };
}

function catmullRom(pts: [number, number][], per: number): [number, number][] {
  if (pts.length <= 2) return pts;
  const n = pts.length;
  const ext: [number, number][] = [
    [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]],
    ...pts,
    [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]],
  ];
  const out: [number, number][] = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1];
    const p1 = ext[i];
    const p2 = ext[i + 1];
    const p3 = ext[i + 2];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

export function buildShape(
  shape: ShapeId,
  origin: Pt,
  dest: Pt,
  param1: number,
  param2: number,
  seed = 7,
): Pt[] {
  if (shape === "CIRCLE") {
    const radius = param1 > 0 ? param1 : 400;
    const turns = param2 > 0 ? param2 : 1;
    const n = Math.min(3600, Math.max(48, Math.round((turns * 2 * Math.PI * radius) / 4)));
    return Array.from({ length: n + 1 }, (_, i) => {
      const th = ((2 * Math.PI * turns) * i) / n;
      return fromLocal(origin, radius * Math.sin(th), radius * (1 - Math.cos(th)));
    });
  }

  const d = toLocal(origin, dest);
  const chord = Math.hypot(d[0], d[1]);
  if (chord < 1e-6) return [origin, dest];
  const ux = d[0] / chord;
  const uy = d[1] / chord;
  const nx = -uy;
  const ny = ux;
  const rng = new Rng(seed);

  let local: [number, number][] = [];
  switch (shape) {
    case "STRAIGHT":
      local = [[0, 0], d];
      break;
    case "SPLINE": {
      const w = (param1 > 0 ? param1 : 22) / 100;
      const s1 = w * chord * (0.7 + 0.6 * rng.next());
      const s2 = w * chord * (0.7 + 0.6 * rng.next());
      local = catmullRom(
        [
          [0, 0],
          [ux * chord * 0.33 + nx * s1, uy * chord * 0.33 + ny * s1],
          [ux * chord * 0.67 - nx * s2, uy * chord * 0.67 - ny * s2],
          d,
        ],
        40,
      );
      break;
    }
    case "ARC": {
      const bulge = (Math.abs(param1) > 1e-9 ? param1 : 30) / 100;
      if (Math.abs(bulge) < 1e-4) {
        local = [[0, 0], d];
      } else {
        const sag = bulge * chord;
        const radius = (chord * chord / 4 + sag * sag) / (2 * Math.abs(sag));
        const sign = bulge > 0 ? 1 : -1;
        const off = radius - Math.abs(sag);
        const cx = d[0] / 2 + sign * nx * off;
        const cy = d[1] / 2 + sign * ny * off;
        const a0 = Math.atan2(-cy, -cx);
        const a1 = Math.atan2(d[1] - cy, d[0] - cx);
        let sweep = a1 - a0;
        while (sweep <= -Math.PI) sweep += 2 * Math.PI;
        while (sweep > Math.PI) sweep -= 2 * Math.PI;
        if (sign > 0 && sweep < 0) sweep += 2 * Math.PI;
        if (sign < 0 && sweep > 0) sweep -= 2 * Math.PI;
        const n = Math.min(720, Math.max(16, Math.round((Math.abs(sweep) * radius) / 3)));
        local = Array.from({ length: n + 1 }, (_, i) => {
          const a = a0 + (sweep * i) / n;
          return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)] as [number, number];
        });
      }
      break;
    }
    case "MANHATTAN": {
      const steps = Math.max(1, Math.round(param1 > 0 ? param1 : 2));
      const out: [number, number][] = [[0, 0]];
      let ns = true;
      for (let k = 0; k < steps; k++) {
        const t1 = (k + 1) / steps;
        const px = ux * chord * t1;
        const py = uy * chord * t1;
        const lastP = out[out.length - 1];
        out.push(ns ? [lastP[0], py] : [px, lastP[1]]);
        out.push([px, py]);
        ns = !ns;
      }
      out.push(d);
      local = out;
      break;
    }
    case "ZIGZAG": {
      const amp = param1 > 0 ? param1 : 30;
      const wave = Math.max(20, param2 > 0 ? param2 : 150);
      const n = Math.min(4000, Math.max(24, Math.round(chord / 3)));
      local = Array.from({ length: n + 1 }, (_, i) => {
        const dd = (chord * i) / n;
        const s = amp * Math.sin((2 * Math.PI * dd) / wave);
        return [ux * dd + nx * s, uy * dd + ny * s] as [number, number];
      });
      break;
    }
  }

  const pts = local.map(([x, y]) => fromLocal(origin, x, y));
  const clean: Pt[] = [];
  for (const p of pts) {
    const lastP = clean[clean.length - 1];
    if (!lastP || distance(p, lastP) > 1e-7) clean.push(p);
  }
  return clean.length >= 2 ? clean : [pts[0], pts[pts.length - 1]];
}

export function smoothThrough(points: Pt[]): Pt[] {
  if (points.length < 3) return points;
  const origin = points[0];
  const local = points.map((p) => toLocal(origin, p));
  return catmullRom(local, 24).map(([x, y]) => fromLocal(origin, x, y));
}

function planLeg(vmax: number[], cum: number[], accel: number, decel: number): number[] {
  const n = vmax.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const ds = (i: number) => Math.max(cum[i] - cum[i - 1], 1e-6);
  const v = vmax.slice();
  v[0] = 0;
  v[n - 1] = 0;
  for (let i = 1; i < n; i++) {
    v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * accel * ds(i)));
  }
  for (let i = n - 2; i >= 0; i--) {
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * decel * ds(i + 1)));
  }
  return v;
}

export function plan(
  points: Pt[],
  motionId: string,
  cruiseOverride: number | null,
  autoStops: boolean,
  spacing = 1,
  seed = 42,
): Plan {
  const m = motionOf(motionId);
  const cruise = cruiseOverride ?? m.cruise;
  const rng = new Rng(seed);
  if (points.length < 2) throw new Error("路线至少需要 2 个点");
  const dense = resample(points, spacing);
  const total = dense.cum[dense.cum.length - 1] ?? 0;
  if (total <= 1) throw new Error("路线总长不足 1 米");

  const n = dense.pts.length;
  const vmax = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const r = curvatureRadius(
      i - 2 >= 0 ? dense.pts[i - 2] : null,
      dense.pts[i],
      i + 2 < n ? dense.pts[i + 2] : null,
    );
    vmax[i] = r === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.sqrt(m.latAccMax * r);
    if (vmax[i] > cruise) vmax[i] = cruise;
  }

  const stops: number[] = [];
  if (autoStops && m.stopEvery != null && m.stopProb > 0) {
    let s = m.stopEvery * (0.6 + 0.8 * rng.next());
    while (s < total - MIN_LEG_M) {
      if (rng.next() < m.stopProb) stops.push(s);
      s += Math.max(30, m.stopEvery + (rng.next() * 2 - 1) * m.stopJitter);
    }
  }
  const merged: number[] = [];
  for (const s of [...stops].sort((a, b) => a - b)) {
    if (s < MIN_LEG_M || s > total - MIN_LEG_M) continue;
    if (merged.length && s - merged[merged.length - 1] < MIN_LEG_M) continue;
    merged.push(s);
  }

  const bounds = [0, ...merged.map((s) => Math.round(s / spacing)), n - 1]
    .filter((i) => i >= 0 && i < n)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => a - b);

  const v = new Array<number>(n).fill(0);
  const tsMotion = new Array<number>(n).fill(0);
  const legs: Leg[] = [];
  const pending: Dwell[] = [];
  let tBase = 0;

  for (let li = 0; li < bounds.length - 1; li++) {
    const a = bounds[li];
    const b = bounds[li + 1];
    if (b <= a) continue;
    const legV = planLeg(vmax.slice(a, b + 1), dense.cum.slice(a, b + 1), m.accel, m.decel);
    let tl = 0;
    for (let k = 0; k <= b - a; k++) {
      const i = a + k;
      if (k > 0) {
        const ds = dense.cum[i] - dense.cum[i - 1];
        const avg = Math.max((legV[k - 1] + legV[k]) / 2, V_MIN);
        tl += ds / avg;
      }
      v[i] = legV[k];
      tsMotion[i] = tBase + tl;
    }
    legs.push({
      sStart: dense.cum[a],
      sEnd: dense.cum[b],
      duration: tl,
      maxSpeed: Math.max(...legV),
    });
    tBase += tl;
    if (li < bounds.length - 2 && m.dwellMax > 0) {
      const dwell = m.dwellMin + rng.next() * Math.max(0, m.dwellMax - m.dwellMin);
      if (dwell > 0.05) {
        pending.push({ index: b, s: dense.cum[b], start: 0, end: 0, duration: dwell });
      }
    }
  }
  v[n - 1] = 0;

  let acc = 0;
  const dwells = pending.map((d) => {
    const start = tsMotion[d.index] + acc;
    acc += d.duration;
    return { ...d, start, end: start + d.duration };
  });

  return {
    dense: dense.pts,
    cum: dense.cum,
    total,
    v,
    tsMotion,
    dwells,
    duration: Math.max(tBase + acc, 1e-6),
    stopS: merged,
    legs,
    motion: m,
    cruise,
  };
}

function phaseOf(done: boolean, speed: number, accel: number): SimStat["phase"] {
  if (done) return "done";
  if (speed < 0.3) return "stop";
  if (accel > 0.08) return "accel";
  if (accel < -0.08) return "decel";
  return "cruise";
}

export function stateAt(p: Plan, t: number): SimStat {
  const clamped = clamp(t, 0, p.duration);
  const done = t >= p.duration - 1e-9;

  for (const d of p.dwells) {
    if (clamped >= d.start && clamped < d.end) {
      const { pos, heading } = pointAtS(p.dense, p.cum, d.s);
      return { t: clamped, s: d.s, pos, heading, speed: 0, accel: 0, done: false, phase: "stop" };
    }
  }

  let mt = clamped;
  for (const d of p.dwells) if (clamped >= d.end) mt -= d.duration;

  const ts = p.tsMotion;
  const count = ts.length;
  let lo = 0;
  let hi = count - 1;
  if (count > 1) {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= mt) lo = mid;
      else hi = mid;
    }
  }
  const span = ts[hi] - ts[lo];
  if (span <= 1e-9) {
    const { pos, heading } = pointAtS(p.dense, p.cum, p.cum[lo]);
    const sp = p.v[lo];
    return { t: clamped, s: p.cum[lo], pos, heading, speed: sp, accel: 0, done, phase: phaseOf(done, sp, 0) };
  }

  const v0 = p.v[lo];
  const v1 = p.v[hi];
  const accel = (v1 - v0) / span;
  const tau = mt - ts[lo];
  const s = p.cum[lo] + v0 * tau + 0.5 * accel * tau * tau;
  const speed = Math.max(0, v0 + accel * tau);
  const { pos, heading } = pointAtS(p.dense, p.cum, s);
  return { t: clamped, s, pos, heading, speed, accel, done, phase: phaseOf(done, speed, accel) };
}

export function buildTrace(
  p: Plan,
  hz = 1,
  jitterM = 0,
  seed = 42,
  altBase = 60,
): TracePoint[] {
  const m = p.motion;
  const rng = new Rng(seed);
  const n = Math.trunc(p.duration * hz) + 1;
  const times: number[] = [];
  for (let k = 0; k < n; k++) times.push(k / hz);
  if (times[times.length - 1] < p.duration - 1e-9) times.push(p.duration);
  else times[times.length - 1] = p.duration;

  const rho = 0.85;
  const step = jitterM * Math.sqrt(Math.max(1e-9, 1 - rho * rho));
  let ex = 0;
  let ey = 0;
  let lastBearing = 0;
  const out: TracePoint[] = [];
  let prevS = 0;
  let prevT = 0;

  for (let k = 0; k < times.length; k++) {
    const t = times[k];
    const st = stateAt(p, t);
    const speed =
      k === 0 || k === times.length - 1
        ? st.speed
        : t - prevT > 1e-9
          ? (st.s - prevS) / (t - prevT)
          : st.speed;
    prevS = st.s;
    prevT = t;

    if (jitterM > 0) {
      ex = rho * ex + step * rng.gauss();
      ey = rho * ey + step * rng.gauss();
    }
    const lat = st.pos.lat + (ey / R) * 180 / Math.PI;
    const lng = st.pos.lng + (ex / (R * Math.cos((st.pos.lat * Math.PI) / 180))) * 180 / Math.PI;

    if (speed > 0.3) {
      lastBearing = (st.heading + (jitterM > 0 ? rng.gauss() * 1.5 : 0) + 360) % 360;
    }
    const reported = Math.max(0, speed * (1 + (jitterM > 0 ? m.speedNoise * rng.gauss() : 0)));
    const alt = altBase + m.altAmp * Math.sin((2 * Math.PI * st.s) / 850);
    const noise = jitterM > 0 ? 0.2 * rng.gauss() : 0;
    const acc = m.accuracy * (1 + noise);

    out.push({
      dtMs: Math.round(t * 1000),
      lat,
      lng,
      speed: reported,
      bearing: lastBearing,
      alt,
      accuracy: Math.max(0.5, acc),
    });
  }
  return out;
}

export function summarize(p: Plan): PlanStats {
  return {
    points: p.dense.length,
    distanceM: p.total,
    durationS: p.duration,
    avgKmh: (p.total / p.duration) * 3.6,
    maxKmh: Math.max(...p.v) * 3.6,
    stopCount: p.dwells.length,
  };
}

export function profileSamples(p: Plan, n = 96): { t: number; kmh: number; s: number }[] {
  const out: { t: number; kmh: number; s: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = (p.duration * i) / (n - 1);
    const st = stateAt(p, t);
    out.push({ t, kmh: st.speed * 3.6, s: st.s });
  }
  return out;
}

export function encode(trace: TracePoint[]): number[][] {
  return trace.map((p) => [
    p.dtMs,
    +p.lat.toFixed(7),
    +p.lng.toFixed(7),
    +p.speed.toFixed(3),
    +p.bearing.toFixed(2),
    +p.alt.toFixed(2),
    +p.accuracy.toFixed(1),
  ]);
}
