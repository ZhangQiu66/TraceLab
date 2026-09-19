import type { Pt } from "./geo";

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

export function outOfChina(lat: number, lon: number): boolean {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
  ret += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
  return ret;
}

function transformLon(x: number, y: number): number {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
  ret += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x * PI) / 30)) * 2) / 3;
  return ret;
}

export function wgs84ToGcj02(p: Pt): Pt {
  if (outOfChina(p.lat, p.lng)) return p;
  let dLat = transformLat(p.lng - 105, p.lat - 35);
  let dLon = transformLon(p.lng - 105, p.lat - 35);
  const radLat = (p.lat / 180) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLon = (dLon * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { lat: p.lat + dLat, lng: p.lng + dLon };
}

export function gcj02ToWgs84(p: Pt): Pt {
  if (outOfChina(p.lat, p.lng)) return p;
  let guess = p;
  for (let i = 0; i < 2; i++) {
    const g = wgs84ToGcj02(guess);
    guess = { lat: guess.lat + (p.lat - g.lat), lng: guess.lng + (p.lng - g.lng) };
  }
  return guess;
}
