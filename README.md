# TraceLab

轨迹规划实验室。在地图上选点、按运动学规划轨迹、回放速度曲线。

这是网页版源码，引擎与 Android 版 `TrajEngine` 对齐。浏览器**不能**写入系统 GPS。

## 给另一个 Agent（改 APK）

先读 [`给 Android 代理的说明.md`](给%20Android%20代理的说明.md)。

- **不要**用 TypeScript 替换 Kotlin 引擎
- **要抄**的是界面：地图铺满、右上仪表、底部播放条、速度曲线当进度、圆形播放键带进度环

## 网页结构

| 路径 | 作用 |
|---|---|
| `src/lib/trajectory.ts` | 规划 + 采样（对照 Kotlin TrajEngine） |
| `src/lib/geo.ts` `gcj.ts` | 球面几何、WGS84 ↔ GCJ-02 |
| `src/lib/store.ts` | 回放状态机（倍率、seek、就地重规划） |
| `src/components/lab-shell.tsx` | 主界面布局 |
| `src/components/speed-profile.tsx` | 可拖的速度曲线 |
| `src/components/map-view.tsx` | 自绘瓦片地图（APK 请继续用高德/系统地图） |
| `src/styles.css` | 色板：`#0B0D10` / 强调 `#8FBFA8` |

## 回放约定

```
simMs = simBase + (now - wallBase) * rate
```

改倍率前先冻结 `simMs`。改运动参数就地重规划时保持 `index / length`，不要回到起点。内部坐标 WGS84，只有画高德地图时才转 GCJ-02。
