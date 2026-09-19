import { useCallback, useEffect, useRef, useState } from "react";
import type { Pt } from "@/lib/geo";
import {
  clamp,
  latToWorldY,
  lngToWorldX,
  worldXToLng,
  worldYToLat,
} from "@/lib/geo";
import { gcj02ToWgs84, wgs84ToGcj02 } from "@/lib/gcj";
import type { TileSource } from "@/lib/store";
import { cn } from "@/lib/utils";

export type Pin = { pt: Pt; label: string };

type Props = {
  source: TileSource;
  pickMode: boolean;
  follow: boolean;
  center: Pt;
  zoom: number;
  draft: Pt[];
  route: Pt[];
  traveled: Pt[];
  stops: Pt[];
  pins: Pin[];
  cursor: Pt | null;
  heading: number;
  fitNonce: number;
  fitPts: Pt[];
  onPick: (p: Pt) => void;
  onViewChange: (center: Pt, zoom: number) => void;
  onUserPan: () => void;
  showChrome?: boolean;
};

const MIN_Z = 3;
const MAX_Z = 18;

function tileUrl(source: TileSource, z: number, x: number, y: number): string | null {
  const n = 2 ** z;
  const xx = ((x % n) + n) % n;
  if (y < 0 || y >= n) return null;
  if (source === "carto") {
    const s = ["a", "b", "c", "d"][(xx + y) % 4];
    return `https://${s}.basemaps.cartocdn.com/dark_all/${z}/${xx}/${y}@2x.png`;
  }
  if (source === "osm") {
    return `https://tile.openstreetmap.org/${z}/${xx}/${y}.png`;
  }
  const s = ((xx + y) % 4) + 1;
  return `https://webrd0${s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${xx}&y=${y}&z=${z}`;
}

function isGcj(source: TileSource) {
  return source === "amap";
}

function toDisp(source: TileSource, p: Pt): Pt {
  return isGcj(source) ? wgs84ToGcj02(p) : p;
}

function toWgs(source: TileSource, p: Pt): Pt {
  return isGcj(source) ? gcj02ToWgs84(p) : p;
}

