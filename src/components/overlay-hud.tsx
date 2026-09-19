import { useRef, type ReactNode } from "react";
import { Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { useLab } from "@/lib/store";
import { cn } from "@/lib/utils";

export function OverlayHud() {
  const overlay = useLab((s) => s.overlay);
  const lastSpeed = useLab((s) => s.lastSpeed);
  const index = useLab((s) => s.index);
  const trace = useLab((s) => s.trace);
  const playing = useLab((s) => s.playing);
  const rate = useLab((s) => s.prefs.rate);
  const loop = useLab((s) => s.prefs.loop);
  const hold = useLab((s) => s.hold);
  const togglePlay = useLab((s) => s.togglePlay);
  const restart = useLab((s) => s.restart);
  const stop = useLab((s) => s.stop);
  const cycleRate = useLab((s) => s.cycleRate);
  const setPrefs = useLab((s) => s.setPrefs);
  const setOverlay = useLab((s) => s.setOverlay);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);

  if (!overlay) return null;
  const n = Math.max(trace.length - 1, 1);
  const pct = hold ? 0 : Math.round((index / n) * 1000) / 10;
  const kmh = lastSpeed * 3.6;

  return (
    <div
      ref={root}
      className="absolute left-4 top-20 z-30 w-56 rounded-xl p-3 panel md:top-24"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        const el = root.current!;
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          l: el.offsetLeft,
          t: el.offsetTop,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current || !root.current) return;
        const parent = root.current.offsetParent as HTMLElement;
        const nx = drag.current.l + (e.clientX - drag.current.x);
        const ny = drag.current.t + (e.clientY - drag.current.y);
        root.current.style.left = `${Math.max(8, Math.min(nx, parent.clientWidth - 80))}px`;
        root.current.style.top = `${Math.max(8, Math.min(ny, parent.clientHeight - 80))}px`;
        root.current.style.right = "auto";
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-2xs uppercase tracking-[0.16em] text-subtle">悬浮窗</span>
        <span className="ml-auto font-mono text-xl tabular-nums leading-none text-fg">{kmh.toFixed(1)}</span>
        <span className="text-2xs text-subtle">km/h</span>
        <button type="button" className="text-muted hover:text-fg" onClick={() => setOverlay(false)} aria-label="关闭悬浮窗">
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mb-2 truncate text-2xs text-muted">
        {hold ? `瞬移 · ${hold.name}` : playing ? "回放中" : "暂停"} · {index}/{trace.length} · {rate}×
      </p>
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-[var(--motion-quick)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid grid-cols-4 gap-1">
        <HudChip onClick={togglePlay}>
          {playing ? <Pause className="size-3.5" /> : <Play className="ml-px size-3.5" />}
        </HudChip>
        <HudChip onClick={restart}>
          <RotateCcw className="size-3.5" />
        </HudChip>
        <HudChip onClick={stop}>
          <Square className="size-3.5" />
        </HudChip>
        <HudChip onClick={() => setPrefs({ loop: !loop })} active={loop}>
          循环
        </HudChip>
      </div>
      <button
        type="button"
        className="mt-2 h-8 w-full rounded-md bg-elevated text-2xs text-muted hover:text-fg"
        onClick={cycleRate}
      >
        倍率 {rate}×
      </button>
    </div>
  );
}

function HudChip({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center justify-center rounded-md text-2xs",
        active ? "bg-primary text-primary-fg" : "bg-elevated text-fg hover:bg-elevated/80",
      )}
    >
      {children}
    </button>
  );
}
