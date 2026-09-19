import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bookmark,
  Crosshair,
  Download,
  LocateFixed,
  Maximize2,
  Minus,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import { BookmarksSheet } from "@/components/bookmarks-sheet";
import { MapView } from "@/components/map-view";
import { OverlayHud } from "@/components/overlay-hud";
import { ParamsSheet } from "@/components/params-sheet";
import { SpeedProfile } from "@/components/speed-profile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { encode, PHASE_LABEL } from "@/lib/trajectory";
import { RATES, useLab } from "@/lib/store";
import { cn } from "@/lib/utils";

type PlayState = "idle" | "ready" | "playing" | "paused" | "finished" | "holding";

const STATE_COPY: Record<PlayState, string> = {
  idle: "空闲",
  ready: "就绪",
  playing: "回放中",
  paused: "已暂停",
  finished: "完成",
  holding: "瞬移",
};

function usePlayState(): PlayState {
  const playing = useLab((s) => s.playing);
  const trace = useLab((s) => s.trace);
  const index = useLab((s) => s.index);
  const hold = useLab((s) => s.hold);
  if (hold) return "holding";
  if (trace.length === 0) return "idle";
  if (playing) return "playing";
  if (index >= trace.length - 1 && trace.length > 1) return "finished";
  if (index > 0) return "paused";
  return "ready";
}

export function LabShell() {
  const hydrate = useLab((s) => s.hydrate);
  const hydrated = useLab((s) => s.hydrated);
  const tick = useLab((s) => s.tick);
  const [meterOpen, setMeterOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let id = 0;
    const loop = (now: number) => {
      tick(now);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const s = useLab.getState();
      if (e.code === "Space") {
        e.preventDefault();
        s.togglePlay();
      } else if (e.key === "g" || e.key === "G") s.generate();
      else if (e.key === "s" || e.key === "S") s.stop();
      else if (e.key === "r" || e.key === "R") s.restart();
      else if (e.key === "z" || e.key === "Z") s.undo();
      else if (e.key === "1") s.setRate(1);
      else if (e.key === "2") s.setRate(2);
      else if (e.key === "4") s.setRate(4);
      else if (e.key === "8") s.setRate(8);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hint = useLab((s) => s.hint);
  const hintAt = useLab((s) => s.hintAt);
  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => {
      if (useLab.getState().hintAt === hintAt) useLab.setState({ hint: "" });
    }, 2200);
    return () => window.clearTimeout(t);
  }, [hint, hintAt]);

  if (!hydrated) {
    return <div className="h-dvh bg-bg" />;
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-bg text-fg">
      <div className="absolute inset-0">
        <LabMap />
      </div>
      <div className="map-vignette absolute inset-0 z-10" />

      <BrandBar />
      <MobileSpeed onOpen={() => setMeterOpen(true)} />
      <aside className="pointer-events-none absolute right-3 top-3 z-20 hidden w-72 md:block md:right-4 md:top-4">
        <InstrumentCard />
      </aside>
      <ZoomStack />
      <TransportDock />
      <OverlayHud />

      <Sheet open={meterOpen} onOpenChange={setMeterOpen}>
        <SheetContent side="bottom" className="p-0 md:hidden">
          <SheetHeader>
            <SheetTitle>仪表</SheetTitle>
            <SheetDescription>当前轨迹的速度、航向与进度。</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <InstrumentBody />
          </div>
        </SheetContent>
      </Sheet>

      <ParamsSheet />
      <BookmarksSheet />
      <Toaster />
    </div>
  );
}

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-elevated)" />
      <circle cx="16" cy="16" r="7" fill="none" stroke="var(--color-accent)" strokeWidth="2.2" />
      <path
        d="M16 5 v5 M16 22 v5 M5 16 h5 M22 16 h5"
        fill="none"
        stroke="var(--color-fg)"
        strokeWidth="2"
        strokeLinecap="square"
      />
      <circle cx="16" cy="16" r="2.1" fill="var(--color-fg)" />
    </svg>
  );
}

