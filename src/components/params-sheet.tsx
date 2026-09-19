import type { ReactNode } from "react";
import { MOTIONS, SHAPES, type ShapeId } from "@/lib/trajectory";
import { RATES, type TileSource, useLab } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-md px-2.5 text-xs transition-colors",
        active ? "bg-primary text-primary-fg" : "bg-elevated text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

export function ParamsSheet() {
  const open = useLab((s) => s.paramsOpen);
  const setOpen = useLab((s) => s.setParamsOpen);
  const prefs = useLab((s) => s.prefs);
  const setPrefs = useLab((s) => s.setPrefs);
  const setRate = useLab((s) => s.setRate);
  const applyLive = useLab((s) => s.applyLive);
  const mapCenter = useLab((s) => s.mapCenter);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="p-0">
        <SheetHeader>
          <SheetTitle>轨迹参数</SheetTitle>
          <SheetDescription>改倍率立即生效；改运动模式会就地重新规划并保持进度。</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 px-5 pb-8">
            <section className="flex flex-col gap-2">
              <Label>运动模式</Label>
              <div className="flex flex-wrap gap-1.5">
                {MOTIONS.map((m) => (
                  <Chip
                    key={m.id}
                    active={prefs.motionId === m.id}
                    onClick={() => setPrefs({ motionId: m.id })}
                  >
                    {m.label}
                  </Chip>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <Label>巡航速度 km/h（留空 = 模式默认）</Label>
              <Input
                inputMode="decimal"
                value={prefs.cruiseKmh}
                placeholder="默认"
                onChange={(e) => setPrefs({ cruiseKmh: e.target.value })}
              />
            </section>

            <section className="flex items-center justify-between">
              <div>
                <Label>自动停车</Label>
                <p className="mt-1 text-xs text-muted">红绿灯 / 站点</p>
              </div>
              <Switch
                checked={prefs.autoStops}
                onCheckedChange={(v) => setPrefs({ autoStops: v })}
              />
            </section>

            <section className="flex flex-col gap-2">
              <Label>路径形状（没有手绘选点时用）</Label>
              <div className="flex flex-wrap gap-1.5">
                {SHAPES.map((s) => (
                  <Chip
                    key={s.id}
                    active={prefs.shape === s.id}
                    onClick={() => setPrefs({ shape: s.id as ShapeId })}
                  >
                    {s.label}
                  </Chip>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>形状参数 1</Label>
                <Input value={prefs.p1} onChange={(e) => setPrefs({ p1: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>形状参数 2</Label>
                <Input value={prefs.p2} onChange={(e) => setPrefs({ p2: e.target.value })} />
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <Label>起点 / 终点</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={prefs.origin.lat}
                  onChange={(e) =>
                    setPrefs({ origin: { ...prefs.origin, lat: Number(e.target.value) || 0 } })
                  }
                />
                <Input
                  value={prefs.origin.lng}
                  onChange={(e) =>
                    setPrefs({ origin: { ...prefs.origin, lng: Number(e.target.value) || 0 } })
                  }
                />
                <Input
                  value={prefs.dest.lat}
                  onChange={(e) =>
                    setPrefs({ dest: { ...prefs.dest, lat: Number(e.target.value) || 0 } })
                  }
                />
                <Input
                  value={prefs.dest.lng}
                  onChange={(e) =>
                    setPrefs({ dest: { ...prefs.dest, lng: Number(e.target.value) || 0 } })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPrefs({ origin: { ...mapCenter } })}
                >
                  起点 = 地图中心
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPrefs({ dest: { ...mapCenter } })}
                >
                  终点 = 地图中心
                </Button>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <Label>图源</Label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["carto", "Carto 暗色"],
                    ["amap", "高德"],
                    ["osm", "OSM"],
                  ] as [TileSource, string][]
                ).map(([id, label]) => (
                  <Chip key={id} active={prefs.tileSource === id} onClick={() => setPrefs({ tileSource: id })}>
                    {label}
                  </Chip>
                ))}
              </div>
              <p className="text-xs text-subtle">高德为 GCJ-02，内部数据仍是 WGS84。</p>
            </section>

            <section className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>采样率 Hz</Label>
                <Input
                  inputMode="decimal"
                  value={prefs.hz}
                  onChange={(e) => setPrefs({ hz: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>定位抖动 m</Label>
                <Input
                  inputMode="decimal"
                  value={prefs.jitter}
                  onChange={(e) => setPrefs({ jitter: Number(e.target.value) || 0 })}
                />
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <Label>回放倍率</Label>
              <div className="flex flex-wrap gap-1.5">
                {RATES.map((r) => (
                  <Chip key={r} active={prefs.rate === r} onClick={() => setRate(r)}>
                    {r}×
                  </Chip>
                ))}
              </div>
            </section>

            <section className="flex items-center justify-between">
              <div>
                <Label>原地循环</Label>
                <p className="mt-1 text-xs text-muted">走完自动从起点再来</p>
              </div>
              <Switch checked={prefs.loop} onCheckedChange={(v) => setPrefs({ loop: v })} />
            </section>

            <Button onClick={() => { applyLive(); setOpen(false); }}>立即应用并重规划</Button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
