import { useId, useRef } from "react";
import type { ProfileSample } from "@/lib/store";
import { cn } from "@/lib/utils";

type Props = {
  samples: ProfileSample[];
  progress: number;
  onSeek?: (fraction: number) => void;
  compact?: boolean;
};

export function SpeedProfile({ samples, progress, onSeek, compact }: Props) {
  const gid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const w = 320;
  const h = compact ? 40 : 88;
  const pad = compact ? { l: 2, r: 2, t: 6, b: 4 } : { l: 2, r: 2, t: 14, b: 6 };

  const seekFromEvent = (e: React.PointerEvent) => {
    const el = svgRef.current;
    if (!el || !onSeek) return;
    const r = el.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };

  if (samples.length < 2) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-xs text-subtle",
          compact ? "h-10" : "h-20",
        )}
      >
        生成轨迹后显示速度曲线
      </div>
    );
  }

  const max = Math.max(...samples.map((s) => s.kmh), 1);
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const coords = samples.map((s, i) => {
    const x = pad.l + (innerW * i) / (samples.length - 1);
    const y = pad.t + innerH * (1 - s.kmh / max);
    return { x, y };
  });
  const line = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${pad.l},${h - pad.b} ${line} ${w - pad.r},${h - pad.b}`;
  const t = Math.min(1, Math.max(0, progress));
  const px = pad.l + innerW * t;
  const py = pad.t + innerH * (1 - (samples[Math.round(t * (samples.length - 1))]?.kmh ?? 0) / max);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      className={cn("w-full", compact ? "h-10" : "h-20", onSeek && "cursor-ew-resize")}
      aria-hidden={!onSeek}
      role={onSeek ? "slider" : undefined}
      aria-label={onSeek ? "进度" : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(t * 100)}
      onPointerDown={(e) => {
        if (!onSeek) return;
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        seekFromEvent(e);
      }}
      onPointerMove={(e) => {
        if (!onSeek || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        seekFromEvent(e);
      }}
    >
      <defs>
        <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid}-fill)`} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={compact ? 1.4 : 1.7}
        strokeLinejoin="round"
      />
      <line
        x1={px}
        x2={px}
        y1={pad.t - 2}
        y2={h - pad.b}
        stroke="var(--color-fg)"
        strokeWidth="1.2"
        strokeOpacity="0.75"
      />
      <circle cx={px} cy={py} r={compact ? 2.4 : 3} fill="var(--color-fg)" />
      {!compact && (
        <text x={w - 2} y={11} textAnchor="end" fontSize="10" fill="var(--color-subtle)">
          {max.toFixed(0)} km/h
        </text>
      )}
    </svg>
  );
}
