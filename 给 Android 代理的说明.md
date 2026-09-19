# TraceLab 网页实验室 → 原 Android APK

这不是 APK 源码。网页版是把你原来的 Kotlin 轨迹引擎搬到浏览器里，并重做了界面。

你的 APK 里 **TrajEngine / Geo / Gcj 已经有了**，不要用 TypeScript 去替换 Kotlin 引擎。
值得搬回去的是 **界面结构和交互**。

## 对应关系

| 网页文件 | 作用 | 搬回 APK 时 |
|---|---|---|
| `src/lib/trajectory.ts` | 规划 + 采样（和 Kotlin TrajEngine 对齐） | 对照用，不要当新引擎 |
| `src/lib/geo.ts` `gcj.ts` | 球面几何、WGS84↔GCJ-02 | 你 APK 里已有 |
| `src/lib/store.ts` | 回放状态机：play/pause/seek/rate/live replan | 可对照 `simMs = simBase + (now-wallBase)*rate` |
| `src/components/lab-shell.tsx` | 主界面：地图铺满 + 浮动仪表 + 底部播放条 | **主要要抄的布局** |
| `src/components/speed-profile.tsx` | 速度曲线可拖进度 | 做成 SeekBar / Compose Canvas |
| `src/components/map-view.tsx` | 自绘瓦片地图 | APK 继续用高德/系统地图 SDK |
| `src/components/overlay-hud.tsx` | 可拖悬浮窗 | 对应你原来的 overlay |
| `src/components/params-sheet.tsx` | 运动模式、形状、倍率、图源 | 对应设置页 |
| `src/styles.css` | 色板：底 `#0B0D10`，强调 `#8FBFA8` | Compose Color / XML color |

## 界面规格（给 UI 代理直接照做）

暗色实验室，不是 Material 默认紫。

1. **地图全屏**，控件浮在上面，不要侧边栏把地图裁掉。
2. **左上**：Logo + 状态胶囊（空闲 / 回放中 / 暂停）。
3. **右上仪表卡（约 288dp）**：大字速度 km/h、航向罗盘、高度、精度、WGS84（点击复制）、跟随 / 导出。
4. **底部居中播放条（最大约 576dp）**：
   - 顶上一根可拖的速度曲线 = 进度条
   - 三栏：`[选点][生成]` | **圆形播放键（外圈进度环）** | `[停止][1/2/4/8/16×][⋯]`
   - 播放键光学居中（左右两栏等宽）
5. **⋯ 菜单**：撤销选点、从起点重来、清空、收藏、参数、跟随、悬浮窗。
6. **选点默认关闭**。打开后地图十字光标，并显示「点击地图添加途经点」。
7. 手机：右上角点速度打开底部仪表；倍率做成循环按钮。

## 回放不要写错

- 改倍率前先冻结 `simMs`，再换 `rate`，否则会跳点。
- 改运动参数就地重规划时，用当前 `index / length` 当进度，不要回到起点。
- 内部坐标 WGS84；只有画高德地图时才转 GCJ-02。

## 浏览器做不到的（APK 才做）

网页不能写入系统定位。APK 继续用 LocationManager 测试 provider / mock location。