function polyPoints(pts: { x: number; y: number }[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function decimate<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += step) out.push(arr[i]);
  const last = arr[arr.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function MapView({
  source,
  pickMode,
  follow,
  center,
  zoom,
  draft,
  route,
  traveled,
  stops,
  pins,
  cursor,
  heading,
  fitNonce,
  fitPts,
  onPick,
  onViewChange,
  onUserPan,
  showChrome = false,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const view = useRef({ lat: center.lat, lng: center.lng, zoom });
  const [rev, setRev] = useState(0);
  const dragging = useRef(false);
  const moved = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const tapTimer = useRef<number | null>(null);
  const lastTap = useRef(0);

  const flush = useCallback(() => setRev((n) => n + 1), []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (dragging.current) return;
    view.current = { lat: center.lat, lng: center.lng, zoom };
    flush();
  }, [center.lat, center.lng, zoom, flush]);

  useEffect(() => {
    if (!follow || !cursor || dragging.current) return;
    const d = toDisp(source, cursor);
    view.current.lat = d.lat;
    view.current.lng = d.lng;
    flush();
  }, [follow, cursor, source, flush]);

  useEffect(() => {
    if (!fitNonce || fitPts.length < 2 || size.w < 8) return;
    const disp = fitPts.map((p) => toDisp(source, p));
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of disp) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const pad = 48;
    let z = MAX_Z;
    for (; z > MIN_Z; z--) {
      const x0 = lngToWorldX(minLng, z);
      const x1 = lngToWorldX(maxLng, z);
      const y0 = latToWorldY(maxLat, z);
      const y1 = latToWorldY(minLat, z);
      if (x1 - x0 + pad * 2 <= size.w && y1 - y0 + pad * 2 <= size.h) break;
    }
    view.current = {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
      zoom: z - 0.15,
    };
    onViewChange(toWgs(source, { lat: view.current.lat, lng: view.current.lng }), view.current.zoom);
    flush();
  }, [fitNonce, fitPts, size.w, size.h, source, onViewChange, flush]);

  const project = useCallback(
    (p: Pt) => {
      const z = Math.floor(view.current.zoom);
      const scale = 2 ** (view.current.zoom - z);
      const cx = lngToWorldX(view.current.lng, z);
      const cy = latToWorldY(view.current.lat, z);
      const d = toDisp(source, p);
      return {
        x: (lngToWorldX(d.lng, z) - cx) * scale + size.w / 2,
        y: (latToWorldY(d.lat, z) - cy) * scale + size.h / 2,
      };
    },
    [size.w, size.h, source],
  );

    const out: { key: string; x: number; y: number; s: number; url: string }[] = [];
    if (size.w >= 8) {
      const z = Math.floor(view.current.zoom);
      const scale = 2 ** (view.current.zoom - z);
      const cx = lngToWorldX(view.current.lng, z);
      const cy = latToWorldY(view.current.lat, z);
      const tileSize = 256 * scale;
      const minTX = Math.floor((cx - size.w / 2 / scale) / 256) - 1;
      const maxTX = Math.floor((cx + size.w / 2 / scale) / 256) + 1;
      const minTY = Math.floor((cy - size.h / 2 / scale) / 256) - 1;
      const maxTY = Math.floor((cy + size.h / 2 / scale) / 256) + 1;
      for (let x = minTX; x <= maxTX; x++) {
        for (let y = minTY; y <= maxTY; y++) {
          const url = tileUrl(source, z, x, y);
          if (!url) continue;
          out.push({
            key: `${source}-${z}-${x}-${y}`,
            x: (x * 256 - cx) * scale + size.w / 2,
            y: (y * 256 - cy) * scale + size.h / 2,
            s: tileSize,
            url,
          });
        }
      }
    }
    const tiles = out;
    void rev;

  const unproject = (sx: number, sy: number): Pt => {
    const z = Math.floor(view.current.zoom);
    const scale = 2 ** (view.current.zoom - z);
    const cx = lngToWorldX(view.current.lng, z);
    const cy = latToWorldY(view.current.lat, z);
    const wx = cx + (sx - size.w / 2) / scale;
    const wy = cy + (sy - size.h / 2) / scale;
    return toWgs(source, { lat: worldYToLat(wy, z), lng: worldXToLng(wx, z) });
  };

  const zoomAt = (sx: number, sy: number, nextZ: number) => {
    const before = unproject(sx, sy);
    view.current.zoom = clamp(nextZ, MIN_Z, MAX_Z);
    const after = unproject(sx, sy);
    const d0 = toDisp(source, before);
    const d1 = toDisp(source, after);
    view.current.lat += d0.lat - d1.lat;
    view.current.lng += d0.lng - d1.lng;
    onViewChange(toWgs(source, { lat: view.current.lat, lng: view.current.lng }), view.current.zoom);
    flush();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragging.current = true;
      moved.current = false;
      last.current = { x: e.clientX, y: e.clientY };
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        zoom: view.current.zoom,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const r = wrap.current!.getBoundingClientRect();
      zoomAt(midX - r.left, midY - r.top, pinch.current.zoom + Math.log2(dist / pinch.current.dist));
      onUserPan();
      return;
    }
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    if (Math.hypot(dx, dy) > 3) moved.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    const z = Math.floor(view.current.zoom);
    const scale = 2 ** (view.current.zoom - z);
    view.current.lng = worldXToLng(lngToWorldX(view.current.lng, z) - dx / scale, z);
    view.current.lat = worldYToLat(latToWorldY(view.current.lat, z) - dy / scale, z);
    onUserPan();
    flush();
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      dragging.current = false;
      onViewChange(toWgs(source, { lat: view.current.lat, lng: view.current.lng }), view.current.zoom);
      if (!moved.current && pickMode) {
        const now = Date.now();
        if (now - lastTap.current < 280) {
          if (tapTimer.current) window.clearTimeout(tapTimer.current);
          tapTimer.current = null;
          lastTap.current = 0;
          const r = wrap.current!.getBoundingClientRect();
          zoomAt(e.clientX - r.left, e.clientY - r.top, view.current.zoom + 1);
          return;
        }
        lastTap.current = now;
        const r = wrap.current!.getBoundingClientRect();
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;
        tapTimer.current = window.setTimeout(() => {
          onPick(unproject(sx, sy));
          tapTimer.current = null;
        }, 280);
      }
    }
  };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const delta = e.deltaY > 0 ? -0.25 : 0.25;
      zoomAt(e.clientX - r.left, e.clientY - r.top, view.current.zoom + delta);
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  });

  const routeScr = decimate(route, 400).map(project);
  const draftScr = draft.map(project);
  const traveledScr = decimate(traveled, 400).map(project);
  const stopScr = stops.map(project);
  const pinScr = pins.map((p) => ({ ...project(p.pt), label: p.label }));
  const cursorScr = cursor ? project(cursor) : null;
  const startScr = route.length >= 2 && draft.length < 2 ? project(route[0]) : null;
  const endScr = route.length >= 2 && draft.length < 2 ? project(route[route.length - 1]) : null;

  const attr =
    source === "amap" ? "高德地图 · GCJ-02" : source === "osm" ? "© OpenStreetMap" : "© CARTO · © OSM";

  return (
    <div
      ref={wrap}
      className={cn(
        "relative h-full w-full overflow-hidden bg-bg touch-none select-none",
        pickMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.url}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none"
          style={{ left: t.x, top: t.y, width: t.s, height: t.s }}
        />
      ))}
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {routeScr.length >= 2 && (
          <>
            <polyline
              points={polyPoints(routeScr)}
              fill="none"
              stroke="rgba(11,13,16,0.85)"
              strokeWidth="7"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points={polyPoints(routeScr)}
              fill="none"
              stroke="var(--color-subtle)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
        {traveledScr.length >= 2 && (
          <>
            <polyline
              points={polyPoints(traveledScr)}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="8"
              strokeOpacity="0.22"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points={polyPoints(traveledScr)}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
        {draftScr.length >= 2 && (
          <polyline
            points={polyPoints(draftScr)}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeDasharray="5 6"
            strokeLinejoin="round"
          />
        )}
        {stopScr.map((p, i) => (
          <circle key={`s${i}`} cx={p.x} cy={p.y} r="4" fill="var(--color-danger)" />
        ))}
        {startScr && (
          <g>
            <circle cx={startScr.x} cy={startScr.y} r="9" fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth="2" />
            <text x={startScr.x} y={startScr.y + 3.5} textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--color-primary-fg)">
              起
            </text>
          </g>
        )}
        {endScr && (
          <g>
            <circle cx={endScr.x} cy={endScr.y} r="9" fill="var(--color-fg)" stroke="var(--color-bg)" strokeWidth="2" />
            <text x={endScr.x} y={endScr.y + 3.5} textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--color-primary-fg)">
              终
            </text>
          </g>
        )}
        {draftScr.map((p, i) => (
          <g key={`d${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r="9"
              fill={i === 0 ? "var(--color-accent)" : i === draftScr.length - 1 ? "var(--color-fg)" : "var(--color-elevated)"}
              stroke="var(--color-bg)"
              strokeWidth="2"
            />
            <text
              x={p.x}
              y={p.y + 3.5}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill="var(--color-primary-fg)"
            >
              {i + 1}
            </text>
          </g>
        ))}
        {pinScr.map((p, i) => (
          <g key={`p${i}`}>
            <circle cx={p.x} cy={p.y} r="5" fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth="1.5" />
            <text x={p.x + 8} y={p.y + 4} fontSize="10" fill="var(--color-muted)">
              {p.label}
            </text>
          </g>
        ))}
        {cursorScr && (
          <g transform={`translate(${cursorScr.x} ${cursorScr.y}) rotate(${heading})`}>
            <circle cx="0" cy="0" r="22" fill="var(--color-accent)" fillOpacity="0.1" />
            <circle cx="0" cy="0" r="15" fill="var(--color-accent)" fillOpacity="0.18" />
            <path
              d="M0,-15 L9,13 L0,7 L-9,13 Z"
              fill="var(--color-fg)"
              stroke="var(--color-bg)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </g>
        )}
      </svg>
      {showChrome && (
        <div className="pointer-events-none absolute bottom-2 left-3 text-micro text-muted/70">
          {attr}
        </div>
      )}
    </div>
  );
}
