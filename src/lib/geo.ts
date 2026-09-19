export type Pt = { lat: number; lng: number };

export const R = 6371008.8;
const D2R = Math.PI / 180;
export const TILE = 256;

export function haversine(a: Pt, b: Pt): number {
  const p1 = a.lat * D2R;
  const p2 = b.lat * D2R;
  const dp = (b.lat - a.lat) * D2R;
  const dl = (b.lng - a.lng) * D2R;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a: Pt, b: Pt): number {
  const p1 = a.lat * D2R;
  const p2 = b.lat * D2R;
  const dl = (b.lng - a.lng) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  if (Math.abs(x) < 1e-15 && Math.abs(y) < 1e-15) return 0;
  return ((Math.atan2(y, x) / D2R) + 360) % 360;
}

export type Dense = { pts: Pt[]; cum: number[] };

/** Strict equal-spacing resample; last point lands exactly on the end. */
export function resample(points: Pt[], spacing: number): Dense {
  if (points.length === 0) return { pts: [], cum: [] };
  if (points.length === 1) return { pts: [points[0]], cum: [0] };

  const segs = new Array<number>(points.length - 1);
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    segs[i] = haversine(points[i], points[i + 1]);
    total += segs[i];
  }
  if (total <= 1e-9) return { pts: [points[0]], cum: [0] };

  const n = Math.max(1, Math.round(total / Math.max(spacing, 1e-6)));
  const step = total / n;
  const pts: Pt[] = [points[0]];
  const cum = new Array<number>(n + 1);
  cum[0] = 0;
  let segIdx = 0;
  let segStart = 0;

  for (let i = 1; i <= n; i++) {
    const target = i * step;
    while (segIdx < segs.length - 1 && segStart + segs[segIdx] < target) {
      segStart += segs[segIdx];
      segIdx++;
    }
    const seg = segs[segIdx];
    const t = seg <= 1e-12 ? 0 : clamp((target - segStart) / seg, 0, 1);
    const a = points[segIdx];
    const b = points[segIdx + 1];
    pts.push({
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
    });
    cum[i] = target;
  }
  return { pts, cum };
}

export function pointAtS(dense: Pt[], cum: number[], s: number): { pos: Pt; heading: number } {
  const last = cum.length - 1;
  if (last < 0) return { pos: { lat: 0, lng: 0 }, heading: 0 };
  if (last === 0) return { pos: dense[0], heading: 0 };
  if (s <= 0) return { pos: dense[0], heading: bearing(dense[0], dense[1]) };
  if (s >= cum[last]) {
    return { pos: dense[last], heading: bearing(dense[last - 1], dense[last]) };
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const t = seg <= 1e-12 ? 0 : (s - cum[lo]) / seg;
  const pos: Pt = {
    lat: dense[lo].lat + (dense[hi].lat - dense[lo].lat) * t,
    lng: dense[lo].lng + (dense[hi].lng - dense[lo].lng) * t,
  };
  return { pos, heading: bearing(dense[lo], dense[hi]) };
}

export function curvatureRadius(a: Pt | null, b: Pt, c: Pt | null): number {
  if (!a || !c) return Number.POSITIVE_INFINITY;
  const x = haversine(b, c);
  const y = haversine(a, b);
  const z = haversine(a, c);
  if (x < 1e-6 || y < 1e-6 || z < 1e-6) return Number.POSITIVE_INFINITY;
  const s = (x + y + z) / 2;
  const k = s * (s - x) * (s - y) * (s - z);
  if (k <= 1e-12) return Number.POSITIVE_INFINITY;
  return (x * y * z) / (4 * Math.sqrt(k));
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng);
}

/** mulberry32 — same family as the Android Geo.Rng */
export class Rng {
  private a: number;
  constructor(seed: number) {
    this.a = seed >>> 0;
  }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  gauss(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function worldSize(zoom: number): number {
  return TILE * 2 ** zoom;
}

export function lngToWorldX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * worldSize(zoom);
}

export function latToWorldY(lat: number, zoom: number): number {
  const clamped = clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180;
  const s = Math.sin(clamped);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return y * worldSize(zoom);
}

export function worldXToLng(x: number, zoom: number): number {
  return (x / worldSize(zoom)) * 360 - 180;
}

export function worldYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / worldSize(zoom);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

export function pathLength(pts: Pt[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += haversine(pts[i - 1], pts[i]);
  return n;
}