function BrandBar() {
  const status = useLab((s) => s.status);
  const pickMode = useLab((s) => s.pickMode);
  const draft = useLab((s) => s.draft);
  const playState = usePlayState();
  const playing = playState === "playing";

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 flex w-fit max-w-xs flex-col gap-2 md:left-4 md:top-4">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl px-2.5 py-2 panel">
        <Mark />
        <div className="min-w-0 pr-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium tracking-tight">TraceLab</span>
            <span className="hidden text-2xs uppercase tracking-[0.16em] text-subtle sm:inline">实验室</span>
          </div>
          <p className="hidden truncate text-2xs text-muted sm:block">{status}</p>
        </div>
        <span
          className={cn(
            "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-medium",
            playing ? "bg-accent-dim text-accent" : "bg-elevated text-muted",
          )}
        >
          <span className={cn("size-1.5 rounded-full", playing ? "live-dot bg-accent" : "bg-subtle")} />
          {STATE_COPY[playState]}
        </span>
      </div>
      {pickMode && (
        <div className="pointer-events-none w-fit rounded-full px-3 py-1.5 text-2xs text-accent panel">
          点击地图添加途经点{draft.length > 0 ? ` · 已选 ${draft.length}` : ""}
        </div>
      )}
    </div>
  );
}

function MobileSpeed({ onOpen }: { onOpen: () => void }) {
  const lastSpeed = useLab((s) => s.lastSpeed);
  const kmh = lastSpeed * 3.6;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="absolute right-3 top-3 z-20 flex items-baseline gap-1 rounded-xl px-3 py-2 font-mono tabular-nums panel md:hidden"
      aria-label="打开仪表"
    >
      <span className="text-lg leading-none">{kmh.toFixed(1)}</span>
      <span className="text-2xs text-subtle">km/h</span>
    </button>
  );
}

function LabMap() {
  const prefs = useLab((s) => s.prefs);
  const pickMode = useLab((s) => s.pickMode);
  const follow = useLab((s) => s.follow);
  const mapCenter = useLab((s) => s.mapCenter);
  const mapZoom = useLab((s) => s.mapZoom);
  const draft = useLab((s) => s.draft);
  const route = useLab((s) => s.route);
  const stops = useLab((s) => s.stops);
  const trace = useLab((s) => s.trace);
  const index = useLab((s) => s.index);
  const lastPos = useLab((s) => s.lastPos);
  const lastBearing = useLab((s) => s.lastBearing);
  const fitNonce = useLab((s) => s.fitNonce);
  const fitPts = useLab((s) => s.fitPts);
  const places = useLab((s) => s.bookmarks.places);
  const addDraft = useLab((s) => s.addDraft);
  const setMapView = useLab((s) => s.setMapView);
  const setFollow = useLab((s) => s.setFollow);
  const hint = useLab((s) => s.hint);

  const traveled = useMemo(() => {
    if (trace.length === 0) return [];
    const step = Math.max(1, Math.floor(trace.length / 400));
    const out = [];
    for (let i = 0; i <= index; i += step) out.push({ lat: trace[i].lat, lng: trace[i].lng });
    const last = trace[Math.min(index, trace.length - 1)];
    if (last) out.push({ lat: last.lat, lng: last.lng });
    return out;
  }, [trace, index]);

  const pins = useMemo(() => places.map((p) => ({ pt: { lat: p.lat, lng: p.lng }, label: p.name })), [places]);
  const onPick = useCallback((p: { lat: number; lng: number }) => addDraft(p), [addDraft]);
  const onView = useCallback((c: { lat: number; lng: number }, z: number) => setMapView(c, z), [setMapView]);

  return (
    <>
      <MapView
        source={prefs.tileSource}
        pickMode={pickMode}
        follow={follow}
        center={lastPos && follow ? lastPos : mapCenter}
        zoom={mapZoom}
        draft={draft}
        route={route}
        traveled={traveled}
        stops={stops}
        pins={pins}
        cursor={lastPos}
        heading={lastBearing}
        fitNonce={fitNonce}
        fitPts={fitPts}
        onPick={onPick}
        onViewChange={onView}
        onUserPan={() => setFollow(false)}
      />
      {hint && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center px-4 md:top-4">
          <span className="rounded-full px-3 py-1.5 text-xs text-accent panel">{hint}</span>
        </div>
      )}
    </>
  );
}

function InstrumentCard() {
  return (
    <div className="pointer-events-auto w-full rounded-xl panel">
      <InstrumentBody />
    </div>
  );
}

