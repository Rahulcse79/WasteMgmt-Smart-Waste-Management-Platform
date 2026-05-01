export interface Reading {
  value: number;
  timestamp: string;
  _id?: string;
}

export interface Dustbin {
  _id: string;
  dustbinId: string;
  dustbinName: string;
  latitude: number;
  longitude: number;
  zone?: string;
  online?: boolean;
  lastSeenAt?: string;
  depth: Reading[];
  gas: Reading[];
  humidity: Reading[];
  temperature: Reading[];
  latest?: {
    depth?: number;
    gas?: number;
    humidity?: number;
    temperature?: number;
    timestamp?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

/**
 * A dustbin is active when it has emitted data within the recent activity window.
 * Falls back to backend `online` when `lastSeenAt` is absent.
 */
export function isDustbinActive(d: Pick<Dustbin, "lastSeenAt" | "online">, nowMs = Date.now()): boolean {
  if (d.lastSeenAt) {
    const seenAt = new Date(d.lastSeenAt).getTime();
    if (Number.isFinite(seenAt)) {
      return nowMs - seenAt <= ACTIVE_WINDOW_MS;
    }
  }
  return d.online !== false;
}

export interface Alert {
  _id: string;
  dustbinId: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
  acknowledged: boolean;
  createdAt: string;
}

/** Pull the latest value from a Reading[]. Falls back to `latest.*` cache. */
export function latestOf(readings: Reading[] | undefined, fallback?: number): number | undefined {
  if (readings && readings.length > 0) return readings[readings.length - 1]!.value;
  return fallback;
}

/** Marker colour by depth (fill %). Green/Yellow/Red — matches spec. */
export function fillColor(depth: number | undefined): string {
  if (depth == null) return "#9ca3af";
  if (depth >= 80) return "#ef4444";
  if (depth >= 50) return "#eab308";
  return "#22c55e";
}
