import { useState } from "react";
import { Bookmark, MapPin, Route, Trash2 } from "lucide-react";
import { nextPlaceName, nextRouteName } from "@/lib/bookmarks";
import { useLab } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function BookmarksSheet() {
  const open = useLab((s) => s.bookmarksOpen);
  const setOpen = useLab((s) => s.setBookmarksOpen);
  const bookmarks = useLab((s) => s.bookmarks);
  const useRoute = useLab((s) => s.useRoute);
  const jumpTo = useLab((s) => s.jumpTo);
  const removeRoute = useLab((s) => s.removeRoute);
  const removePlace = useLab((s) => s.removePlace);
  const saveCurrentRoute = useLab((s) => s.saveCurrentRoute);
  const saveCurrentPlace = useLab((s) => s.saveCurrentPlace);
  const hold = useLab((s) => s.hold);
  const stop = useLab((s) => s.stop);
  const [saving, setSaving] = useState<"route" | "place" | null>(null);
  const [name, setName] = useState("");

  const startSave = (kind: "route" | "place") => {
    setName(kind === "route" ? nextRouteName(bookmarks) : nextPlaceName(bookmarks));
    setSaving(kind);
  };

  const confirm = () => {
    if (saving === "route") saveCurrentRoute(name);
    if (saving === "place") saveCurrentPlace(name);
    setSaving(null);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="p-0">
          <SheetHeader>
            <SheetTitle>收藏夹</SheetTitle>
            <SheetDescription>路线存的是控制点，取用时可换运动模式重新规划。</SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-6 px-5 pb-8">
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.14em] text-subtle">
                  <Route className="size-3.5" /> 我的路线
                </h3>
                {bookmarks.routes.length === 0 && (
                  <p className="mb-3 text-sm text-muted">还没有收藏的路线。选点生成一条后再存。</p>
                )}
                <ul className="flex flex-col gap-1">
                  {bookmarks.routes.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-elevated">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left text-sm text-fg"
                        onClick={() => useRoute(r)}
                      >
                        <span className="block truncate">{r.name}</span>
                        <span className="text-xs text-subtle">
                          {r.points.length} 点 · {(r.distanceM / 1000).toFixed(2)} km
                        </span>
                      </button>
                      <Button size="icon-sm" variant="ghost" onClick={() => removeRoute(r.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button variant="secondary" className="mt-3 w-full" onClick={() => startSave("route")}>
                  <Bookmark className="size-3.5" /> 存当前路线
                </Button>
              </section>

              <section>
                <h3 className="mb-3 flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.14em] text-subtle">
                  <MapPin className="size-3.5" /> 我的点位
                </h3>
                {bookmarks.places.length === 0 && (
                  <p className="mb-3 text-sm text-muted">还没有收藏的点位。拖到想去的地方再存。</p>
                )}
                <ul className="flex flex-col gap-1">
                  {bookmarks.places.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-elevated">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left text-sm text-fg"
                        onClick={() => jumpTo(p)}
                      >
                        <span className="block truncate">{p.name}</span>
                        <span className="font-mono text-xs text-subtle">
                          {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                        </span>
                      </button>
                      <Button size="icon-sm" variant="ghost" onClick={() => removePlace(p.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button variant="secondary" className="mt-3 w-full" onClick={() => startSave("place")}>
                  <MapPin className="size-3.5" /> 存地图中心为点位
                </Button>
                {hold && (
                  <Button variant="danger" className="mt-2 w-full" onClick={stop}>
                    退出瞬移
                  </Button>
                )}
              </section>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={saving !== null} onOpenChange={(v) => !v && setSaving(null)}>
        <DialogContent>
          <DialogTitle>保存{saving === "route" ? "路线" : "点位"}</DialogTitle>
          <DialogDescription>
            {saving === "route" ? "同名会覆盖。存的是控制点，不是采样点。" : "点一下即可瞬移到该坐标。"}
          </DialogDescription>
          <Input className="mt-3" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSaving(null)}>
              取消
            </Button>
            <Button onClick={confirm}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
