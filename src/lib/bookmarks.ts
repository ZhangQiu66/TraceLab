import type { Pt } from "./geo";

const KEY = "tracelab.bookmarks.v1";

export type SavedRoute = {
  id: string;
  name: string;
  points: Pt[];
  motionId: string;
  cruiseKmh: number | null;
  autoStops: boolean;
  hz: number;
  jitter: number;
  distanceM: number;
  createdAt: number;
};

export type SavedPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  createdAt: number;
};

export type BookmarkStore = { routes: SavedRoute[]; places: SavedPlace[] };

function empty(): BookmarkStore {
  return { routes: [], places: [] };
}

export function loadBookmarks(): BookmarkStore {
  if (typeof localStorage === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as BookmarkStore;
    return {
      routes: Array.isArray(parsed.routes) ? parsed.routes : [],
      places: Array.isArray(parsed.places) ? parsed.places : [],
    };
  } catch {
    return empty();
  }
}

function write(store: BookmarkStore) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

function uid(): string {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveRoute(store: BookmarkStore, route: Omit<SavedRoute, "id" | "createdAt"> & { id?: string }): BookmarkStore {
  const next = {
    ...route,
    id: route.id || uid(),
    createdAt: Date.now(),
  };
  const routes = [next, ...store.routes.filter((r) => r.name !== next.name && r.id !== next.id)];
  const out = { ...store, routes };
  write(out);
  return out;
}

export function savePlace(store: BookmarkStore, place: Omit<SavedPlace, "id" | "createdAt"> & { id?: string }): BookmarkStore {
  const next = { ...place, id: place.id || uid(), createdAt: Date.now() };
  const places = [next, ...store.places.filter((p) => p.name !== next.name && p.id !== next.id)];
  const out = { ...store, places };
  write(out);
  return out;
}

export function deleteRoute(store: BookmarkStore, id: string): BookmarkStore {
  const out = { ...store, routes: store.routes.filter((r) => r.id !== id) };
  write(out);
  return out;
}

export function deletePlace(store: BookmarkStore, id: string): BookmarkStore {
  const out = { ...store, places: store.places.filter((p) => p.id !== id) };
  write(out);
  return out;
}

export function nextRouteName(store: BookmarkStore): string {
  return `路线 ${store.routes.length + 1}`;
}

export function nextPlaceName(store: BookmarkStore): string {
  return `点位 ${store.places.length + 1}`;
}