function InstrumentBody() {
  const stats = useLab((s) => s.stats);
  const index = useLab((s) => s.index);
  const trace = useLab((s) => s.trace);
  const lastSpeed = useLab((s) => s.lastSpeed);
  const lastPos = useLab((s) => s.lastPos);
  const lastPhase = useLab((s) => s.lastPhase);
  const lastAlt = useLab((s) => s.lastAlt);
  const lastAcc = useLab((s) => s.lastAcc);
  const lastBearing = useLab((s) => s.lastBearing);
  const motionLabel = useLab((s) => s.motionLabel);
  const shapeLabel = useLab((s) => s.shapeLabel);
  const follow = useLab((s) => s.follow);
  const setFollow = useLab((s) => s.setFollow);
  const flash = useLab((s) => s.flash);
  const progress = trace.length > 1 ? index / (trace.length - 1) : 0;
  const phase = (PHASE_LABEL as Record<string, string>)[lastPhase] ?? lastPhase;
  const kmh = lastSpeed * 3.6;
  const elapsed = (trace[index]?.dtMs ?? 0) / 1000;

  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-2xs uppercase tracking-[0.16em] text-subtle">速度</p>
          <div className="mt-1 flex items-end gap-1.5">
            <span className="font-mono text-4xl font-medium leading-none tracking-tight tabular-nums">
              {kmh.toFixed(1)}
            </span>
            <span className="mb-0.5 text-xs text-subtle">km/h</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>{phase || "待命"}</span>
            <span className="font-mono tabular-nums">
              {index}/{trace.length || 0}
            </span>
          </div>
        </div>
        <HeadingDial deg={lastBearing} />
      </div>

      <div className="px-4 pb-3">
        <div className="h-1 overflow-hidden rounded-full bg-elevated">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-[var(--motion-quick)]"
            style={{ width: `${Math.round(progress * 1000) / 10}%` }}
          />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-3">
        <MiniStat label="航向" value={`${lastBearing.toFixed(0)}°`} />
        <MiniStat label="高度" value={`${lastAlt.toFixed(0)} m`} />
        <MiniStat label="精度" value={lastAcc > 0 ? `±${lastAcc.toFixed(1)}` : "—"} />
      </div>

      <Separator />

      <div className="space-y-1 px-4 py-3 text-xs text-muted">
        {stats && (
          <p className="truncate font-mono tabular-nums text-fg">
            {(stats.distanceM / 1000).toFixed(2)} km · {fmtDur(elapsed)} / {fmtDur(stats.durationS)}
          </p>
        )}
        <p className="truncate text-subtle">
          {motionLabel}
          {shapeLabel ? ` · ${shapeLabel}` : ""}
          {stats ? ` · ${stats.stopCount} 次停车` : ""}
        </p>
        {lastPos && (
          <button
            type="button"
            className="block w-full truncate text-left font-mono text-2xs tabular-nums text-muted hover:text-fg"
            onClick={() => {
              const t = `${lastPos.lat.toFixed(6)}, ${lastPos.lng.toFixed(6)}`;
              navigator.clipboard?.writeText(t).then(
                () => flash("已复制 WGS84 坐标"),
                () => flash(t),
              );
            }}
          >
            {lastPos.lat.toFixed(5)}, {lastPos.lng.toFixed(5)}
          </button>
        )}
      </div>

      <div className="flex gap-2 px-3 pb-3">
        <Button
          variant={follow ? "accent" : "secondary"}
          size="sm"
          className="flex-1"
          onClick={() => setFollow(!follow)}
        >
          <LocateFixed className="size-3.5" /> 跟随
        </Button>
        <ExportButton />
      </div>
    </div>
  );
}

function HeadingDial({ deg }: { deg: number }) {
  const ticks = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <div className="relative size-16 shrink-0" aria-label={`航向 ${deg.toFixed(0)} 度`}>
      <svg viewBox="0 0 64 64" className="size-16">
        <circle cx="32" cy="32" r="30" fill="var(--color-elevated)" />
        <circle cx="32" cy="32" r="30" fill="none" stroke="var(--color-line)" strokeWidth="1" />
        <g transform={`rotate(${-deg} 32 32)`}>
          {ticks.map((t) => (
            <line
              key={t}
              x1="32"
              y1="3.5"
              x2="32"
              y2={t % 90 === 0 ? "11" : "8"}
              stroke={t === 0 ? "var(--color-accent)" : "var(--color-muted)"}
              strokeWidth={t % 90 === 0 ? 1.8 : 1}
              transform={`rotate(${t} 32 32)`}
            />
          ))}
          <text
            x="32"
            y="18"
            textAnchor="middle"
            fontSize="8"
            fontWeight="600"
            fill="var(--color-accent)"
          >
            N
          </text>
        </g>
        <polygon points="32,5 34.6,12 29.4,12" fill="var(--color-fg)" />
        <circle cx="32" cy="32" r="2.2" fill="var(--color-fg)" />
      </svg>
    </div>
  );
}

function ZoomStack() {
  const zoom = useLab((s) => s.mapZoom);
  const center = useLab((s) => s.mapCenter);
  const lastPos = useLab((s) => s.lastPos);
  const follow = useLab((s) => s.follow);
  const setMapView = useLab((s) => s.setMapView);
  const requestFit = useLab((s) => s.requestFit);
  const c = follow && lastPos ? lastPos : center;
  return (
    <div className="absolute bottom-36 left-3 z-20 flex flex-col overflow-hidden rounded-lg panel md:bottom-6 md:left-4">
      <Tip label="放大">
        <button
          type="button"
          className="flex size-11 items-center justify-center text-fg hover:bg-elevated"
          onClick={() => setMapView(c, Math.min(18, zoom + 1))}
          aria-label="放大"
        >
          <Plus className="size-4" />
        </button>
      </Tip>
      <div className="h-px bg-line" />
      <Tip label="缩小">
        <button
          type="button"
          className="flex size-11 items-center justify-center text-fg hover:bg-elevated"
          onClick={() => setMapView(c, Math.max(3, zoom - 1))}
          aria-label="缩小"
        >
          <Minus className="size-4" />
        </button>
      </Tip>
      <div className="h-px bg-line" />
      <Tip label="全览路线">
        <button
          type="button"
          className="flex size-11 items-center justify-center text-fg hover:bg-elevated"
          onClick={() => requestFit()}
          aria-label="全览"
        >
          <Maximize2 className="size-4" />
        </button>
      </Tip>
    </div>
  );
}

function TransportDock() {
  const pickMode = useLab((s) => s.pickMode);
  const setPickMode = useLab((s) => s.setPickMode);
  const playing = useLab((s) => s.playing);
  const togglePlay = useLab((s) => s.togglePlay);
  const generate = useLab((s) => s.generate);
  const stop = useLab((s) => s.stop);
  const draft = useLab((s) => s.draft);
  const trace = useLab((s) => s.trace);
  const index = useLab((s) => s.index);
  const profile = useLab((s) => s.profile);
  const rate = useLab((s) => s.prefs.rate);
  const setRate = useLab((s) => s.setRate);
  const cycleRate = useLab((s) => s.cycleRate);
  const seek = useLab((s) => s.seek);
  const tile = useLab((s) => s.prefs.tileSource);
  const progress = trace.length > 1 ? index / (trace.length - 1) : 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 pb-14 md:p-4 md:pb-4">
      <div className="pointer-events-auto w-full max-w-xl">
        <div className="overflow-hidden rounded-xl panel">
          <div className="px-2 pt-1">
            <SpeedProfile samples={profile} progress={progress} onSeek={seek} compact />
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 px-1.5 pb-1.5">
            <div className="flex items-center gap-1">
              <Tip label={pickMode ? "关闭选点" : "选点"}>
                <Button
                  size="sm"
                  variant={pickMode ? "accent" : "ghost"}
                  className="h-11 min-w-11"
                  onClick={() => setPickMode(!pickMode)}
                >
                  <Crosshair className="size-4" />
                  <span className="hidden sm:inline">{pickMode ? "选点中" : "选点"}</span>
                </Button>
              </Tip>
              <Tip label="生成轨迹 G">
                <Button
                  size="sm"
                  variant={draft.length >= 2 ? "secondary" : "ghost"}
                  className="h-11"
                  onClick={() => generate()}
                >
                  生成
                </Button>
              </Tip>
            </div>

            <PlayKnob
              playing={playing}
              progress={progress}
              disabled={trace.length < 2}
              onClick={togglePlay}
            />

            <div className="flex items-center justify-end gap-0.5">
              <Tip label="停止 S">
                <Button size="sm" variant="ghost" className="h-11 min-w-11" onClick={stop}>
                  <Square className="size-4" />
                  <span className="hidden sm:inline">停止</span>
                </Button>
              </Tip>
              <button
                type="button"
                onClick={cycleRate}
                className="h-11 min-w-11 rounded-md px-2 font-mono text-2xs tabular-nums text-muted hover:bg-elevated hover:text-fg md:hidden"
                aria-label="切换倍率"
              >
                {rate}×
              </button>
              <div className="hidden rounded-md bg-elevated p-0.5 md:flex">
                {RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRate(r)}
                    className={cn(
                      "h-10 min-w-9 rounded-sm px-2 font-mono text-2xs tabular-nums transition-colors",
                      rate === r ? "bg-primary text-primary-fg" : "text-muted hover:text-fg",
                    )}
                  >
                    {r}×
                  </button>
                ))}
              </div>
              <MoreMenu />
            </div>
          </div>
        </div>
        <p className="mt-1.5 px-1 text-center text-micro text-muted/80">
          {tile === "amap" ? "高德 · GCJ-02" : tile === "osm" ? "© OpenStreetMap" : "© CARTO · © OSM"}
          {" · 浏览器预览，不会写入系统定位"}
        </p>
      </div>
    </div>
  );
}

function PlayKnob({
  playing,
  progress,
  disabled,
  onClick,
}: {
  playing: boolean;
  progress: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const t = Math.min(1, Math.max(0, progress));
  return (
    <Tip label={playing ? "暂停 空格" : "开始 空格"}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-label={playing ? "暂停" : "开始"}
        className={cn(
          "relative mx-auto flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg",
          "transition-transform duration-[var(--motion-quick)] ease-[var(--ease-out)]",
          "hover:bg-primary/90 active:scale-[0.96] disabled:opacity-40",
        )}
      >
        <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            stroke="var(--color-primary-fg)"
            strokeOpacity="0.18"
            strokeWidth="2"
          />
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - t)}
          />
        </svg>
        <span className="relative">
          {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
        </span>
      </button>
    </Tip>
  );
}

function MoreMenu() {
  const undo = useLab((s) => s.undo);
  const clear = useLab((s) => s.clear);
  const restart = useLab((s) => s.restart);
  const draft = useLab((s) => s.draft);
  const trace = useLab((s) => s.trace);
  const overlay = useLab((s) => s.overlay);
  const setOverlay = useLab((s) => s.setOverlay);
  const follow = useLab((s) => s.follow);
  const setFollow = useLab((s) => s.setFollow);
  const setParamsOpen = useLab((s) => s.setParamsOpen);
  const setBookmarksOpen = useLab((s) => s.setBookmarksOpen);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-11 min-w-11" aria-label="更多">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-48">
        <DropdownMenuItem onSelect={undo} disabled={!draft.length}>
          <Undo2 className="size-3.5" /> 撤销选点
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={restart} disabled={trace.length < 2}>
          <RotateCcw className="size-3.5" /> 从起点重来
        </DropdownMenuItem>
        <DropdownMenuItem danger onSelect={clear}>
          <Trash2 className="size-3.5" /> 清空
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setBookmarksOpen(true)}>
          <Bookmark className="size-3.5" /> 收藏夹
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setParamsOpen(true)}>
          <Settings2 className="size-3.5" /> 轨迹参数
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={follow} onCheckedChange={(v) => setFollow(!!v)}>
          跟随镜头
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={overlay} onCheckedChange={(v) => setOverlay(!!v)}>
          悬浮窗
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            const a = document.createElement("a");
            a.href = "/TraceLab-web-src.zip";
            a.download = "TraceLab-web-src.zip";
            a.click();
          }}
        >
          <Download className="size-3.5" /> 下载源码
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-micro uppercase tracking-[0.14em] text-subtle">{label}</div>
      <div className="mt-0.5 font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}′${sec.toString().padStart(2, "0")}″` : `${sec}″`;
}

function ExportButton() {
  const trace = useLab((s) => s.trace);
  const flash = useLab((s) => s.flash);
  return (
    <Button
      size="sm"
      variant="secondary"
      className="flex-1"
      disabled={trace.length < 2}
      onClick={() => {
        const blob = new Blob([JSON.stringify({ points: encode(trace) })], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "tracelab-trace.json";
        a.click();
        URL.revokeObjectURL(a.href);
        flash("已导出轨迹 JSON");
      }}
    >
      <Download className="size-3.5" /> 导出
    </Button>
  );
}
